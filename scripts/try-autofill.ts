// Dev helper: runs the AI business-setup agent on a fresh empty tenant.
// Usage: npx tsx --env-file=.env.local scripts/try-autofill.ts "owner description"
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { faqs, objections, products, tenants } from "../src/db/schema";
import { runAutofill } from "../src/lib/agent/autofill";
(async () => {
  await db.delete(tenants).where(eq(tenants.slug, "autofill-test"));
  const [t] = await db.insert(tenants).values({ name: "Zwel AI Academy", slug: "autofill-test", adminLinkCode: "AUTOTEST" }).returning();
  const started = Date.now();
  const r = await runAutofill({ tenantId: t.id, text: process.argv[2] });
  console.log(`⏱ ${((Date.now() - started) / 1000).toFixed(0)}s`, JSON.stringify({ ...r, summary: undefined }, null, 1));
  console.log("\nSUMMARY:\n" + r.summary);
  const [after] = await db.select().from(tenants).where(eq(tenants.id, t.id));
  for (const k of ["ideal_customer", "pain_points", "usp", "forbidden", "promotion", "proof"]) console.log(`\n[${k}] ${after.profile[k] ?? "(empty)"}`);
  const ps = await db.select().from(products).where(eq(products.tenantId, t.id));
  console.log("\nPRODUCTS:", ps.map((p) => `${p.name} | price=${p.price} | active=${p.active}`));
  const fs = await db.select().from(faqs).where(eq(faqs.tenantId, t.id));
  console.log("FAQ sample:", fs.slice(0, 2).map((f) => `${f.question} → ${f.answer}`));
  const os = await db.select().from(objections).where(eq(objections.tenantId, t.id));
  console.log("OBJ sample:", os.slice(0, 2).map((o) => `${o.objection} → ${o.response}`));
  process.exit(0);
})();
