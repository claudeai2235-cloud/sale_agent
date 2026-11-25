import { and, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders, reports } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { formatMMK } from "@/lib/myanmar";
import { daysAgo, fmt, mmHour } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader, Stat, STAGE_LABEL } from "@/components/ui";
import { generateReportAction } from "../actions";

function top(arr: string[], n = 8) {
  const m = new Map<string, number>();
  for (const x of arr) {
    const k = x.trim();
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function Bars({ rows }: { rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  if (!rows.length) return <p className="text-sm text-muted">Data မရှိသေးပါ</p>;
  return (
    <ul className="space-y-2">
      {rows.map(([k, v]) => (
        <li key={k} className="text-sm">
          <div className="flex justify-between gap-2">
            <span className="truncate">{k}</span>
            <span className="text-muted">{v}</span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-gray-100">
            <div className="h-full rounded-full bg-brand" style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default async function InsightsPage({ params }: PageProps<"/t/[tenantId]/insights">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const since = daysAgo(30);
  const [cs, os, rs] = await Promise.all([
    db.select().from(customers).where(and(eq(customers.tenantId, tenantId), gt(customers.createdAt, since), ne(customers.channelType, "test"))),
    db.select().from(orders).where(and(eq(orders.tenantId, tenantId), gt(orders.createdAt, since))),
    db.select().from(reports).where(eq(reports.tenantId, tenantId)).orderBy(desc(reports.createdAt)).limit(5),
  ]);
  const funnel = (["new", "interested", "considering", "ready", "ordered", "paid", "lost"] as const).map((s) => [STAGE_LABEL[s].label, cs.filter((c) => c.stage === s).length] as [string, number]);
  const hours = new Array(24).fill(0) as number[];
  for (const c of cs) if (c.lastInboundAt) hours[mmHour(new Date(c.lastInboundAt))]++;
  const confirmed = os.filter((o) => o.status === "confirmed");
  const prodSales = top(confirmed.flatMap((o) => o.items.flatMap((i) => Array(i.qty).fill(i.name) as string[])));
  return (
    <div className="space-y-6">
      <PageHeader title="Growth Insights (ရက် ၃၀)" desc="Customer တွေနဲ့ စကားပြောရင်း Thiri က စုဆောင်းထားတဲ့ Data — ဘာလိုချင်လဲ၊ ဘာကြောင့် မဝယ်လဲ၊ ဘယ်အချိန် အများဆုံး စာပို့လဲ" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Customer" value={cs.length} />
        <Stat label="Order" value={os.length} />
        <Stat label="ဝင်ငွေ" value={formatMMK(confirmed.reduce((a, o) => a + o.total, 0))} tone="green" />
        <Stat label="ပျမ်းမျှ Order တန်ဖိုး" value={formatMMK(confirmed.length ? Math.round(confirmed.reduce((a, o) => a + o.total, 0) / confirmed.length) : 0)} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="🎯 အရောင်း Funnel">
          <Bars rows={funnel} />
        </Card>
        <Card title="💭 Customer လိုအပ်ချက်များ">
          <Bars rows={top(cs.flatMap((c) => c.profile.needs ?? []))} />
        </Card>
        <Card title="😣 ကြုံနေရတဲ့ ပြဿနာများ">
          <Bars rows={top(cs.flatMap((c) => c.profile.painPoints ?? []))} />
        </Card>
        <Card title="🛑 ဝယ်ဖို့ တွန့်ဆုတ်ရတဲ့ အကြောင်းရင်း">
          <Bars rows={top(cs.flatMap((c) => c.profile.objections ?? []))} />
        </Card>
        <Card title="👋 မဝယ်ဖြစ်ရတဲ့ အကြောင်းရင်း">
          <Bars rows={top(cs.map((c) => c.profile.lostReason ?? ""))} />
        </Card>
        <Card title="🏆 အရောင်းရဆုံး">
          <Bars rows={prodSales} />
        </Card>
      </div>
      <Card title="🕐 Customer စာပို့တဲ့ အချိန် (မြန်မာစံတော်ချိန်)">
        <div className="flex h-32 items-end gap-1">
          {hours.map((v, h) => (
            <div key={h} className="flex flex-1 flex-col items-center gap-1">
              <div className="w-full rounded-t bg-brand/80" style={{ height: `${(v / Math.max(1, ...hours)) * 100}%` }} title={`${h}:00 — ${v}`} />
              <span className="text-[9px] text-muted">{h}</span>
            </div>
          ))}
        </div>
      </Card>
      <Card title="📊 AI Growth Report" desc="Data တွေကို AI က ခွဲခြမ်းစိတ်ဖြာပြီး ဒီအပတ် လုပ်သင့်တာတွေကို အကြံပြုပါမယ်">
        <ActionForm action={generateReportAction}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <SubmitButton>Report အသစ်ထုတ်မည်</SubmitButton>
        </ActionForm>
        <div className="mt-4 space-y-4">
          {rs.map((r) => (
            <details key={r.id} open={r.id === rs[0]?.id} className="rounded-lg border border-line p-4">
              <summary className="cursor-pointer text-sm font-medium">{fmt(r.createdAt)}</summary>
              <div className="mt-3 whitespace-pre-wrap text-sm">{r.content}</div>
            </details>
          ))}
        </div>
      </Card>
    </div>
  );
}
