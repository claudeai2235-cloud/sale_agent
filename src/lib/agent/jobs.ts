import { and, desc, eq, gt, inArray, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, faqs, lessons, messages, objections, orders, platformSettings, reports, tenants, type Customer, type Tenant } from "@/db/schema";
import { resolveSettings } from "@/lib/settings";
import { hours, inQuietHours, minutes, mmHour } from "@/lib/time";
import { messengerWindowOpen, sendToCustomer } from "@/lib/channels/outbound";
import { notifyAdmins, notifySuperAdmin } from "@/lib/notify";
import { generate, platformModels } from "./gemini";
import { buildSystemPrompt, type Knowledge } from "./prompt";
import { botPaused, historyContents, loadKnowledge, openOrderFor, paymentInfoText, tenantServing } from "./engine";

/* ───────────── Scheduler tick ───────────── */

/** Runs due background work. Safe to call often; each part throttles itself. */
export async function tick() {
  const now = new Date();
  // Global throttle: at most once every 50s.
  const claimed = await db
    .update(platformSettings)
    .set({ lastTickAt: now })
    .where(and(eq(platformSettings.id, 1), or(isNull(platformSettings.lastTickAt), lt(platformSettings.lastTickAt, new Date(now.getTime() - 50_000)))))
    .returning({ id: platformSettings.id });
  if (!claimed.length) return { ran: false };

  const result = { ran: true, followups: 0, reminders: 0, learned: 0, billing: 0, summaries: 0 };
  result.followups = await runFollowups().catch((e) => (console.error("followups", e), 0));
  result.reminders = await runPaymentReminders().catch((e) => (console.error("reminders", e), 0));
  result.learned = await runLearning().catch((e) => (console.error("learning", e), 0));
  result.billing = await runBillingChecks().catch((e) => (console.error("billing", e), 0));
  result.summaries = await runDailySummaries().catch((e) => (console.error("summaries", e), 0));
  return result;
}

export async function ensurePlatformRow() {
  await db.insert(platformSettings).values({ id: 1 }).onConflictDoNothing();
}

const tenantCache = new Map<string, Tenant>();
async function tenantOf(id: string) {
  if (tenantCache.has(id)) return tenantCache.get(id)!;
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  tenantCache.set(id, t);
  return t;
}

/* ───────────── Follow-ups ───────────── */

const FOLLOWUP_SCHEMA = {
  type: "object",
  properties: { send: { type: "boolean" }, reply: { type: "array", items: { type: "string" } } },
  required: ["send", "reply"],
};

export async function runFollowups(limit = 15) {
  tenantCache.clear();
  // Candidates: the bot spoke last, customer went quiet, not paid/lost, bot not paused.
  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        inArray(customers.channelType, ["telegram", "messenger"]),
        isNotNull(customers.lastInboundAt),
        isNotNull(customers.lastBotReplyAt),
        sql`${customers.lastBotReplyAt} >= ${customers.lastInboundAt}`,
        sql`${customers.stage} not in ('paid','lost')`,
        isNull(customers.followupStoppedAt),
        eq(customers.needsHuman, false),
        gt(customers.lastInboundAt, new Date(Date.now() - hours(24 * 7))),
      ),
    )
    .orderBy(customers.lastInboundAt)
    .limit(200);

  let sent = 0;
  for (const c of rows) {
    if (sent >= limit) break;
    if (botPaused(c)) continue;
    const t = await tenantOf(c.tenantId);
    if (!t || !(await tenantServing(t))) continue;
    const s = resolveSettings(t.settings);
    if (!s.followup.enabled) continue;
    const step = s.followup.steps[c.followupStep];
    if (!step) continue;
    const since = Date.now() - new Date(c.lastInboundAt!).getTime();
    if (since < minutes(step.delayMinutes)) continue;
    if (c.channelType === "messenger" && !messengerWindowOpen(c, 20)) {
      await db.update(customers).set({ followupStep: s.followup.steps.length }).where(eq(customers.id, c.id));
      continue; // Meta policy: no promotional messages after 24h.
    }
    if (c.channelType === "telegram" && since > hours(s.followup.telegramMaxHours)) continue;
    if (inQuietHours(s.followup.quietStartHour, s.followup.quietEndHour)) continue;
    // Customers with an unpaid order get payment reminders instead.
    if (c.stage === "ordered" && (await openOrderFor(c.id))) continue;

    const ok = await sendFollowup(t, c, step.goal, c.followupStep + 1, s.followup.steps.length);
    await db.update(customers).set({ followupStep: c.followupStep + 1 }).where(eq(customers.id, c.id));
    if (ok) sent++;
  }
  return sent;
}

async function sendFollowup(t: Tenant, c: Customer, goal: string, n: number, total: number) {
  const s = resolveSettings(t.settings);
  const k: Knowledge = await loadKnowledge(t.id);
  const contents = await historyContents(c, 16, new Set());
  contents.push({
    role: "user",
    parts: [
      {
        text: `[SYSTEM — not from the customer] The customer has not replied for a while. Write follow-up ${n} of ${total}. Goal: ${goal}.
Rules: 1-2 very short bubbles, personal and specific to what they talked about (their need, the product they liked), not generic, not pushy, no guilt. Do not repeat previous messages. If following up would be inappropriate (they clearly declined, conversation was finished, they already bought, or they were upset), set send=false.`,
      },
    ],
  });
  const models = await platformModels();
  try {
    const r = await generate<{ send: boolean; reply: string[] }>({
      tenantId: t.id,
      model: s.ai.chatModel || models.chat,
      fallbackModel: models.lite,
      purpose: "followup",
      system: buildSystemPrompt(t, s, k, c, null),
      contents,
      schema: FOLLOWUP_SCHEMA,
      temperature: 0.8,
      thinkingLevel: s.ai.thinkingLevel,
    });
    if (!r.send || !r.reply?.length) {
      await db.update(customers).set({ followupStoppedAt: new Date() }).where(eq(customers.id, c.id));
      return false;
    }
    const res = await sendToCustomer(c, r.reply.slice(0, 2), { sender: "bot", meta: { followup: n } });
    return res.ok;
  } catch (e) {
    console.error("followup failed", e);
    return false;
  }
}

export async function runPaymentReminders(limit = 20) {
  tenantCache.clear();
  const rows = await db
    .select({ o: orders, c: customers })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(eq(orders.status, "awaiting_payment"), eq(orders.paymentReminderSent, false), isNull(orders.note)))
    .limit(100);
  let sent = 0;
  for (const { o, c } of rows) {
    if (sent >= limit) break;
    const t = await tenantOf(o.tenantId);
    if (!t || !(await tenantServing(t)) || botPaused(c)) continue;
    const s = resolveSettings(t.settings);
    if (!s.followup.enabled || Date.now() - new Date(o.createdAt).getTime() < minutes(s.followup.paymentReminderMinutes)) continue;
    if (inQuietHours(s.followup.quietStartHour, s.followup.quietEndHour)) continue;
    if (c.channelType === "messenger" && !messengerWindowOpen(c, 20)) {
      await db.update(orders).set({ paymentReminderSent: true }).where(eq(orders.id, o.id));
      continue;
    }
    const p = s.persona.politeParticle;
    const k = await loadKnowledge(t.id);
    const res = await sendToCustomer(
      c,
      [`Order #${o.code} လေးအတွက် ငွေလွှဲပြီးပြီဆိုရင် Screenshot လေး ပို့ပေးပါနော်${p}့။ ငွေလွှဲရာမှာ အခက်အခဲရှိရင်လည်း ပြောပါ${p}၊ ကူညီပေးပါမယ်။`, paymentInfoText(s, k, o).split("\n\n" + s.order.afterOrderMessage)[0]],
      { sender: "bot", meta: { paymentReminder: true } },
    );
    await db.update(orders).set({ paymentReminderSent: true }).where(eq(orders.id, o.id));
    if (res.ok) sent++;
  }
  return sent;
}

/* ───────────── Self-learning ───────────── */

const LEARN_SCHEMA = {
  type: "object",
  properties: {
    faqs: { type: "array", items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } }, required: ["question", "answer"] } },
    objections: {
      type: "array",
      items: { type: "object", properties: { objection: { type: "string" }, response: { type: "string" } }, required: ["objection", "response"] },
    },
    insights: { type: "array", items: { type: "string" } },
    outcome: { type: "string", enum: ["bought", "lost", "ongoing", "support"] },
    lost_reason: { type: "string" },
  },
  required: ["faqs", "objections", "insights", "outcome"],
};

/** Reviews finished conversations and proposes new FAQ answers, objection responses and insights. */
export async function runLearning(limit = 4) {
  const [p] = await db.select().from(platformSettings).limit(1);
  if (p?.lastLearnAt && Date.now() - new Date(p.lastLearnAt).getTime() < minutes(30)) return 0;
  await db.update(platformSettings).set({ lastLearnAt: new Date() }).where(eq(platformSettings.id, 1));
  tenantCache.clear();

  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        inArray(customers.channelType, ["telegram", "messenger"]),
        lt(customers.lastInboundAt, new Date(Date.now() - hours(3))),
        or(isNull(customers.learnedAt), sql`${customers.learnedAt} < ${customers.lastInboundAt}`),
      ),
    )
    .orderBy(desc(customers.lastInboundAt))
    .limit(30);

  let done = 0;
  const models = await platformModels();
  for (const c of rows) {
    if (done >= limit) break;
    const t = await tenantOf(c.tenantId);
    const s = resolveSettings(t.settings);
    await db.update(customers).set({ learnedAt: new Date() }).where(eq(customers.id, c.id));
    if (!s.learning.enabled) continue;
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(messages).where(eq(messages.customerId, c.id));
    if (n < 4) continue;

    const existing = await db.select({ q: faqs.question }).from(faqs).where(eq(faqs.tenantId, t.id));
    const existingObj = await db.select({ o: objections.objection }).from(objections).where(eq(objections.tenantId, t.id));
    const contents = await historyContents(c, 40, new Set());
    try {
      const r = await generate<{
        faqs: { question: string; answer: string }[];
        objections: { objection: string; response: string }[];
        insights: string[];
        outcome: string;
        lost_reason?: string;
      }>({
        tenantId: t.id,
        model: models.lite,
        fallbackModel: models.chat,
        purpose: "learning",
        system: `You are a sales coach reviewing a sales chat for the business "${t.name}" (assistant = the business, user = customer). Extract reusable knowledge, written in Burmese:
- faqs: customer questions that are likely to be asked again, with the best answer that was given (especially answers written by a human admin). Only include answers that are factual and consistent with the conversation. Skip questions already covered: ${existing.map((e) => e.q).slice(0, 60).join(" | ") || "none"}
- objections: objections the customer raised and the response that worked (or a better one). Skip ones already covered: ${existingObj.map((e) => e.o).slice(0, 40).join(" | ") || "none"}
- insights: 0-3 short, actionable insights for the business owner (e.g. what customers want, what made them buy or leave).
- outcome and lost_reason.
Return empty arrays when nothing is worth saving. Never invent facts.`,
        contents,
        schema: LEARN_SCHEMA,
        temperature: 0.2,
        thinkingLevel: "low",
      });
      const auto = s.learning.autoApprove;
      for (const f of r.faqs.slice(0, 3)) {
        if (auto) await db.insert(faqs).values({ tenantId: t.id, question: f.question, answer: f.answer, source: "learned" });
        await db.insert(lessons).values({ tenantId: t.id, kind: "faq", title: f.question, content: f.answer, customerId: c.id, status: auto ? "approved" : "pending" });
      }
      for (const o of r.objections.slice(0, 3)) {
        if (auto) await db.insert(objections).values({ tenantId: t.id, objection: o.objection, response: o.response, source: "learned" });
        await db.insert(lessons).values({ tenantId: t.id, kind: "objection", title: o.objection, content: o.response, customerId: c.id, status: auto ? "approved" : "pending" });
      }
      for (const i of r.insights.slice(0, 3)) await db.insert(lessons).values({ tenantId: t.id, kind: "insight", title: i, customerId: c.id });
      if (r.outcome === "lost" && r.lost_reason && c.stage !== "paid") {
        await db.update(customers).set({ profile: { ...c.profile, lostReason: r.lost_reason } }).where(eq(customers.id, c.id));
      }
      done++;
    } catch (e) {
      console.error("learning failed", e);
    }
  }
  return done;
}

/* ───────────── Growth report (on demand) ───────────── */

export async function generateGrowthReport(tenantId: string) {
  const t = await tenantOf(tenantId);
  const since = new Date(Date.now() - hours(24 * 30));
  const cs = await db.select().from(customers).where(and(eq(customers.tenantId, tenantId), gt(customers.createdAt, since)));
  const os = await db.select().from(orders).where(and(eq(orders.tenantId, tenantId), gt(orders.createdAt, since)));
  const count = (arr: string[]) => {
    const m = new Map<string, number>();
    for (const x of arr) m.set(x, (m.get(x) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k} (${v})`);
  };
  const data = {
    customers: cs.length,
    stages: count(cs.map((c) => c.stage)),
    needs: count(cs.flatMap((c) => c.profile.needs ?? [])),
    painPoints: count(cs.flatMap((c) => c.profile.painPoints ?? [])),
    objections: count(cs.flatMap((c) => c.profile.objections ?? [])),
    lostReasons: count(cs.map((c) => c.profile.lostReason ?? "").filter(Boolean)),
    orders: os.length,
    confirmed: os.filter((o) => o.status === "confirmed").length,
    revenue: os.filter((o) => o.status === "confirmed").reduce((a, o) => a + o.total, 0),
    handoffs: cs.filter((c) => c.handoffReason).map((c) => c.handoffReason).slice(0, 30),
  };
  const gaps = await db.select({ t: lessons.title }).from(lessons).where(and(eq(lessons.tenantId, tenantId), eq(lessons.kind, "gap"))).orderBy(desc(lessons.createdAt)).limit(30);
  const models = await platformModels();
  const text = await generate<string>({
    tenantId,
    model: s(t).ai.chatModel || models.chat,
    fallbackModel: models.lite,
    purpose: "report",
    system: `You are a sharp growth consultant for a Myanmar business "${t.name}". Write in Burmese, concise, plain text with short headings and bullet points (use "•"). Base everything only on the data.`,
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Last 30 days data (JSON):\n${JSON.stringify(data)}\nUnanswered questions customers asked: ${gaps.map((g) => g.t).join(" | ") || "none"}\n\nWrite: 1) အကျဉ်းချုပ် (key numbers, conversion) 2) Customer တွေ အများဆုံး လိုချင်တာ/ပြဿနာ 3) ဝယ်ဖို့ တားဆီးနေတဲ့ အကြောင်းရင်း နဲ့ ဖြေရှင်းနည်း 4) Data ထဲ ထပ်ဖြည့်သင့်တာ 5) ရောင်းအား တိုးဖို့ ဒီအပတ် လုပ်သင့်တဲ့ အရာ ၃ ခု (product/offer/content ideas).`,
          },
        ],
      },
    ],
    temperature: 0.4,
  });
  const [r] = await db.insert(reports).values({ tenantId, kind: "growth", content: text }).returning();
  return r;
}
const s = (t: Tenant) => resolveSettings(t.settings);

/* ───────────── Billing ───────────── */

export async function runBillingChecks() {
  const [p] = await db.select().from(platformSettings).limit(1);
  if (p?.lastBillingCheckAt && Date.now() - new Date(p.lastBillingCheckAt).getTime() < hours(6)) return 0;
  await db.update(platformSettings).set({ lastBillingCheckAt: new Date() }).where(eq(platformSettings.id, 1));
  const soon = await db
    .select()
    .from(tenants)
    .where(
      and(
        eq(tenants.status, "active"),
        isNotNull(tenants.expiresAt),
        lt(tenants.expiresAt, new Date(Date.now() + hours(24 * 3))),
        or(isNull(tenants.lastExpiryReminderAt), lt(tenants.lastExpiryReminderAt, new Date(Date.now() - hours(20)))),
      ),
    );
  for (const t of soon) {
    const expired = new Date(t.expiresAt!).getTime() < Date.now();
    const msg = expired
      ? `⛔ ${t.name} — သက်တမ်း ကုန်သွားပါပြီ (${new Date(t.expiresAt!).toDateString()})။ Grace ${t.graceDays} ရက်ပြီးရင် Bot ရပ်ပါမယ်။ လစဉ်ကြေး: ${t.monthlyFee.toLocaleString("en-US")} ကျပ်`
      : `⏰ ${t.name} — သက်တမ်း ${new Date(t.expiresAt!).toDateString()} မှာ ကုန်ပါမယ်။ လစဉ်ကြေး: ${t.monthlyFee.toLocaleString("en-US")} ကျပ်`;
    await notifySuperAdmin(msg);
    await notifyAdmins(t, "info", { text: `${msg}\nသက်တမ်းတိုးရန် Admin ကို ဆက်သွယ်ပါ။` });
    await db.update(tenants).set({ lastExpiryReminderAt: new Date() }).where(eq(tenants.id, t.id));
  }
  return soon.length;
}

/* ───────────── Daily summary (20:00 Myanmar time) ───────────── */

const summarySent = new Map<string, string>();
export async function runDailySummaries() {
  if (mmHour() < 20) return 0;
  const today = new Date().toISOString().slice(0, 10);
  const all = await db.select().from(tenants).where(eq(tenants.status, "active"));
  let n = 0;
  for (const t of all) {
    const st = s(t);
    if (!st.notifications.onDailySummary || !st.notifications.adminChats.length) continue;
    const key = `summary:${today}`;
    if (summarySent.get(t.id) === key || (t.settings as Record<string, unknown>)?.["_lastSummary"] === key) continue;
    const since = new Date(Date.now() - hours(24));
    const [{ newC }] = await db.select({ newC: sql<number>`count(*)::int` }).from(customers).where(and(eq(customers.tenantId, t.id), gt(customers.createdAt, since)));
    const os = await db.select().from(orders).where(and(eq(orders.tenantId, t.id), gt(orders.createdAt, since)));
    const [{ human }] = await db
      .select({ human: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(eq(customers.tenantId, t.id), eq(customers.needsHuman, true)));
    const [{ unanswered }] = await db
      .select({ unanswered: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(eq(customers.tenantId, t.id), eq(customers.unanswered, true)));
    const confirmed = os.filter((o) => o.status === "confirmed");
    await notifyAdmins(t, "summary", {
      text: `📊 ယနေ့ အကျဉ်းချုပ် — ${t.name}\n• Customer အသစ်: ${newC}\n• Order: ${os.length} (အတည်ပြုပြီး ${confirmed.length})\n• ဝင်ငွေ: ${confirmed.reduce((a, o) => a + o.total, 0).toLocaleString("en-US")} ကျပ်\n• လူကိုင်ရန် စောင့်နေ: ${human}\n• မဖြေရသေး: ${unanswered}`,
    });
    summarySent.set(t.id, key);
    await db
      .update(tenants)
      .set({ settings: sql`jsonb_set(coalesce(${tenants.settings}, '{}'::jsonb), '{_lastSummary}', to_jsonb(${key}::text))` })
      .where(eq(tenants.id, t.id));
    n++;
  }
  return n;
}
