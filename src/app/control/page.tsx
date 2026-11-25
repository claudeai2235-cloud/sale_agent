import Link from "next/link";
import { and, desc, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, channels, customers, orders, tenants } from "@/db/schema";
import { formatMMK } from "@/lib/myanmar";
import { fmtDate, nowMs } from "@/lib/time";
import { Badge, Empty, LinkButton, PageHeader, Stat } from "@/components/ui";

export default async function ControlHome() {
  const monthStart = new Date();
  monthStart.setDate(1);
  const [ts, chs, cs, os, usage] = await Promise.all([
    db.select().from(tenants).orderBy(desc(tenants.createdAt)),
    db.select({ tenantId: channels.tenantId, type: channels.type, active: channels.active }).from(channels),
    db.select({ tenantId: customers.tenantId, n: sql<number>`count(*)::int` }).from(customers).groupBy(customers.tenantId),
    db
      .select({ tenantId: orders.tenantId, n: sql<number>`count(*)::int`, rev: sql<number>`coalesce(sum(case when ${orders.status}='confirmed' then ${orders.total} else 0 end),0)::int` })
      .from(orders)
      .where(gte(orders.createdAt, monthStart))
      .groupBy(orders.tenantId),
    db
      .select({ tenantId: aiUsage.tenantId, calls: sql<number>`sum(${aiUsage.calls})::int`, tokens: sql<number>`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens})::int` })
      .from(aiUsage)
      .where(and(gte(aiUsage.day, monthStart.toISOString().slice(0, 10))))
      .groupBy(aiUsage.tenantId),
  ]);
  const now = nowMs();
  const active = ts.filter((t) => t.status === "active");
  const expSoon = ts.filter((t) => t.expiresAt && new Date(t.expiresAt).getTime() - now < 7 * 86_400_000);
  const mrr = active.reduce((a, t) => a + t.monthlyFee, 0);
  const totalTokens = usage.reduce((a, u) => a + (u.tokens ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHeader title="လုပ်ငန်းများ" desc="သင်ထိန်းချုပ်ထားတဲ့ Bot နဲ့ Dashboard အားလုံး" actions={<LinkButton href="/control/new">+ လုပ်ငန်းအသစ် ဖန်တီးမည်</LinkButton>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Active လုပ်ငန်း" value={active.length} sub={`စုစုပေါင်း ${ts.length}`} />
        <Stat label="လစဉ်ဝင်ငွေ (MRR)" value={formatMMK(mrr)} tone="green" />
        <Stat label="၇ ရက်အတွင်း သက်တမ်းကုန်" value={expSoon.length} tone={expSoon.length ? "red" : undefined} />
        <Stat label="ဒီလ AI Token" value={totalTokens.toLocaleString("en-US")} sub={`${usage.reduce((a, u) => a + (u.calls ?? 0), 0)} calls`} />
      </div>
      {!ts.length ? (
        <Empty>
          လုပ်ငန်း မရှိသေးပါ — <Link href="/control/new" className="text-brand">ပထမဆုံး လုပ်ငန်း (သင့်လုပ်ငန်း) ကို ဖန်တီးပါ</Link>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs text-muted">
              <tr>
                <th className="p-3">လုပ်ငန်း</th>
                <th className="p-3">Channel</th>
                <th className="p-3">Customer</th>
                <th className="p-3">ဒီလ Order / ဝင်ငွေ</th>
                <th className="p-3">AI (ဒီလ)</th>
                <th className="p-3">သက်တမ်း</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ts.map((t) => {
                const ch = chs.filter((c) => c.tenantId === t.id);
                const o = os.find((x) => x.tenantId === t.id);
                const u = usage.find((x) => x.tenantId === t.id);
                const expired = t.expiresAt && new Date(t.expiresAt).getTime() < now;
                const soon = t.expiresAt && !expired && new Date(t.expiresAt).getTime() - now < 7 * 86_400_000;
                return (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="p-3">
                      <Link href={`/control/${t.id}`} className="font-medium hover:text-brand">
                        {t.name}
                      </Link>
                      <div className="flex gap-1 pt-0.5">
                        {t.status !== "active" && <Badge tone="red">ပိတ်</Badge>}
                        {!t.botEnabled && <Badge tone="amber">Bot ပိတ်</Badge>}
                        <Badge>{t.planName}</Badge>
                      </div>
                    </td>
                    <td className="p-3">{ch.map((c) => (c.type === "telegram" ? "✈️" : "💬")).join(" ") || "-"}</td>
                    <td className="p-3">{cs.find((x) => x.tenantId === t.id)?.n ?? 0}</td>
                    <td className="p-3">
                      {o?.n ?? 0} / {formatMMK(o?.rev ?? 0)}
                    </td>
                    <td className="p-3 text-xs">{u ? `${u.calls} calls · ${(u.tokens / 1000).toFixed(0)}k tok` : "-"}</td>
                    <td className="p-3">
                      {t.expiresAt ? <Badge tone={expired ? "red" : soon ? "amber" : "green"}>{fmtDate(t.expiresAt)}</Badge> : <Badge>အကန့်အသတ်မဲ့</Badge>}
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/t/${t.id}`} className="text-brand">
                        Dashboard →
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
