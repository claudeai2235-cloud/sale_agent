/**
 * Local simulation of a customer conversation with Thiri (uses the "test" channel).
 * Usage: npx tsx --env-file=.env.local scripts/simulate.ts "msg1" "msg2" ...
 * Seeds a demo business on first run. Requires GEMINI_API_KEY.
 */
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { customers, messages, orders, paymentMethods, products, tenants, faqs, objections } from "../src/db/schema";
import { ingestInbound, processCustomer } from "../src/lib/agent/engine";
import { ensurePlatformRow } from "../src/lib/agent/jobs";

async function seed() {
  const [existing] = await db.select().from(tenants).where(eq(tenants.slug, "demo-ai-course")).limit(1);
  if (existing) {
    // Demo class batch: starts 6 Dec (Myanmar time), enrolment closes 4 Dec.
    await db
      .update(products)
      .set({ classStartAt: new Date("2026-12-06T09:00:00+06:30"), enrollDeadlineAt: new Date("2026-12-04T23:59:59+06:30") })
      .where(eq(products.tenantId, existing.id));
    return existing;
  }
  const [t] = await db
    .insert(tenants)
    .values({
      name: "Demo AI Academy",
      slug: "demo-ai-course",
      adminLinkCode: "DEMO1234",
      profile: {
        business_name: "Demo AI Academy",
        business_what: "အလုပ်ရှင်နဲ့ ဝန်ထမ်းတွေ AI ကို နေ့စဉ်အလုပ်မှာ လက်တွေ့သုံးတတ်အောင် ၇ ရက်အတွင်း Video Course နဲ့ သင်ပေးပါတယ်။",
        ideal_customer: "လုပ်ငန်းငယ်ပိုင်ရှင်၊ Online seller၊ ရုံးဝန်ထမ်း",
        pain_points: "Content ရေးရတာ အချိန်ကုန်၊ Customer စာပြန်မနိုင်၊ AI ဘယ်ကစရမှန်းမသိ",
        desires: "တစ်နေ့ ၃ နာရီ သက်သာ၊ အလုပ်တွေ အလိုအလျောက်ဖြစ်",
        usp: "Theory မဟုတ်ဘဲ လက်တွေ့ Workflow တွေကို လိုက်လုပ်ရင်း သင်ရ၊ မြန်မာလို",
        promotion: "ဒီလကုန်အထိ Promotion စျေး",
        discount_policy: "Promotion စျေးထက် ထပ်မလျှော့ပါ",
        order_steps: "Course ရွေး → အမည်၊ ဖုန်း၊ Gmail ပေး → ငွေလွှဲ → Screenshot ပို့",
        delivery: "ငွေစစ်ပြီး ၃၀ မိနစ်အတွင်း Course Link နဲ့ Telegram Group Link ပို့ပေး",
        refund_policy: "Digital course ဖြစ်လို့ ငွေပြန်မအမ်းပါ",
        forbidden: "ဝင်ငွေ အာမခံတယ်လို့ မပြောရ",
      },
      settings: {},
    })
    .returning();
  await db.insert(products).values({
    tenantId: t.id,
    kind: "course",
    name: "AI Basic Workflow — 7 Days Video Course",
    summary: "AI ကို နေ့စဉ်အလုပ်မှာ ၇ ရက်အတွင်း လက်တွေ့သုံးတတ်အောင် သင်ပေးတဲ့ Video Course",
    benefits: "Content ရေးချိန် သက်သာ၊ Customer စာပြန်တာ AI နဲ့ မြန်၊ English မကောင်းလည်း ရ",
    details: "Day1 AI အခြေခံ, Day2 Content, Day3 Customer service, Day4 Design, Day5 Excel/Data, Day6 Automation, Day7 ကိုယ်ပိုင် Workflow",
    price: 100000,
    salePrice: 70000,
    duration: "၇ ရက် (တစ်နေ့ မိနစ် ၃၀)",
    deliveryInfo: "Google Drive Video + Telegram Group",
  });
  await db.insert(paymentMethods).values([
    { tenantId: t.id, provider: "KBZPay", accountName: "Demo Name", accountNumber: "09-000000000" },
    { tenantId: t.id, provider: "WavePay", accountName: "Demo Name", accountNumber: "09-111111111" },
  ]);
  await db.insert(faqs).values({ tenantId: t.id, question: "ဖုန်းနဲ့ သင်လို့ရလား", answer: "ရပါတယ်၊ ဖုန်းနဲ့ပဲ ကြည့်ပြီး လုပ်လို့ရပါတယ်" });
  await db.insert(objections).values({ tenantId: t.id, objection: "စျေးကြီးတယ်", response: "တစ်ရက်ကို ၁၀,၀၀၀ ပဲကျပြီး အချိန် နာရီများစွာ သက်သာတာ နှိုင်းယှဉ်ပြ၊ Promotion စျေးကို သတိပေး" });
  return t;
}

async function main() {
  await ensurePlatformRow();
  const t = await seed();
  const reset = process.argv.includes("--reset");
  if (reset) await db.delete(customers).where(eq(customers.externalId, "sim-user"));
  const msgs = process.argv.slice(2).filter((a) => a !== "--reset");
  for (const text of msgs) {
    if (text.startsWith("@admin:")) {
      // Simulates the business admin replying by hand (e.g. sending the course link).
      const [c] = await db.select().from(customers).where(eq(customers.externalId, "sim-user"));
      await db.insert(messages).values({ tenantId: t.id, customerId: c.id, direction: "out", sender: "human", text: text.slice(7).trim(), handled: true });
      console.log(`\n🧑‍💼 ADMIN: ${text.slice(7).trim()}`);
      continue;
    }
    console.log(`\n👤 ${text}`);
    const r = await ingestInbound({ tenant: t, channel: null, channelType: "test", externalUserId: "sim-user", displayName: "Ma Su", text });
    if (!r) continue;
    const started = Date.now();
    const before = new Set((await db.select({ id: messages.id }).from(messages).where(eq(messages.customerId, r.customer.id))).map((m) => m.id));
    await processCustomer(r.customer.id, { force: true });
    const out = await db.select().from(messages).where(eq(messages.customerId, r.customer.id));
    const fresh = out.filter((m) => m.direction === "out" && !before.has(m.id));
    for (const m of fresh) console.log(`🤖 ${m.text}`);
    const [c] = await db.select().from(customers).where(eq(customers.id, r.customer.id));
    console.log(`   [stage=${c.stage} handoff=${c.handoffReason ?? "-"} needs=${(c.profile.needs ?? []).join("|")} pains=${(c.profile.painPoints ?? []).join("|")} enrolled=${(c.profile.enrolledProductIds ?? []).length} memory=${JSON.stringify(c.profile.memory ?? [])}] (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  }
  const os = await db.select().from(orders).where(eq(orders.tenantId, t.id));
  if (os.length) console.log("\nORDERS:", os.map((o) => `#${o.code} ${o.total} ${o.status} ${JSON.stringify(o.fields)}`).join("\n"));
  process.exit(0);
}
main();
