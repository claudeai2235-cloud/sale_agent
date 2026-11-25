import Link from "next/link";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { channels, customers, orders, paymentMethods, products } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { profileCompleteness } from "@/lib/questionnaire";
import { resolveSettings } from "@/lib/settings";
import { formatMMK } from "@/lib/myanmar";
import { daysAgo, fmt } from "@/lib/time";
import { Badge, Card, PageHeader, Stat, STAGE_LABEL } from "@/components/ui";

export default async function Overview({ params }: PageProps<"/t/[tenantId]">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const since = daysAgo(30);
  const [cs, os, chs, [{ np }], [{ npm }]] = await Promise.all([
    db.select().from(customers).where(and(eq(customers.tenantId, tenantId), gt(customers.createdAt, since), sql`${customers.channelType} <> 'test'`)).orderBy(desc(customers.updatedAt)),
    db.select().from(orders).where(and(eq(orders.tenantId, tenantId), gt(orders.createdAt, since))),
    db.select().from(channels).where(eq(channels.tenantId, tenantId)),
    db.select({ np: sql<number>`count(*)::int` }).from(products).where(eq(products.tenantId, tenantId)),
    db.select({ npm: sql<number>`count(*)::int` }).from(paymentMethods).where(eq(paymentMethods.tenantId, tenantId)),
  ]);
  const comp = profileCompleteness(tenant.profile);
  const s = resolveSettings(tenant.settings);
  const confirmed = os.filter((o) => o.status === "confirmed");
  const revenue = confirmed.reduce((a, o) => a + o.total, 0);
  const conv = cs.length ? Math.round((cs.filter((c) => c.stage === "paid").length / cs.length) * 100) : 0;
  const b = `/t/${tenantId}`;

  const checklist = [
    { done: !!s.autofill, label: "🪄 လုပ်ငန်းအကြောင်း ရေး/ပြောပြီး AI ကို အကုန်ဖြည့်ခိုင်းရန် (အမြန်ဆုံးနည်း)", href: `${b}/autofill` },
    { done: comp.importantMissing.length === 0, label: `လုပ်ငန်းအချက်အလက် ဖြည့်ရန် (${comp.percent}%)`, href: `${b}/setup` },
    { done: np > 0, label: "ပစ္စည်း/Course အနည်းဆုံး ၁ ခု ထည့်ရန်", href: `${b}/products` },
    { done: npm > 0, label: "ငွေပေးချေမှု နည်းလမ်း ထည့်ရန်", href: `${b}/payments` },
    { done: chs.some((c) => c.active), label: "Messenger / Telegram ချိတ်ရန်", href: `${b}/channels` },
    { done: s.notifications.adminChats.length > 0, label: "Admin အကြောင်းကြားချက် Telegram ချိတ်ရန်", href: `${b}/channels` },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={`မင်္ဂလာပါ 👋 — ${tenant.name}`} desc="လွန်ခဲ့သော ရက် ၃၀ အတွင်း အခြေအနေ" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customer" value={cs.length} sub={`လူကိုင်ရန် ${cs.filter((c) => c.needsHuman).length}`} />
        <Stat label="Order" value={os.length} sub={`အတည်ပြုပြီး ${confirmed.length}`} />
        <Stat label="ဝင်ငွေ (အတည်ပြုပြီး)" value={formatMMK(revenue)} tone="green" />
        <Stat label="Conversion" value={`${conv}%`} sub="Customer → ငွေချေ" />
      </div>
      {checklist.some((c) => !c.done) && (
        <Card title="စတင်ရန် လိုအပ်ချက်များ" desc="ဒီအဆင့်တွေ ပြည့်စုံမှ Thiri က အကောင်းဆုံး ရောင်းပေးနိုင်မှာပါ">
          <ul className="space-y-2">
            {checklist.map((c) => (
              <li key={c.label}>
                <Link href={c.href} className="flex items-center gap-2 text-sm hover:text-brand">
                  <span>{c.done ? "✅" : "⬜"}</span>
                  <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card title="နောက်ဆုံး စကားဝိုင်းများ" actions={<Link href={`${b}/inbox`} className="text-sm text-brand">အားလုံးကြည့်ရန် →</Link>}>
        <div className="divide-y divide-line">
          {cs.slice(0, 8).map((c) => (
            <Link key={c.id} href={`${b}/inbox?c=${c.id}`} className="flex items-center gap-3 py-2 text-sm hover:bg-gray-50">
              <span className="flex-1 truncate font-medium">{c.name || c.displayName || "Customer"}</span>
              {c.needsHuman && <Badge tone="red">လူကိုင်ရန်</Badge>}
              <Badge tone={STAGE_LABEL[c.stage].tone}>{STAGE_LABEL[c.stage].label}</Badge>
              <span className="hidden text-xs text-muted sm:inline">{fmt(c.updatedAt)}</span>
            </Link>
          ))}
          {!cs.length && <p className="py-4 text-sm text-muted">စကားဝိုင်း မရှိသေးပါ</p>}
        </div>
      </Card>
    </div>
  );
}
