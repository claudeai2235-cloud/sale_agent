"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  channels,
  customers,
  faqs,
  lessons,
  messages,
  objections,
  orders,
  paymentMethods,
  products,
  tenants,
  type Tenant,
} from "@/db/schema";
import { requireTenant, getSession } from "@/lib/auth";
import { encrypt, randomCode, randomSecret, decrypt } from "@/lib/crypto";
import { ALL_QUESTIONS } from "@/lib/questionnaire";
import { resolveSettings, type HandoffTrigger, type TenantSettings } from "@/lib/settings";
import { TelegramApi } from "@/lib/channels/telegram";
import { MessengerApi } from "@/lib/channels/messenger";
import { appUrl } from "@/lib/notify";
import { messengerWindowOpen } from "@/lib/channels/outbound";
import {
  cancelOrder,
  confirmOrder,
  ingestInbound,
  processCustomer,
  resumeBot,
  sendHumanReply,
  ADMIN_PAUSE_REASON,
} from "@/lib/agent/engine";
import { generateGrowthReport } from "@/lib/agent/jobs";
import { runAutofill, type AutofillResult } from "@/lib/agent/autofill";
import type { ActionResult } from "@/components/action-form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, d = 0) => {
  const v = Number(String(fd.get(k) ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(v) ? v : d;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
const ok = (message = "သိမ်းပြီးပါပြီ ✓"): ActionResult => ({ ok: true, message });
const fail = (message: string): ActionResult => ({ ok: false, message });

async function ctx(fd: FormData) {
  return requireTenant(str(fd, "tenantId"));
}

async function patchSettings(t: Tenant, patch: Partial<TenantSettings>) {
  const cur = (t.settings ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  for (const [k, v] of Object.entries(patch)) next[k] = { ...((cur[k] as object) ?? {}), ...(v as object) };
  await db.update(tenants).set({ settings: next as Partial<TenantSettings>, updatedAt: new Date() }).where(eq(tenants.id, t.id));
}

const rp = (t: Tenant, p = "") => revalidatePath(`/t/${t.id}${p}`);

/* ───────── Business profile ───────── */

export async function saveProfile(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const profile = { ...tenant.profile };
  for (const q of ALL_QUESTIONS) if (fd.has(q.key)) profile[q.key] = str(fd, q.key);
  await db.update(tenants).set({ profile, updatedAt: new Date() }).where(eq(tenants.id, tenant.id));
  rp(tenant, "/setup");
  return ok();
}

/* ───────── Products ───────── */

export async function saveProduct(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const name = str(fd, "name");
  if (!name) return fail("အမည် ထည့်ပါ");
  const saleEnds = str(fd, "saleEndsAt");
  const classStart = str(fd, "classStartAt");
  const enrollDeadline = str(fd, "enrollDeadlineAt");
  if (classStart && enrollDeadline && enrollDeadline > classStart) return fail("နောက်ဆုံးအပ်နှံရက်က အတန်းစရက်ထက် နောက်ကျလို့ မရပါ");
  const values = {
    kind: (str(fd, "kind") || "product") as "course" | "product" | "service",
    name,
    summary: str(fd, "summary"),
    details: str(fd, "details"),
    benefits: str(fd, "benefits"),
    audience: str(fd, "audience"),
    price: num(fd, "price"),
    salePrice: str(fd, "salePrice") ? num(fd, "salePrice") : null,
    saleEndsAt: saleEnds ? new Date(`${saleEnds}T23:59:59+06:30`) : null,
    // Dates are Myanmar calendar days; the countdown is counted in Asia/Yangon.
    classStartAt: classStart ? new Date(`${classStart}T09:00:00+06:30`) : null,
    enrollDeadlineAt: enrollDeadline ? new Date(`${enrollDeadline}T23:59:59+06:30`) : null,
    duration: str(fd, "duration"),
    deliveryInfo: str(fd, "deliveryInfo"),
    bonus: str(fd, "bonus"),
    imageUrl: str(fd, "imageUrl") || null,
    stock: str(fd, "stock") ? num(fd, "stock") : null,
    active: bool(fd, "active"),
    sortOrder: num(fd, "sortOrder"),
    updatedAt: new Date(),
  };
  const id = str(fd, "id");
  if (id) await db.update(products).set(values).where(and(eq(products.id, id), eq(products.tenantId, tenant.id)));
  else await db.insert(products).values({ ...values, tenantId: tenant.id });
  rp(tenant, "/products");
  return ok(id ? "ပြင်ဆင်ပြီးပါပြီ ✓" : "ထည့်ပြီးပါပြီ ✓");
}

export async function deleteProduct(fd: FormData) {
  const { tenant } = await ctx(fd);
  await db.delete(products).where(and(eq(products.id, str(fd, "id")), eq(products.tenantId, tenant.id)));
  rp(tenant, "/products");
}

/* ───────── FAQ & objections ───────── */

export async function saveFaq(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const question = str(fd, "question");
  const answer = str(fd, "answer");
  if (!question || !answer) return fail("မေးခွန်းနဲ့ အဖြေ နှစ်ခုလုံး ထည့်ပါ");
  const id = str(fd, "id");
  if (id) await db.update(faqs).set({ question, answer }).where(and(eq(faqs.id, id), eq(faqs.tenantId, tenant.id)));
  else await db.insert(faqs).values({ tenantId: tenant.id, question, answer });
  rp(tenant, "/knowledge");
  return ok();
}
export async function deleteFaq(fd: FormData) {
  const { tenant } = await ctx(fd);
  await db.delete(faqs).where(and(eq(faqs.id, str(fd, "id")), eq(faqs.tenantId, tenant.id)));
  rp(tenant, "/knowledge");
}
export async function saveObjection(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const objection = str(fd, "objection");
  const response = str(fd, "response");
  if (!objection || !response) return fail("နှစ်ခုလုံး ထည့်ပါ");
  const id = str(fd, "id");
  if (id) await db.update(objections).set({ objection, response }).where(and(eq(objections.id, id), eq(objections.tenantId, tenant.id)));
  else await db.insert(objections).values({ tenantId: tenant.id, objection, response });
  rp(tenant, "/knowledge");
  return ok();
}
export async function deleteObjection(fd: FormData) {
  const { tenant } = await ctx(fd);
  await db.delete(objections).where(and(eq(objections.id, str(fd, "id")), eq(objections.tenantId, tenant.id)));
  rp(tenant, "/knowledge");
}

/* ───────── Payments & order settings ───────── */

export async function savePayment(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const provider = str(fd, "provider");
  if (!provider) return fail("Payment အမျိုးအစား ရွေးပါ");
  const values = {
    provider,
    accountName: str(fd, "accountName"),
    accountNumber: str(fd, "accountNumber"),
    note: str(fd, "note"),
    isCod: bool(fd, "isCod"),
    active: bool(fd, "active"),
    sortOrder: num(fd, "sortOrder"),
  };
  const id = str(fd, "id");
  if (id) await db.update(paymentMethods).set(values).where(and(eq(paymentMethods.id, id), eq(paymentMethods.tenantId, tenant.id)));
  else await db.insert(paymentMethods).values({ ...values, tenantId: tenant.id });
  rp(tenant, "/payments");
  return ok();
}
export async function deletePayment(fd: FormData) {
  const { tenant } = await ctx(fd);
  await db.delete(paymentMethods).where(and(eq(paymentMethods.id, str(fd, "id")), eq(paymentMethods.tenantId, tenant.id)));
  rp(tenant, "/payments");
}

export async function saveOrderSettings(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const keys = fd.getAll("f_key").map(String);
  const labels = fd.getAll("f_label").map(String);
  const req = new Set(fd.getAll("f_required").map(String));
  const fields = keys
    .map((k, i) => ({ key: k.trim().toLowerCase().replace(/[^a-z0-9_]/g, "_"), label: (labels[i] ?? "").trim(), required: req.has(String(i)) }))
    .filter((f) => f.key && f.label);
  await patchSettings(tenant, {
    order: {
      fields,
      requirePaymentProof: bool(fd, "requirePaymentProof"),
      afterOrderMessage: str(fd, "afterOrderMessage"),
      confirmedMessage: str(fd, "confirmedMessage"),
    },
  });
  rp(tenant, "/payments");
  return ok();
}

/* ───────── Persona & AI ───────── */

export async function savePersona(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  await patchSettings(tenant, {
    persona: {
      name: str(fd, "name") || "Thiri",
      role: str(fd, "role"),
      politeParticle: str(fd, "politeParticle") || "ရှင်",
      emojiLevel: (str(fd, "emojiLevel") || "low") as "low",
      maxBubbles: Math.min(5, Math.max(1, num(fd, "maxBubbles", 3))),
      extraStyle: str(fd, "extraStyle"),
      goal: str(fd, "goal"),
    },
    alwaysOn: {
      enabled: bool(fd, "alwaysOn"),
      humanGraceMinutes: Math.min(240, Math.max(1, num(fd, "humanGraceMinutes", 10))),
    },
    ai: {
      chatModel: str(fd, "chatModel"),
      thinkingLevel: (["default", "low", "medium", "high"].includes(str(fd, "thinkingLevel")) ? str(fd, "thinkingLevel") : "low") as "low",
      temperature: Math.min(1.5, Math.max(0, num(fd, "temperature", 0.7))),
      confidenceThreshold: Math.min(1, Math.max(0, num(fd, "confidenceThreshold", 0.45))),
      historyMessages: Math.min(60, Math.max(6, num(fd, "historyMessages", 24))),
      replyDelaySeconds: Math.min(20, Math.max(0, num(fd, "replyDelaySeconds", 4))),
    },
    learning: { enabled: bool(fd, "learningEnabled"), autoApprove: bool(fd, "autoApprove") },
    messenger: { humanAgentTag: bool(fd, "humanAgentTag") },
  });
  await db.update(tenants).set({ botEnabled: bool(fd, "botEnabled") }).where(eq(tenants.id, tenant.id));
  rp(tenant);
  return ok();
}

/* ───────── Handoff ───────── */

export async function saveHandoff(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const triggers = {} as Record<HandoffTrigger, boolean>;
  for (const t of ["complaint", "ask_human", "refund", "discount", "payment_issue", "angry", "uncertain", "custom"] as HandoffTrigger[]) triggers[t] = bool(fd, `t_${t}`);
  await patchSettings(tenant, {
    handoff: {
      enabled: bool(fd, "enabled"),
      triggers,
      maxDiscountPercent: Math.max(0, num(fd, "maxDiscountPercent")),
      keywords: str(fd, "keywords").split(/[\n,]/).map((s) => s.trim()).filter(Boolean),
      customRules: str(fd, "customRules"),
      pauseMinutes: Math.max(5, num(fd, "pauseMinutes", 120)),
      customerMessage: str(fd, "customerMessage"),
    },
    notifications: {
      ...resolveSettings(tenant.settings).notifications,
      onOrder: bool(fd, "onOrder"),
      onPaymentProof: bool(fd, "onPaymentProof"),
      onHandoff: bool(fd, "onHandoff"),
      onDailySummary: bool(fd, "onDailySummary"),
    },
  });
  rp(tenant, "/handoff");
  return ok();
}

export async function removeAdminChat(fd: FormData) {
  const { tenant } = await ctx(fd);
  const n = resolveSettings(tenant.settings).notifications;
  const chatId = str(fd, "chatId");
  const via = str(fd, "via");
  await patchSettings(tenant, { notifications: { ...n, adminChats: n.adminChats.filter((c) => !(c.chatId === chatId && c.via === via)) } });
  rp(tenant, "/channels");
}

export async function regenerateLinkCode(fd: FormData) {
  const { tenant } = await ctx(fd);
  await db.update(tenants).set({ adminLinkCode: randomCode(8) }).where(eq(tenants.id, tenant.id));
  rp(tenant, "/channels");
}

/* ───────── Follow-up ───────── */

export async function saveFollowup(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const delays = fd.getAll("s_delay").map((v) => Number(v));
  const units = fd.getAll("s_unit").map(String);
  const goals = fd.getAll("s_goal").map(String);
  const steps = delays
    .map((d, i) => ({ delayMinutes: Math.round(d * (units[i] === "h" ? 60 : 1)), goal: (goals[i] ?? "").trim() }))
    .filter((s) => s.delayMinutes > 0 && s.goal)
    .sort((a, b) => a.delayMinutes - b.delayMinutes);
  const tooLate = steps.filter((s) => s.delayMinutes > 23 * 60);
  await patchSettings(tenant, {
    followup: {
      enabled: bool(fd, "enabled"),
      steps,
      paymentReminderMinutes: Math.max(10, num(fd, "paymentReminderMinutes", 180)),
      telegramMaxHours: Math.max(1, num(fd, "telegramMaxHours", 72)),
      quietStartHour: Math.min(23, Math.max(0, num(fd, "quietStartHour", 22))),
      quietEndHour: Math.min(23, Math.max(0, num(fd, "quietEndHour", 8))),
    },
  });
  rp(tenant, "/followup");
  return ok(tooLate.length ? "သိမ်းပြီးပါပြီ — သတိ: ၂၃ နာရီကျော် Step တွေက Messenger မှာ မပို့ပါ (Telegram မှာသာ ပို့ပါမယ်)" : undefined);
}

/* ───────── Channels ───────── */

export async function connectTelegram(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const token = str(fd, "token");
  if (!/^\d+:[\w-]{20,}$/.test(token)) return fail("Bot Token ပုံစံ မမှန်ပါ (@BotFather ဆီက ရတဲ့ 123456:ABC… ပုံစံ)");
  if (!appUrl()) return fail("APP_URL environment variable မသတ်မှတ်ရသေးပါ");
  const api = new TelegramApi(token);
  let me;
  try {
    me = await api.getMe();
  } catch (e) {
    return fail(`Token မှားနေပါတယ်: ${(e as Error).message}`);
  }
  const [dup] = await db.select().from(channels).where(and(eq(channels.type, "telegram"), eq(channels.externalId, me.username))).limit(1);
  if (dup && dup.tenantId !== tenant.id) return fail("ဒီ Bot ကို တခြားလုပ်ငန်းမှာ ချိတ်ထားပြီးသားပါ");
  const secret = randomSecret();
  const [ch] = dup
    ? await db.update(channels).set({ token: encrypt(token), secret, active: true, name: me.first_name, lastError: null }).where(eq(channels.id, dup.id)).returning()
    : await db.insert(channels).values({ tenantId: tenant.id, type: "telegram", name: me.first_name, externalId: me.username, token: encrypt(token), secret }).returning();
  try {
    await api.setWebhook(`${appUrl()}/api/webhooks/telegram/${ch.id}`, secret);
  } catch (e) {
    await db.update(channels).set({ lastError: (e as Error).message }).where(eq(channels.id, ch.id));
    return fail(`Webhook သတ်မှတ်မရပါ: ${(e as Error).message}`);
  }
  rp(tenant, "/channels");
  return ok(`✅ @${me.username} ချိတ်ဆက်ပြီးပါပြီ`);
}

export async function connectMessenger(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const token = str(fd, "token");
  if (token.length < 50) return fail("Page Access Token ထည့်ပါ");
  if (!process.env.META_APP_SECRET || !process.env.META_VERIFY_TOKEN) return fail("META_APP_SECRET / META_VERIFY_TOKEN environment variables မသတ်မှတ်ရသေးပါ");
  const api = new MessengerApi(token);
  const pageIdInput = str(fd, "pageId").replace(/\D/g, "");
  let me: { id: string; name: string } | null = null;
  let firstError = "";
  try {
    me = await api.me();
  } catch (e) {
    firstError = (e as Error).message;
    // Reading the Page name needs pages_read_engagement; the ID alone or a typed Page ID is enough to work.
    try {
      const r = await api.meId();
      me = { id: r.id, name: pageIdInput ? "Facebook Page" : `Page ${r.id}` };
    } catch {
      if (pageIdInput) me = { id: pageIdInput, name: `Page ${pageIdInput}` };
    }
  }
  if (!me) {
    return fail(
      `Token ကို စစ်လို့မရပါ (${firstError})။ Page Access Token အသစ်ကို pages_messaging, pages_read_engagement, pages_manage_metadata ခွင့်ပြုချက်တွေနဲ့ ထုတ်ပါ (သို့) အောက်က “Page ID” ကွက်ထဲ Page ID ထည့်ပြီး ပြန်ချိတ်ပါ။`,
    );
  }
  if (pageIdInput && pageIdInput !== me.id && !firstError) {
    return fail(`ဒီ Token က Page ID ${me.id} အတွက်ပါ — ထည့်ထားတဲ့ Page ID (${pageIdInput}) နဲ့ မကိုက်ပါ။ User token မဟုတ်ဘဲ Page token ဖြစ်ရပါမယ်။`);
  }
  const [dup] = await db.select().from(channels).where(and(eq(channels.type, "messenger"), eq(channels.externalId, me.id))).limit(1);
  if (dup && dup.tenantId !== tenant.id) return fail("ဒီ Page ကို တခြားလုပ်ငန်းမှာ ချိတ်ထားပြီးသားပါ");
  const [ch] = dup
    ? await db.update(channels).set({ token: encrypt(token), active: true, name: me.name, lastError: null }).where(eq(channels.id, dup.id)).returning()
    : await db.insert(channels).values({ tenantId: tenant.id, type: "messenger", name: me.name, externalId: me.id, token: encrypt(token), secret: randomSecret() }).returning();
  try {
    await api.subscribeApp();
  } catch (e) {
    await db.update(channels).set({ lastError: (e as Error).message }).where(eq(channels.id, ch.id));
    return fail(
      `Page ကို သိမ်းပြီးပါပြီ၊ ဒါပေမဲ့ App နဲ့ Subscribe မလုပ်နိုင်ပါ (${(e as Error).message})။ Token ကို pages_manage_metadata ခွင့်ပြုချက်နဲ့ ပြန်ထုတ်ပြီး ထပ်ချိတ်ပါ — (သို့) Meta App → Messenger → Webhooks မှာ ဒီ Page ကို Subscribe ကိုယ်တိုင် နှိပ်ပါ။`,
    );
  }
  rp(tenant, "/channels");
  return ok(`✅ “${me.name}” Page ချိတ်ဆက်ပြီးပါပြီ`);
}

export async function toggleChannel(fd: FormData) {
  const { tenant } = await ctx(fd);
  const [ch] = await db.select().from(channels).where(and(eq(channels.id, str(fd, "id")), eq(channels.tenantId, tenant.id))).limit(1);
  if (ch) await db.update(channels).set({ active: !ch.active }).where(eq(channels.id, ch.id));
  rp(tenant, "/channels");
}

export async function deleteChannel(fd: FormData) {
  const { tenant } = await ctx(fd);
  const [ch] = await db.select().from(channels).where(and(eq(channels.id, str(fd, "id")), eq(channels.tenantId, tenant.id))).limit(1);
  if (!ch) return;
  if (ch.type === "telegram") await new TelegramApi(decrypt(ch.token)).call("deleteWebhook").catch(() => undefined);
  await db.delete(channels).where(eq(channels.id, ch.id));
  rp(tenant, "/channels");
}

/** Imports recent Messenger conversations whose last message is from the customer and answers those still inside the 24h window. */
export async function scanMessengerBacklog(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const [ch] = await db.select().from(channels).where(and(eq(channels.id, str(fd, "channelId")), eq(channels.tenantId, tenant.id))).limit(1);
  if (!ch || ch.type !== "messenger") return fail("Messenger channel မတွေ့ပါ");
  const api = new MessengerApi(decrypt(ch.token));
  let convs;
  try {
    convs = await api.conversations(50);
  } catch (e) {
    return fail(`Conversation ဆွဲမရပါ: ${(e as Error).message} (pages_messaging / pages_read_engagement ခွင့်ပြုချက် လိုပါတယ်)`);
  }
  let answered = 0;
  let manual = 0;
  for (const conv of convs.data) {
    const msgs = (conv.messages?.data ?? []).slice().reverse(); // oldest → newest
    const last = msgs[msgs.length - 1];
    if (!last || last.from.id === ch.externalId) continue; // page already replied
    const lastPageIdx = msgs.map((m) => m.from.id).lastIndexOf(ch.externalId);
    const unanswered = msgs.slice(lastPageIdx + 1);
    const person = conv.participants.data.find((p) => p.id !== ch.externalId);
    if (!person) continue;
    let customerId: string | null = null;
    for (const m of unanswered) {
      const r = await ingestInbound({
        tenant,
        channel: ch,
        channelType: "messenger",
        externalUserId: person.id,
        displayName: person.name,
        text: m.message ?? "",
        externalMessageId: m.id,
        at: new Date(m.created_time),
      });
      if (r) customerId = r.customer.id;
    }
    if (!customerId) {
      const [c] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, tenant.id), eq(customers.channelType, "messenger"), eq(customers.externalId, person.id)))
        .limit(1);
      customerId = c?.id ?? null;
    }
    if (!customerId) continue;
    const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    if (messengerWindowOpen(c, 5)) {
      await processCustomer(c.id);
      answered++;
    } else {
      await db.update(messages).set({ handled: true }).where(and(eq(messages.customerId, c.id), eq(messages.handled, false)));
      await db.update(customers).set({ unanswered: true }).where(eq(customers.id, c.id));
      manual++;
    }
  }
  rp(tenant, "/inbox");
  return ok(`စစ်ပြီးပါပြီ — Thiri ဖြေပေးလိုက်တာ ${answered} ယောက်၊ ၂၄ နာရီကျော်လို့ လူကိုယ်တိုင် ဖြေရမယ့်သူ ${manual} ယောက် (Inbox → “မဖြေရသေး” မှာ ကြည့်ပါ)`);
}

/* ───────── Inbox ───────── */

async function ownCustomer(tenant: Tenant, id: string) {
  const [c] = await db.select().from(customers).where(and(eq(customers.id, id), eq(customers.tenantId, tenant.id))).limit(1);
  return c ?? null;
}

export async function sendReplyAction(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const c = await ownCustomer(tenant, str(fd, "customerId"));
  const text = str(fd, "text");
  if (!c || !text) return fail("စာ ရေးပါ");
  const r = await sendHumanReply(c.id, text);
  rp(tenant, "/inbox");
  return r.ok ? { ok: true } : fail(r.error ?? "ပို့မရပါ");
}

export async function botControlAction(fd: FormData) {
  const { tenant } = await ctx(fd);
  const c = await ownCustomer(tenant, str(fd, "customerId"));
  if (!c) return;
  const op = str(fd, "op");
  if (op === "resume") await resumeBot(c.id);
  if (op === "pause") await db.update(customers).set({ botPausedUntil: new Date(Date.now() + 7 * 86_400_000), needsHuman: true, handoffReason: ADMIN_PAUSE_REASON }).where(eq(customers.id, c.id));
  if (op === "answer") {
    // Let Thiri answer the latest customer messages now.
    await resumeBot(c.id);
    const lastIn = await db.select({ id: messages.id }).from(messages).where(and(eq(messages.customerId, c.id), eq(messages.direction, "in"))).orderBy(messages.createdAt);
    const tail = lastIn.slice(-3).map((m) => m.id);
    if (tail.length) await db.update(messages).set({ handled: false }).where(inArray(messages.id, tail));
    await processCustomer(c.id, { force: true });
  }
  if (op === "stopFollowup") await db.update(customers).set({ followupStoppedAt: new Date() }).where(eq(customers.id, c.id));
  if (op === "done") await db.update(customers).set({ unanswered: false, needsHuman: false }).where(eq(customers.id, c.id));
  if (op === "enrolled" || op === "unenroll") {
    // Admin marks a customer as an enrolled student → Thiri stops selling and switches to support.
    const pid = str(fd, "productId");
    const ids = new Set(c.profile.enrolledProductIds ?? []);
    if (op === "enrolled") {
      if (pid) ids.add(pid);
      else for (const x of c.profile.interestedProductIds ?? []) ids.add(x);
    } else ids.clear();
    await db
      .update(customers)
      .set({
        stage: op === "enrolled" ? "paid" : "interested",
        needsHuman: false,
        followupStoppedAt: op === "enrolled" ? new Date() : c.followupStoppedAt,
        profile: { ...c.profile, enrolledProductIds: [...ids] },
        updatedAt: new Date(),
      })
      .where(eq(customers.id, c.id));
  }
  const stage = str(fd, "stage");
  if (op === "stage" && stage) await db.update(customers).set({ stage: stage as "new" }).where(eq(customers.id, c.id));
  rp(tenant, "/inbox");
}

/* ───────── Orders ───────── */

export async function orderAction(fd: FormData) {
  const { tenant } = await ctx(fd);
  const [o] = await db.select().from(orders).where(and(eq(orders.id, str(fd, "orderId")), eq(orders.tenantId, tenant.id))).limit(1);
  if (!o) return;
  if (str(fd, "op") === "confirm") await confirmOrder(o.id);
  if (str(fd, "op") === "cancel") await cancelOrder(o.id);
  rp(tenant, "/orders");
}

/* ───────── Learning ───────── */

export async function lessonAction(fd: FormData) {
  const { tenant } = await ctx(fd);
  const [l] = await db.select().from(lessons).where(and(eq(lessons.id, str(fd, "id")), eq(lessons.tenantId, tenant.id))).limit(1);
  if (!l) return;
  const op = str(fd, "op");
  if (op === "reject") await db.update(lessons).set({ status: "rejected" }).where(eq(lessons.id, l.id));
  if (op === "approve") {
    const title = str(fd, "title") || l.title;
    const content = str(fd, "content") || l.content;
    if (l.kind === "faq" || l.kind === "gap") {
      if (!content) return;
      await db.insert(faqs).values({ tenantId: tenant.id, question: title, answer: content, source: "learned" });
    } else if (l.kind === "objection") {
      await db.insert(objections).values({ tenantId: tenant.id, objection: title, response: content, source: "learned" });
    }
    await db.update(lessons).set({ status: "approved", title, content }).where(eq(lessons.id, l.id));
  }
  rp(tenant, "/learning");
}

export async function generateReportAction(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  try {
    await generateGrowthReport(tenant.id);
  } catch (e) {
    return fail(`Report ထုတ်မရပါ: ${(e as Error).message}`);
  }
  rp(tenant, "/insights");
  return ok("Report အသစ် ထုတ်ပြီးပါပြီ ✓");
}

/* ───────── Test chat ───────── */

export async function testChatSend(_: ActionResult, fd: FormData) {
  const { tenant } = await ctx(fd);
  const s = await getSession();
  const text = str(fd, "text");
  if (!text || !s) return fail("စာ ရေးပါ");
  const r = await ingestInbound({ tenant, channel: null, channelType: "test", externalUserId: `test:${s.uid}`, displayName: `${s.name || "Tester"} (Test)`, text });
  if (r) {
    try {
      await processCustomer(r.customer.id, { force: true });
    } catch (e) {
      return fail(`AI error: ${(e as Error).message}`);
    }
  }
  rp(tenant, "/test");
  return { ok: true };
}

export async function testChatReset(fd: FormData) {
  const { tenant } = await ctx(fd);
  const s = await getSession();
  if (!s) return;
  await db.delete(customers).where(and(eq(customers.tenantId, tenant.id), eq(customers.channelType, "test"), eq(customers.externalId, `test:${s.uid}`)));
  rp(tenant, "/test");
}

/* ───────── AI business setup agent ───────── */

export type AutofillState = AutofillResult | null;

const AUDIO_TYPES = /^audio\/(webm|mp4|m4a|x-m4a|mpeg|mp3|ogg|wav|x-wav|aac|flac)/;

export async function autofillAction(_: AutofillState, fd: FormData): Promise<AutofillState> {
  const { tenant } = await ctx(fd);
  const empty = { ok: false, filledKeys: [], addedProducts: [], addedFaqs: 0, addedObjections: 0, updatedSettings: [], todo: [], summary: "" };
  let audio: { mime: string; data: Buffer } | undefined;
  for (const field of ["audio", "audioFile"]) {
    const f = fd.get(field);
    if (f instanceof File && f.size > 0) {
      if (f.size > 4_500_000) return { ...empty, error: "အသံဖိုင် ကြီးလွန်းပါတယ် (4MB အောက်)" };
      const mime = (f.type || "audio/webm").split(";")[0];
      if (!AUDIO_TYPES.test(mime)) return { ...empty, error: `ဒီအသံဖိုင်အမျိုးအစား (${mime}) ကို မထောက်ပံ့ပါ` };
      audio = { mime, data: Buffer.from(await f.arrayBuffer()) };
      break;
    }
  }
  try {
    const r = await runAutofill({ tenantId: tenant.id, text: str(fd, "text").slice(0, 8000), audio, overwrite: bool(fd, "overwrite") });
    revalidatePath(`/t/${tenant.id}`, "layout");
    return r;
  } catch (e) {
    console.error("autofill failed", e);
    return { ...empty, error: `AI error: ${(e as Error).message}` };
  }
}
