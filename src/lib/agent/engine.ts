import type { Content, Part } from "@google/genai";
import { and, asc, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  customers,
  faqs,
  lessons,
  messages,
  objections,
  orders,
  paymentMethods,
  platformSettings,
  products,
  tenants,
  type Attachment,
  type Channel,
  type Customer,
  type CustomerProfile,
  type Message,
  type Order,
  type OrderItem,
  type Tenant,
} from "@/db/schema";
import { toUnicode } from "@/lib/myanmar";
import { resolveSettings, type HandoffTrigger, type TenantSettings } from "@/lib/settings";
import { minutes, sleep } from "@/lib/time";
import { randomCode } from "@/lib/crypto";
import { getChannel, messengerFor, sendToCustomer, telegramFor } from "@/lib/channels/outbound";
import { notifyAdmins, signedMediaUrl } from "@/lib/notify";
import { generate, platformModels } from "./gemini";
import { buildSystemPrompt, effectivePrice, REPLY_SCHEMA, type AgentReply, type Knowledge } from "./prompt";

/* ───────────── Ingest ───────────── */

export type Inbound = {
  tenant: Tenant;
  channel: Channel | null;
  channelType: "telegram" | "messenger" | "test";
  externalUserId: string;
  displayName?: string;
  text: string;
  attachments?: Attachment[];
  externalMessageId?: string;
  at?: Date;
};

/** Stores an incoming customer message. Returns null for duplicates. */
export async function ingestInbound(m: Inbound): Promise<{ customer: Customer; message: Message } | null> {
  if (m.externalMessageId) {
    const [dup] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.tenantId, m.tenant.id), eq(messages.externalId, m.externalMessageId)))
      .limit(1);
    if (dup) return null;
  }
  const { text, wasZawgyi } = toUnicode(m.text ?? "");
  const at = m.at ?? new Date();

  const [customer] = await db
    .insert(customers)
    .values({
      tenantId: m.tenant.id,
      channelId: m.channel?.id ?? null,
      channelType: m.channelType,
      externalId: m.externalUserId,
      displayName: m.displayName ?? "",
      lastInboundAt: at,
      unanswered: true,
    })
    .onConflictDoUpdate({
      target: [customers.tenantId, customers.channelType, customers.externalId],
      set: {
        lastInboundAt: sql`greatest(${customers.lastInboundAt}, ${at.toISOString()}::timestamptz)`,
        unanswered: true,
        followupStep: 0,
        updatedAt: new Date(),
        ...(m.displayName ? { displayName: m.displayName } : {}),
        ...(m.channel ? { channelId: m.channel.id } : {}),
      },
    })
    .returning();

  const [message] = await db
    .insert(messages)
    .values({
      tenantId: m.tenant.id,
      customerId: customer.id,
      direction: "in",
      sender: "customer",
      text,
      attachments: m.attachments ?? [],
      externalId: m.externalMessageId ?? null,
      meta: wasZawgyi ? { zawgyi: true, original: m.text } : {},
      createdAt: at,
    })
    .onConflictDoNothing()
    .returning();
  if (!message) return null; // duplicate delivery

  // While a human is handling this customer, forward the new message to admins so they can reply from Telegram.
  if (customer.needsHuman && customer.botPausedUntil && new Date(customer.botPausedUntil) > new Date()) {
    await notifyAdmins(m.tenant, "message", {
      text: `💬 ${customer.name || customer.displayName || "Customer"}: ${text || "(ပုံ/ဖိုင်)"}\n\n↩️ ဒီစာကို Reply ပြန်ရင် Customer ဆီ ရောက်ပါမယ်`,
      customerId: customer.id,
      photoUrl: m.attachments?.some((a) => a.type === "image") ? signedMediaUrl(message.id, 0) : undefined,
    });
  }
  return { customer, message };
}

/**
 * Waits a few seconds so that bursts of messages ("hi" / "price?" / "how to buy")
 * are answered together, then processes the customer if no newer message arrived.
 */
export async function debounceAndProcess(customerId: string, messageId: string, delaySeconds: number) {
  await sleep(Math.max(0, delaySeconds) * 1000);
  const [latest] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.customerId, customerId), eq(messages.direction, "in")))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (latest && latest.id !== messageId) return; // a newer message will trigger processing
  await processCustomer(customerId);
}

/* ───────────── Serving checks ───────────── */

export async function tenantServing(t: Tenant) {
  if (t.status !== "active" || !t.botEnabled) return false;
  if (t.expiresAt) {
    const graceEnd = new Date(t.expiresAt).getTime() + t.graceDays * 86_400_000;
    if (Date.now() > graceEnd) return false;
  }
  const [p] = await db.select({ g: platformSettings.globalPause }).from(platformSettings).limit(1);
  return !p?.g;
}

export function botPaused(c: Customer) {
  return !!c.botPausedUntil && new Date(c.botPausedUntil) > new Date();
}

async function acquireLock(customerId: string) {
  const r = await db
    .update(customers)
    .set({ processingUntil: new Date(Date.now() + 90_000) })
    .where(and(eq(customers.id, customerId), or(isNull(customers.processingUntil), lt(customers.processingUntil, new Date()))))
    .returning({ id: customers.id });
  return r.length > 0;
}
async function releaseLock(customerId: string) {
  await db.update(customers).set({ processingUntil: null }).where(eq(customers.id, customerId));
}

/* ───────────── Knowledge ───────────── */

export async function loadKnowledge(tenantId: string): Promise<Knowledge> {
  const [p, f, o, pm, l] = await Promise.all([
    db.select().from(products).where(and(eq(products.tenantId, tenantId), eq(products.active, true))).orderBy(asc(products.sortOrder), asc(products.createdAt)),
    db.select().from(faqs).where(eq(faqs.tenantId, tenantId)),
    db.select().from(objections).where(eq(objections.tenantId, tenantId)),
    db.select().from(paymentMethods).where(and(eq(paymentMethods.tenantId, tenantId), eq(paymentMethods.active, true))).orderBy(asc(paymentMethods.sortOrder)),
    db
      .select()
      .from(lessons)
      .where(and(eq(lessons.tenantId, tenantId), eq(lessons.status, "approved"), inArray(lessons.kind, ["insight", "style"])))
      .orderBy(desc(lessons.createdAt))
      .limit(30),
  ]);
  return { products: p, faqs: f, objections: o, payments: pm, lessons: l };
}

export async function openOrderFor(customerId: string) {
  const [o] = await db
    .select()
    .from(orders)
    .where(and(eq(orders.customerId, customerId), inArray(orders.status, ["awaiting_payment", "payment_submitted"])))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return o ?? null;
}

/* ───────────── History → Gemini contents ───────────── */

async function attachmentPart(customer: Customer, a: Attachment): Promise<Part | null> {
  if (a.type !== "image") return null;
  try {
    let data: Buffer;
    let mime = a.mime ?? "image/jpeg";
    if (customer.channelType === "telegram") {
      const ch = await getChannel(customer.channelId);
      if (!ch) return null;
      const f = await telegramFor(ch).downloadFile(a.ref);
      data = f.data;
      mime = f.mime;
    } else {
      const res = await fetch(a.blobUrl ?? a.ref);
      if (!res.ok) return null;
      data = Buffer.from(await res.arrayBuffer());
      mime = res.headers.get("content-type")?.split(";")[0] || mime;
    }
    if (data.length > 6_000_000) return null;
    return { inlineData: { mimeType: mime, data: data.toString("base64") } };
  } catch (e) {
    console.error("attachment download failed", e);
    return null;
  }
}

export async function historyContents(customer: Customer, limit: number, withImagesFor: Set<string>): Promise<Content[]> {
  const rows = (
    await db.select().from(messages).where(eq(messages.customerId, customer.id)).orderBy(desc(messages.createdAt)).limit(limit)
  ).reverse();
  const out: Content[] = [];
  for (const m of rows) {
    const parts: Part[] = [];
    if (m.direction === "in") {
      if (m.text) parts.push({ text: m.text });
      for (const a of m.attachments) {
        if (withImagesFor.has(m.id)) {
          const p = await attachmentPart(customer, a);
          if (p) {
            parts.push(p);
            continue;
          }
        }
        parts.push({ text: `[customer sent a ${a.type}]` });
      }
      if (parts.length) out.push({ role: "user", parts });
    } else {
      if (m.sender === "system") continue;
      const label = m.sender === "human" ? "[Reply written by a human admin of the business] " : "";
      const t = m.text || (m.attachments.length ? "[sent a photo]" : "");
      if (t) out.push({ role: "model", parts: [{ text: label + t }] });
    }
  }
  return out;
}

/* ───────────── Main processing ───────────── */

export async function processCustomer(customerId: string, opts: { force?: boolean } = {}) {
  if (!(await acquireLock(customerId))) return { skipped: "locked" as const };
  try {
    for (let round = 0; round < 3; round++) {
      const pending = await db
        .select()
        .from(messages)
        .where(and(eq(messages.customerId, customerId), eq(messages.direction, "in"), eq(messages.handled, false)))
        .orderBy(asc(messages.createdAt));
      if (!pending.length) break;
      await handleTurn(customerId, pending, opts);
    }
    return { skipped: null };
  } finally {
    await releaseLock(customerId);
  }
}

async function markHandled(ids: string[]) {
  if (ids.length) await db.update(messages).set({ handled: true }).where(inArray(messages.id, ids));
}

async function handleTurn(customerId: string, pending: Message[], opts: { force?: boolean }) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, customer.tenantId)).limit(1);
  const s = resolveSettings(tenant.settings);
  const pendingIds = pending.map((m) => m.id);

  const paused = botPaused(customer);
  const answerDuringPause = paused && (await shouldAnswerDuringPause(s, customer));
  if (!opts.force && (!(await tenantServing(tenant)) || (paused && !answerDuringPause))) {
    await markHandled(pendingIds); // stays "unanswered" for humans in the inbox
    return;
  }

  // Keyword triggers → immediate handoff without calling the AI.
  const combined = pending.map((m) => m.text).join("\n").toLowerCase();
  const kw = s.handoff.enabled ? s.handoff.keywords.find((k) => k.trim() && combined.includes(k.trim().toLowerCase())) : undefined;
  if (kw && !s.alwaysOn.enabled) {
    await markHandled(pendingIds);
    await startHandoff(tenant, s, customer, "custom", `Keyword: “${kw}”`, combined);
    return;
  }
  if (kw && !answerDuringPause) {
    // 24/7: alert the admin about the keyword, then keep answering below.
    await startHandoff(tenant, s, customer, "custom", `Keyword: “${kw}”`, combined, { silent: true });
  }

  const knowledge = await loadKnowledge(tenant.id);
  const openOrder = await openOrderFor(customer.id);
  const imageIds = new Set(pending.filter((m) => m.attachments.some((a) => a.type === "image")).slice(-2).map((m) => m.id));
  const contents = await historyContents(customer, s.ai.historyMessages, imageIds);
  const models = await platformModels();

  let r: AgentReply;
  try {
    r = await generate<AgentReply>({
      tenantId: tenant.id,
      model: s.ai.chatModel || models.chat,
      fallbackModel: models.lite,
      purpose: "chat",
      system: buildSystemPrompt(tenant, s, knowledge, customer, openOrder, { duringHandoff: answerDuringPause || (opts.force === true && paused) }),
      contents,
      schema: REPLY_SCHEMA,
      temperature: s.ai.temperature,
      thinkingLevel: s.ai.thinkingLevel,
    });
  } catch (e) {
    console.error("AI failed", e);
    if (s.alwaysOn.enabled) {
      // 24/7: never go silent. Leave the messages unhandled so the sweeper retries,
      // and send one short holding message (at most once per 10 minutes).
      await sendHoldingMessage(s, customer);
      return;
    }
    await markHandled(pendingIds);
    await startHandoff(tenant, s, customer, "uncertain", "AI error — ယာယီ ဖြေမရဖြစ်နေပါတယ်", combined, { silent: true });
    return;
  }

  await markHandled(pendingIds);
  await applyReply(tenant, s, customer, knowledge, openOrder, r, pending, { duringHandoff: answerDuringPause });
}

/**
 * 24/7 mode: while a handoff is open the AI still answers, unless an admin paused the bot
 * on purpose or a human replied to this customer within the grace period.
 */
async function shouldAnswerDuringPause(s: TenantSettings, customer: Customer) {
  if (!s.alwaysOn.enabled) return false;
  if (customer.handoffReason === ADMIN_PAUSE_REASON) return false;
  const since = new Date(Date.now() - minutes(Math.max(1, s.alwaysOn.humanGraceMinutes)));
  const [recentHuman] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.customerId, customer.id), eq(messages.sender, "human"), gt(messages.createdAt, since)))
    .limit(1);
  return !recentHuman;
}

export const ADMIN_PAUSE_REASON = "Admin က ရပ်ထားသည်";

async function sendHoldingMessage(s: TenantSettings, customer: Customer) {
  const [recent] = await db
    .select({ id: messages.id })
    .from(messages)
    .where(and(eq(messages.customerId, customer.id), eq(messages.direction, "out"), gt(messages.createdAt, new Date(Date.now() - minutes(10)))))
    .limit(1);
  if (recent) return;
  const p = s.persona.politeParticle;
  await sendToCustomer(customer, [`ခဏလေးနော်${p}၊ သေချာစစ်ပြီး ချက်ချင်း ပြန်ဖြေပေးပါမယ်${p}့။`], { sender: "bot", meta: { holding: true } });
}

const trig = (s: TenantSettings, t: HandoffTrigger) => s.handoff.enabled && s.handoff.triggers[t];

export async function applyReply(
  tenant: Tenant,
  s: TenantSettings,
  customer: Customer,
  knowledge: Knowledge,
  openOrder: Order | null,
  r: AgentReply,
  pending: Message[],
  ctx: { duringHandoff?: boolean } = {},
) {
  // 1) Customer data & stage
  await updateCustomerFromReply(customer, r);

  // 2) Knowledge gap → learning queue
  if (r.knowledge_gap?.trim() && s.learning.enabled) {
    await db.insert(lessons).values({ tenantId: tenant.id, kind: "gap", title: r.knowledge_gap.trim().slice(0, 500), customerId: customer.id });
  }

  // 3) Handoff decision
  const lowConfidence = typeof r.confidence === "number" && r.confidence < s.ai.confidenceThreshold;
  let handoffCat: HandoffTrigger | null = null;
  if (r.handoff?.needed && r.handoff.category && r.handoff.category !== "none" && trig(s, r.handoff.category)) handoffCat = r.handoff.category;
  else if (lowConfidence && trig(s, "uncertain")) handoffCat = "uncertain";

  // 4) Orders
  const extra: string[] = [];
  let order = openOrder;
  if (r.order?.action === "create" || (r.order?.action === "update" && !openOrder)) {
    const res = await createOrder(tenant, s, customer, knowledge, r);
    if (res.order) {
      order = res.order;
      extra.push(paymentInfoText(s, knowledge, res.order));
    } else if (res.missing?.length) {
      extra.push(`Order တင်ဖို့ ${res.missing.join("၊ ")} လေး ပေးပါဦးနော်${s.persona.politeParticle}့။`);
    }
  } else if (r.order?.action === "update" && openOrder) {
    order = await updateOrder(openOrder, knowledge, r);
  } else if (r.order?.action === "cancel" && openOrder) {
    await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, openOrder.id));
    order = null;
  }

  // 5) Payment proof
  const proofMsg = pending.findLast((m) => m.attachments.some((a) => a.type === "image"));
  if (r.payment_proof?.detected && proofMsg) {
    await handlePaymentProof(tenant, customer, order, proofMsg, r.payment_proof.amount);
  }

  // 6) Send
  const fresh = (await db.select().from(customers).where(eq(customers.id, customer.id)).limit(1))[0];
  if (handoffCat && !s.alwaysOn.enabled) {
    const first = handoffCat === "complaint" || handoffCat === "angry" ? (r.reply ?? []).slice(0, 1) : [];
    await sendToCustomer(fresh, first, { sender: "bot" });
    await startHandoff(tenant, s, fresh, handoffCat, r.handoff?.reason || (lowConfidence ? "Bot မသေချာပါ" : ""), pending.map((m) => m.text).join("\n"));
    return;
  }
  if (handoffCat && s.alwaysOn.enabled && !ctx.duringHandoff) {
    // 24/7: alert the admin, but keep helping the customer from the data instead of going quiet.
    await startHandoff(tenant, s, fresh, handoffCat, r.handoff?.reason || (lowConfidence ? "Bot မသေချာပါ" : ""), pending.map((m) => m.text).join("\n"), {
      silent: true,
    });
    if (handoffCat === "ask_human" && s.handoff.customerMessage.trim()) extra.push(s.handoff.customerMessage);
  }

  const images = (r.send_product_images ?? [])
    .map((id) => knowledge.products.find((p) => p.id === id)?.imageUrl)
    .filter((u): u is string => !!u)
    .slice(0, 3);
  const bubbles = [...(r.reply ?? []).slice(0, s.persona.maxBubbles), ...extra];
  const sent = await sendToCustomer(fresh, bubbles, { sender: "bot", images });
  // Keep the conversation flagged as unanswered if delivery failed, so a human sees it in the inbox.
  if (sent.ok) await db.update(customers).set({ unanswered: false }).where(eq(customers.id, customer.id));
}

function uniqMerge(a: string[] | undefined, b: string[] | undefined, max = 12) {
  const set = new Map<string, string>();
  for (const x of [...(a ?? []), ...(b ?? [])]) {
    const v = x?.trim();
    if (v) set.set(v.toLowerCase(), v);
  }
  return [...set.values()].slice(-max);
}

async function updateCustomerFromReply(customer: Customer, r: AgentReply) {
  const c = r.customer ?? {};
  const profile: CustomerProfile = {
    ...customer.profile,
    needs: uniqMerge(customer.profile.needs, c.needs),
    painPoints: uniqMerge(customer.profile.painPoints, c.pain_points),
    objections: uniqMerge(customer.profile.objections, c.objections),
    interestedProductIds: uniqMerge(customer.profile.interestedProductIds, c.interested_product_ids, 10),
    ...(c.budget ? { budget: c.budget } : {}),
    ...(c.email ? { email: c.email } : {}),
    ...(c.address ? { address: c.address } : {}),
    ...(c.notes ? { notes: c.notes } : {}),
    ...(c.lost_reason ? { lostReason: c.lost_reason } : {}),
  };
  // Never move a paid/ordered customer backwards because of a casual message.
  const rank = { new: 0, interested: 1, considering: 2, ready: 3, ordered: 4, paid: 5, lost: 1 } as const;
  let stage = customer.stage;
  // "ordered" and "paid" are set only by the system (order creation / admin confirmation), never by the model.
  if (r.stage === "paid" || r.stage === "ordered") r = { ...r, stage: customer.stage };
  if (r.stage && (r.stage === "lost" ? customer.stage !== "paid" : rank[r.stage] >= rank[customer.stage] || customer.stage === "lost")) stage = r.stage;
  await db
    .update(customers)
    .set({
      profile,
      stage,
      ...(c.name ? { name: c.name } : {}),
      ...(c.phone ? { phone: c.phone } : {}),
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id));
}

function resolveItems(knowledge: Knowledge, items: { product_id: string; qty: number }[] | undefined): OrderItem[] {
  const out: OrderItem[] = [];
  for (const it of items ?? []) {
    const p = knowledge.products.find((x) => x.id === it.product_id);
    if (!p) continue;
    out.push({ productId: p.id, name: p.name, qty: Math.max(1, Math.min(99, Math.round(it.qty || 1))), unitPrice: effectivePrice(p).price });
  }
  return out;
}

function fieldsFrom(customer: Customer, r: AgentReply) {
  const f: Record<string, string> = {};
  if (customer.name) f.name = customer.name;
  if (customer.phone) f.phone = customer.phone;
  if (customer.profile.email) f.email = customer.profile.email;
  if (customer.profile.address) f.address = customer.profile.address;
  if (r.customer?.name) f.name = r.customer.name;
  if (r.customer?.phone) f.phone = r.customer.phone;
  if (r.customer?.email) f.email = r.customer.email;
  if (r.customer?.address) f.address = r.customer.address;
  for (const { key, value } of r.order?.fields ?? []) if (key && value?.trim()) f[key] = value.trim();
  return f;
}

function matchPayment(knowledge: Knowledge, name?: string) {
  if (!name) return null;
  const n = name.toLowerCase().replace(/\s+/g, "");
  return knowledge.payments.find((p) => p.provider.toLowerCase().replace(/\s+/g, "") === n) ?? knowledge.payments.find((p) => n.includes(p.provider.toLowerCase().replace(/\s+/g, ""))) ?? null;
}

async function createOrder(tenant: Tenant, s: TenantSettings, customer: Customer, knowledge: Knowledge, r: AgentReply) {
  const items = resolveItems(knowledge, r.order.items);
  const fields = fieldsFrom(customer, r);
  const missing = s.order.fields.filter((f) => f.required && !fields[f.key]?.trim()).map((f) => f.label);
  if (!items.length) return { order: null, missing: ["ဝယ်မယ့် ပစ္စည်း/Course"] };
  if (missing.length) return { order: null, missing };

  const pm = matchPayment(knowledge, r.order.payment_method);
  const total = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  const [order] = await db
    .insert(orders)
    .values({
      tenantId: tenant.id,
      customerId: customer.id,
      code: randomCode(6),
      items,
      total,
      paymentMethod: pm?.provider ?? r.order.payment_method ?? null,
      fields,
      status: "awaiting_payment",
      note: pm?.isCod ? "COD" : null,
    })
    .returning();
  await db.update(customers).set({ stage: "ordered" }).where(eq(customers.id, customer.id));
  // Stock decrement for physical products.
  for (const it of items) {
    await db.update(products).set({ stock: sql`greatest(${products.stock} - ${it.qty}, 0)` }).where(and(eq(products.id, it.productId), sql`${products.stock} is not null`));
  }
  await notifyAdmins(tenant, "order", {
    text: `🛒 Order အသစ် #${order.code}\n${orderSummary(order)}\n\n${customerLine(customer, fields)}`,
    customerId: customer.id,
    buttons: [[{ text: "✅ အတည်ပြု", callback_data: `ok:${order.id}` }, { text: "❌ ပယ်ဖျက်", callback_data: `no:${order.id}` }]],
  });
  return { order, missing: [] as string[] };
}

async function updateOrder(order: Order, knowledge: Knowledge, r: AgentReply) {
  const items = resolveItems(knowledge, r.order.items);
  const pm = matchPayment(knowledge, r.order.payment_method);
  const fields = { ...order.fields };
  for (const { key, value } of r.order.fields ?? []) if (key && value?.trim()) fields[key] = value.trim();
  const patch: Partial<Order> = { fields, updatedAt: new Date() };
  if (items.length) {
    patch.items = items;
    patch.total = items.reduce((a, i) => a + i.qty * i.unitPrice, 0);
  }
  if (pm) patch.paymentMethod = pm.provider;
  const [o] = await db.update(orders).set(patch).where(eq(orders.id, order.id)).returning();
  return o;
}

export function orderSummary(o: Order) {
  return `${o.items.map((i) => `• ${i.name} x${i.qty} — ${(i.unitPrice * i.qty).toLocaleString("en-US")} ကျပ်`).join("\n")}\nစုစုပေါင်း: ${o.total.toLocaleString("en-US")} ကျပ်${o.paymentMethod ? `\nငွေပေးချေမှု: ${o.paymentMethod}` : ""}`;
}

function customerLine(c: Customer, fields: Record<string, string>) {
  const f = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join("\n");
  return `👤 ${c.displayName || "Customer"} (${c.channelType})\n${f}`;
}

export function paymentInfoText(s: TenantSettings, k: Knowledge, o: Order) {
  const chosen = matchPayment(k, o.paymentMethod ?? undefined);
  const methods = chosen ? [chosen] : k.payments.filter((p) => !p.isCod);
  const lines = methods.map((m) => `💳 ${m.provider}${m.accountName ? ` — ${m.accountName}` : ""}${m.accountNumber ? `\n${m.accountNumber}` : ""}${m.note ? `\n(${m.note})` : ""}`);
  if (chosen?.isCod) return `Order နံပါတ်: #${o.code}\nစုစုပေါင်း: ${o.total.toLocaleString("en-US")} ကျပ် (ပစ္စည်းရောက်မှ ငွေချေ)\n${s.order.afterOrderMessage}`;
  return `Order နံပါတ်: #${o.code}\nစုစုပေါင်း: ${o.total.toLocaleString("en-US")} ကျပ်\n\n${lines.join("\n\n")}\n\n${s.order.afterOrderMessage}`;
}

async function handlePaymentProof(tenant: Tenant, customer: Customer, order: Order | null, msg: Message, amount?: number) {
  const attachment = msg.attachments.find((a) => a.type === "image")!;
  const photoUrl = signedMediaUrl(msg.id, msg.attachments.indexOf(attachment));
  if (order) {
    await db
      .update(orders)
      .set({ status: "payment_submitted", paymentProof: { attachment, messageId: msg.id, index: msg.attachments.indexOf(attachment), detectedAmount: amount, at: new Date().toISOString() }, updatedAt: new Date() })
      .where(eq(orders.id, order.id));
    const mismatch = amount && Math.abs(amount - order.total) > 1 ? `\n⚠️ Screenshot ပေါ်က ငွေပမာဏ ${amount.toLocaleString("en-US")} ≠ ${order.total.toLocaleString("en-US")}` : "";
    await notifyAdmins(tenant, "payment", {
      text: `💰 ငွေလွှဲ Screenshot ရောက်ပါပြီ — Order #${order.code}\n${orderSummary(order)}${mismatch}\n👤 ${customer.name || customer.displayName}`,
      customerId: customer.id,
      photoUrl,
      buttons: [[{ text: "✅ ငွေရပြီ (အတည်ပြု)", callback_data: `ok:${order.id}` }, { text: "❌ မရသေး/ပယ်", callback_data: `no:${order.id}` }]],
    });
  } else {
    await notifyAdmins(tenant, "payment", {
      text: `💰 Order မရှိသေးဘဲ ငွေလွှဲ Screenshot ပို့လာပါတယ် — 👤 ${customer.name || customer.displayName}${amount ? ` (${amount.toLocaleString("en-US")} ကျပ်)` : ""}\n↩️ Reply ပြန်ပြီး Customer ကို ဖြေနိုင်ပါတယ်`,
      customerId: customer.id,
      photoUrl,
    });
  }
}

export async function startHandoff(
  tenant: Tenant,
  s: TenantSettings,
  customer: Customer,
  category: HandoffTrigger,
  reason: string,
  lastText: string,
  opts: { silent?: boolean } = {},
) {
  await db
    .update(customers)
    .set({
      botPausedUntil: new Date(Date.now() + minutes(s.handoff.pauseMinutes)),
      needsHuman: true,
      handoffReason: `${category}${reason ? `: ${reason}` : ""}`,
      unanswered: true,
      updatedAt: new Date(),
    })
    .where(eq(customers.id, customer.id));
  if (!opts.silent && s.handoff.customerMessage.trim()) {
    await sendToCustomer(customer, [s.handoff.customerMessage], { sender: "bot" });
  }
  await notifyAdmins(tenant, "handoff", {
    text: `🙋 လူကိုလွှဲ (${category})\n👤 ${customer.name || customer.displayName || "Customer"} — ${customer.channelType}\nအကြောင်းရင်း: ${reason || "-"}\nနောက်ဆုံးစာ: ${lastText.slice(0, 500) || "-"}\n\n↩️ ဒီစာကို Reply ပြန်ရင် Customer ဆီ တိုက်ရိုက် ရောက်ပါမယ်။ Bot ကို ${s.handoff.pauseMinutes} မိနစ် ရပ်ထားပါတယ်။`,
    customerId: customer.id,
    buttons: [[{ text: "🤖 Bot ပြန်ဖွင့်", callback_data: `resume:${customer.id}` }]],
  });
}

/* ───────────── Human actions (dashboard / Telegram admin) ───────────── */

export async function sendHumanReply(customerId: string, text: string) {
  const [customer] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!customer) return { ok: false, error: "Customer not found", sent: 0 };
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, customer.tenantId)).limit(1);
  const s = resolveSettings(tenant.settings);
  const res = await sendToCustomer(customer, [text], { sender: "human", humanAgentTag: s.messenger.humanAgentTag, typing: false });
  if (res.ok) {
    // A human is talking: keep the bot quiet for a while and learn from the answer.
    await db
      .update(customers)
      .set({ botPausedUntil: new Date(Date.now() + minutes(s.handoff.pauseMinutes)), unanswered: false, updatedAt: new Date() })
      .where(eq(customers.id, customer.id));
    if (s.learning.enabled) await learnFromHumanReply(tenant.id, customer.id, text);
  }
  return res;
}

async function learnFromHumanReply(tenantId: string, customerId: string, answer: string) {
  const [q] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.customerId, customerId), eq(messages.direction, "in"), gt(sql`length(${messages.text})`, 3)))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  if (!q || answer.trim().length < 4) return;
  await db.insert(lessons).values({ tenantId, kind: "faq", title: q.text.slice(0, 500), content: answer.slice(0, 2000), customerId });
}

export async function resumeBot(customerId: string) {
  await db.update(customers).set({ botPausedUntil: null, needsHuman: false, handoffReason: null }).where(eq(customers.id, customerId));
}

export async function confirmOrder(orderId: string) {
  const [o] = await db.update(orders).set({ status: "confirmed", updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
  if (!o) return null;
  const [customer] = await db.update(customers).set({ stage: "paid", updatedAt: new Date() }).where(eq(customers.id, o.customerId)).returning();
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, o.tenantId)).limit(1);
  const s = resolveSettings(tenant.settings);
  if (s.order.confirmedMessage.trim()) await sendToCustomer(customer, [s.order.confirmedMessage], { sender: "bot", humanAgentTag: s.messenger.humanAgentTag });
  return o;
}

export async function cancelOrder(orderId: string) {
  const [o] = await db.update(orders).set({ status: "cancelled", updatedAt: new Date() }).where(eq(orders.id, orderId)).returning();
  return o ?? null;
}

/** Typing indicator + mark seen as soon as a message arrives. */
export async function acknowledge(customer: Customer) {
  const ch = await getChannel(customer.channelId);
  if (!ch) return;
  if (ch.type === "messenger") {
    const api = messengerFor(ch);
    await api.markSeen(customer.externalId);
  }
}
