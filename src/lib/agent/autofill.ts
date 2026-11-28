import { withDot } from "@/lib/myanmar";
import { and, desc, eq } from "drizzle-orm";
import type { Part } from "@google/genai";
import { db } from "@/db";
import { faqs, objections, products, reports, tenants } from "@/db/schema";
import { ALL_QUESTIONS } from "@/lib/questionnaire";
import { DEFAULT_SETTINGS, resolveSettings, type TenantSettings } from "@/lib/settings";
import { generate, platformModels } from "./gemini";

/**
 * AI Business Setup Agent.
 * The owner describes the business (text and/or voice). The agent
 *  1) researches the market and thinks like a business / sales / marketing consultant,
 *  2) fills every EMPTY field of the business data (profile, products, FAQ, objections, style, follow-up goals),
 *  3) lists the facts only the owner can supply (prices, accounts, real testimonials…),
 *  4) saves a consultant report.
 * Existing data is never overwritten unless `overwrite` is set.
 */

export type AutofillInput = {
  tenantId: string;
  text: string;
  audio?: { mime: string; data: Buffer };
  overwrite?: boolean;
};

export type AutofillResult = {
  ok: boolean;
  error?: string;
  transcript?: string;
  filledKeys: string[];
  addedProducts: string[];
  addedFaqs: number;
  addedObjections: number;
  updatedSettings: string[];
  todo: string[];
  summary: string;
  reportId?: string;
};

export type AutofillMeta = {
  at: string;
  filledKeys: string[];
  addedProducts: string[];
  addedFaqs: number;
  addedObjections: number;
  todo: string[];
  summary: string;
};

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    profile: {
      type: "array",
      description: "Answers for the business questionnaire. Only keys from the allowed list.",
      items: { type: "object", properties: { key: { type: "string" }, value: { type: "string" } }, required: ["key", "value"] },
    },
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["course", "product", "service"] },
          summary: { type: "string" },
          benefits: { type: "string" },
          details: { type: "string" },
          audience: { type: "string" },
          price: { type: "number", description: "MMK. 0 when the owner did not state a price." },
          price_stated_by_owner: { type: "boolean" },
          sale_price: { type: "number", description: "MMK, only if the owner stated a promotion price, else 0" },
          duration: { type: "string" },
          delivery_info: { type: "string" },
          bonus: { type: "string" },
        },
        required: ["name", "kind", "summary", "benefits", "price", "price_stated_by_owner"],
      },
    },
    faqs: {
      type: "array",
      items: { type: "object", properties: { question: { type: "string" }, answer: { type: "string" } }, required: ["question", "answer"] },
    },
    objections: {
      type: "array",
      items: { type: "object", properties: { objection: { type: "string" }, response: { type: "string" } }, required: ["objection", "response"] },
    },
    persona_style: { type: "string", description: "Extra speaking-style guidance for the AI salesperson for this business" },
    handoff_custom_rules: { type: "string", description: "Situations specific to this business that should go to a human" },
    followup_goals: { type: "array", items: { type: "string" }, description: "Exactly 2 goals: ~1 hour and ~20 hours after silence" },
    owner_todo: {
      type: "array",
      items: { type: "string" },
      description: "Facts only the owner can provide that are still missing (exact prices, payment accounts, real testimonials/numbers, contact, delivery fees…)",
    },
    summary: { type: "string", description: "3-6 bullet coaching summary for the owner, in Burmese" },
  },
  required: ["profile", "products", "faqs", "objections", "followup_goals", "owner_todo", "summary"],
};

type Plan = {
  profile: { key: string; value: string }[];
  products: {
    name: string;
    kind: "course" | "product" | "service";
    summary: string;
    benefits: string;
    details?: string;
    audience?: string;
    price: number;
    price_stated_by_owner: boolean;
    sale_price?: number;
    duration?: string;
    delivery_info?: string;
    bonus?: string;
  }[];
  faqs: { question: string; answer: string }[];
  objections: { objection: string; response: string }[];
  persona_style?: string;
  handoff_custom_rules?: string;
  followup_goals: string[];
  owner_todo: string[];
  summary: string;
};

const norm = (s: string) => s.toLowerCase().replace(/[\s\p{P}]+/gu, "");

function similar(a: string, b: string) {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

async function transcribe(tenantId: string, audio: { mime: string; data: Buffer }, lite: string, chat: string) {
  const text = await generate<string>({
    tenantId,
    model: lite,
    fallbackModel: chat,
    purpose: "autofill-transcribe",
    system:
      "You transcribe voice notes from Myanmar business owners. Output only the words actually spoken, in Burmese Unicode (keep English words as spoken). No commentary. Never guess or invent words: if the audio has no clear human speech (silence, noise, music, tones), output exactly NO_SPEECH. Mark unclear parts as (…).",
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: audio.mime, data: audio.data.toString("base64") } }, { text: "Transcribe this voice note." }] }],
    temperature: 0,
    thinkingLevel: "low",
  });
  const t = text.trim();
  return /^NO_SPEECH\.?$/i.test(t) || !t ? "" : t;
}

function currentDataSummary(profile: Record<string, string>, prods: { name: string; price: number }[], faqQs: string[], objs: string[]) {
  const filled = ALL_QUESTIONS.filter((q) => (profile[q.key] ?? "").trim()).map((q) => `- ${q.label}: ${profile[q.key]}`);
  return [
    filled.length ? `Already filled business data:\n${filled.join("\n")}` : "No business data filled yet.",
    prods.length ? `Existing products: ${prods.map((p) => `${p.name} (${p.price} MMK)`).join("; ")}` : "No products yet.",
    faqQs.length ? `Existing FAQ questions: ${faqQs.join(" | ")}` : "",
    objs.length ? `Existing objections: ${objs.join(" | ")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

export async function runAutofill(input: AutofillInput): Promise<AutofillResult> {
  const empty: AutofillResult = { ok: false, filledKeys: [], addedProducts: [], addedFaqs: 0, addedObjections: 0, updatedSettings: [], todo: [], summary: "" };
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, input.tenantId)).limit(1);
  if (!tenant) return { ...empty, error: "Tenant not found" };
  const models = await platformModels();
  const s0 = resolveSettings(tenant.settings);

  // 1) Owner input (voice → text)
  let transcript = "";
  if (input.audio) {
    try {
      transcript = await transcribe(tenant.id, input.audio, models.lite, models.chat);
    } catch (e) {
      return { ...empty, error: `အသံကို နားမလည်နိုင်ပါ: ${(e as Error).message}` };
    }
  }
  if (input.audio && !transcript && !input.text.trim()) {
    return { ...empty, error: "အသံထဲမှာ စကားပြောသံ မကြားရပါ — Microphone ကို စစ်ပြီး ပြန်ပြောပါ (သို့) စာနဲ့ ရေးပါ" };
  }
  const ownerText = [input.text.trim(), transcript].filter(Boolean).join("\n\n");
  if (ownerText.length < 20) return { ...empty, transcript, error: "လုပ်ငန်းအကြောင်း နည်းနည်း ပိုရေး (သို့) ပြောပေးပါ" };

  const [existingProducts, existingFaqs, existingObjs] = await Promise.all([
    db.select().from(products).where(eq(products.tenantId, tenant.id)),
    db.select().from(faqs).where(eq(faqs.tenantId, tenant.id)),
    db.select().from(objections).where(eq(objections.tenantId, tenant.id)),
  ]);
  const context = currentDataSummary(
    tenant.profile,
    existingProducts,
    existingFaqs.map((f) => f.question),
    existingObjs.map((o) => o.objection),
  );

  // 2) Deep research & consulting brief (thinking high, Google Search when available)
  const consultSystem = `You are a world-class business strategist, sales coach and marketing consultant who knows the Myanmar market deeply (Facebook/Messenger, TikTok, Telegram commerce; KBZPay/WavePay; buyer psychology of Myanmar customers; price sensitivity; trust building; Burmese language nuances).
A business owner described their business. Think deeply and produce a practical consulting brief that an AI salesperson and the owner will use. Research the market and competitors with Google Search when helpful.
Cover, concisely but thoroughly:
1. What the business really sells (the transformation/result, not just the product) and the business model.
2. Ideal customer segments in Myanmar, their real pains, fears, desires and buying triggers (use their own words/phrases where possible).
3. Positioning & USP vs alternatives/competitors; how to say it in one line.
4. Pricing psychology and offer structure (anchoring, bundles, urgency that is honest).
5. The top objections Myanmar customers will raise and the best responses (acknowledge → reframe → proof → close).
6. FAQs customers will ask, with answers derived ONLY from what the owner said or safe general knowledge.
7. Sales conversation strategy for chat (discovery questions, closing lines, follow-up angles).
8. Marketing ideas to grow (content angles, channels, lead magnets) suitable for Myanmar.
9. Facts the owner must still provide.
STRICT HONESTY: never invent concrete facts about this business (prices, numbers of customers, testimonials, guarantees, refund terms, contact details, dates, promotions, account numbers). Mark such items as "OWNER MUST PROVIDE".
Write in Burmese (technical terms may stay in English).`;
  const consultUser = `Business owner's description:\n"""\n${ownerText}\n"""\n\n${context}\n\nBusiness name (registered): ${tenant.name}`;

  let brief = "";
  try {
    brief = await generate<string>({
      tenantId: tenant.id,
      model: models.chat,
      fallbackModel: models.lite,
      purpose: "autofill-research",
      system: consultSystem,
      contents: [{ role: "user", parts: [{ text: consultUser }] }],
      temperature: 0.6,
      thinkingLevel: "high",
      googleSearch: true,
    });
  } catch {
    // Search grounding unavailable → retry without it.
    brief = await generate<string>({
      tenantId: tenant.id,
      model: models.chat,
      fallbackModel: models.lite,
      purpose: "autofill-research",
      system: consultSystem,
      contents: [{ role: "user", parts: [{ text: consultUser }] }],
      temperature: 0.6,
      thinkingLevel: "high",
    });
  }

  // 3) Turn the brief into structured data
  const allowed = ALL_QUESTIONS.map((q) => `${q.key} = ${q.label} (${q.why})`).join("\n");
  const planParts: Part[] = [
    {
      text: `OWNER'S OWN WORDS (the only source of business facts):\n"""\n${ownerText}\n"""\n\nCONSULTANT BRIEF:\n"""\n${brief}\n"""\n\n${context}`,
    },
  ];
  let plan: Plan;
  try {
    plan = await generate<Plan>({
      tenantId: tenant.id,
      model: models.chat,
      fallbackModel: models.lite,
      purpose: "autofill-structure",
      system: `You convert a consulting brief into data for an AI sales assistant's knowledge base. Write all values in natural, concise Burmese (Unicode) suitable to be said to customers; English product terms are fine.
The assistant is a woman named ${s0.persona.name}: customer-facing text (FAQ answers, objection responses) must use the female polite particle "${s0.persona.politeParticle}" / "${withDot(s0.persona.politeParticle)}" — never "ခင်ဗျာ" or "ခင်ဗျ".
Allowed profile keys (use exactly these keys):
${allowed}
Rules:
- Fill as many profile keys as can be answered well. Strategic content (ideal customer, pain points, desires, buy triggers, not_for, USP wording, competitors comparison, voice, closing_notes, forbidden claims, order steps) may be derived by expert reasoning.
- FACTS must come only from the owner's words: prices, promotion & end dates, numbers of customers/students, testimonials, guarantees, refund policy, delivery time, contact, opening hours, location. If the owner did not say it, leave that key out and add a clear item to owner_todo instead. Never put placeholders like "[...]" in values.
- forbidden: list risky claims the assistant must never make for this kind of business (e.g. guaranteed income), always appropriate to include.
- products: one entry per product/service/course the owner mentioned. price only if the owner stated it (price_stated_by_owner=true), else price 0 and false.
- faqs: 6-10 likely customer questions with answers grounded in the owner's words; if an answer needs a missing fact, skip that FAQ.
- objections: 5-8 most likely objections with persuasive, honest responses (acknowledge → reframe with value → proof/next step).
- followup_goals: exactly 2, specific to this business.
- persona_style and handoff_custom_rules: short and specific to this business.
- summary: 3-6 bullets of the most important coaching advice for the owner; start each bullet with "• " and put each on its own line.`,
      contents: [{ role: "user", parts: planParts }],
      schema: PLAN_SCHEMA,
      temperature: 0.4,
      thinkingLevel: "medium",
    });
  } catch (e) {
    return { ...empty, transcript, error: `AI error: ${(e as Error).message}` };
  }

  // 4) Apply — only into empty places unless overwrite
  const validKeys = new Set(ALL_QUESTIONS.map((q) => q.key));
  const profile = { ...tenant.profile };
  const filledKeys: string[] = [];
  for (const { key, value } of plan.profile ?? []) {
    const v = value?.trim();
    if (!validKeys.has(key) || !v || /\[[^\]]*\]/.test(v)) continue;
    if (!input.overwrite && (profile[key] ?? "").trim()) continue;
    profile[key] = v;
    filledKeys.push(key);
  }
  if (!(profile.business_name ?? "").trim()) {
    profile.business_name = tenant.name;
    filledKeys.push("business_name");
  }

  const addedProducts: string[] = [];
  for (const p of plan.products ?? []) {
    if (!p.name?.trim() || existingProducts.some((x) => similar(x.name, p.name))) continue;
    const priceKnown = p.price_stated_by_owner && p.price > 0;
    await db.insert(products).values({
      tenantId: tenant.id,
      kind: p.kind ?? "product",
      name: p.name.trim(),
      summary: p.summary ?? "",
      benefits: p.benefits ?? "",
      details: p.details ?? "",
      audience: p.audience ?? "",
      price: priceKnown ? Math.round(p.price) : 0,
      salePrice: priceKnown && p.sale_price && p.sale_price > 0 && p.sale_price < p.price ? Math.round(p.sale_price) : null,
      duration: p.duration ?? "",
      deliveryInfo: p.delivery_info ?? "",
      bonus: p.bonus ?? "",
      // Without a real price Thiri must not sell it yet.
      active: priceKnown,
    });
    addedProducts.push(priceKnown ? p.name.trim() : `${p.name.trim()} (စျေးနှုန်းထည့်ပြီး ဖွင့်ရန်)`);
  }

  let addedFaqs = 0;
  for (const f of plan.faqs ?? []) {
    if (!f.question?.trim() || !f.answer?.trim() || /\[[^\]]*\]/.test(f.answer)) continue;
    if (existingFaqs.some((x) => similar(x.question, f.question))) continue;
    await db.insert(faqs).values({ tenantId: tenant.id, question: f.question.trim(), answer: f.answer.trim(), source: "ai" });
    addedFaqs++;
  }
  let addedObjections = 0;
  for (const o of plan.objections ?? []) {
    if (!o.objection?.trim() || !o.response?.trim()) continue;
    if (existingObjs.some((x) => similar(x.objection, o.objection))) continue;
    await db.insert(objections).values({ tenantId: tenant.id, objection: o.objection.trim(), response: o.response.trim(), source: "ai" });
    addedObjections++;
  }

  // Settings: only replace untouched defaults
  const s = resolveSettings(tenant.settings);
  const cur = (tenant.settings ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = { ...cur };
  const updatedSettings: string[] = [];
  if (plan.persona_style?.trim() && (input.overwrite || !s.persona.extraStyle.trim())) {
    next.persona = { ...((cur.persona as object) ?? {}), extraStyle: plan.persona_style.trim() };
    updatedSettings.push("Thiri ပြောဆိုပုံ");
  }
  if (plan.handoff_custom_rules?.trim() && (input.overwrite || !s.handoff.customRules.trim())) {
    next.handoff = { ...((cur.handoff as object) ?? {}), customRules: plan.handoff_custom_rules.trim() };
    updatedSettings.push("လူကိုလွှဲရမယ့် ကိုယ်ပိုင်အခြေအနေ");
  }
  const goals = (plan.followup_goals ?? []).filter((g) => g?.trim()).slice(0, 2);
  const stepsAreDefault = JSON.stringify(s.followup.steps) === JSON.stringify(DEFAULT_SETTINGS.followup.steps);
  if (goals.length === 2 && (input.overwrite || stepsAreDefault)) {
    next.followup = {
      ...((cur.followup as object) ?? {}),
      steps: [
        { delayMinutes: s.followup.steps[0]?.delayMinutes ?? 60, goal: goals[0].trim() },
        { delayMinutes: s.followup.steps[1]?.delayMinutes ?? 1200, goal: goals[1].trim() },
      ],
    };
    updatedSettings.push("Follow-up ရည်ရွယ်ချက်");
  }
  const todo = (plan.owner_todo ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 15);
  const meta: AutofillMeta = {
    at: new Date().toISOString(),
    filledKeys,
    addedProducts,
    addedFaqs,
    addedObjections,
    todo,
    summary: (plan.summary ?? "").replace(/\s*•\s*/g, "\n• ").trim(),
  };
  next.autofill = meta;

  await db
    .update(tenants)
    .set({ profile, settings: next as Partial<TenantSettings>, updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));

  const [report] = await db
    .insert(reports)
    .values({
      tenantId: tenant.id,
      kind: "consultant",
      content: `## Business Coach အကျဉ်းချုပ်\n${meta.summary}\n\n## သင်ကိုယ်တိုင် ဖြည့်ရန်\n${todo.map((t) => `• ${t}`).join("\n") || "• မရှိပါ"}\n\n## အသေးစိတ် Analysis & Research\n${brief}`,
    })
    .returning();

  return {
    ok: true,
    transcript,
    filledKeys,
    addedProducts,
    addedFaqs,
    addedObjections,
    updatedSettings,
    todo,
    summary: meta.summary,
    reportId: report.id,
  };
}

export async function latestConsultantReport(tenantId: string) {
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.tenantId, tenantId), eq(reports.kind, "consultant")))
    .orderBy(desc(reports.createdAt))
    .limit(1);
  return row ?? null;
}
