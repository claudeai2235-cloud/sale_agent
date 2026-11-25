import Link from "next/link";
import { and, desc, eq, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, orders } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { formatMMK } from "@/lib/myanmar";
import { fmt } from "@/lib/time";
import { SubmitButton } from "@/components/action-form";
import { Badge, Empty, ORDER_STATUS, PageHeader } from "@/components/ui";
import { orderAction } from "../actions";

export default async function OrdersPage({ params, searchParams }: PageProps<"/t/[tenantId]/orders">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const st = typeof sp.s === "string" ? sp.s : "";
  await requireTenant(tenantId);
  const conds: SQL[] = [eq(orders.tenantId, tenantId)];
  if (st) conds.push(eq(orders.status, st as "confirmed"));
  const rows = await db
    .select({ o: orders, c: customers })
    .from(orders)
    .innerJoin(customers, eq(customers.id, orders.customerId))
    .where(and(...conds))
    .orderBy(desc(orders.createdAt))
    .limit(200);
  const proofUrl = (o: (typeof rows)[number]["o"]) => (o.paymentProof ? `/api/media/${o.paymentProof.messageId}?i=${o.paymentProof.index}` : null);
  const b = `/t/${tenantId}/orders`;
  const hid = <input type="hidden" name="tenantId" value={tenantId} />;
  return (
    <div>
      <PageHeader title="Order များ" desc="ငွေလွှဲ Screenshot ကို စစ်ပြီး ✅ အတည်ပြုရင် Customer ကို “ငွေရပါပြီ” စာ အလိုအလျောက် ပို့ပေးပါတယ်" />
      <div className="mb-4 flex flex-wrap gap-2">
        {[["", "အားလုံး"], ...Object.entries(ORDER_STATUS).map(([k, v]) => [k, v.label])].map(([k, label]) => (
          <Link key={k} href={k ? `${b}?s=${k}` : b} className={`rounded-full border px-3 py-1 text-sm ${st === k ? "border-brand bg-brand-soft text-brand" : "border-line bg-white"}`}>
            {label}
          </Link>
        ))}
      </div>
      {!rows.length && <Empty>Order မရှိသေးပါ</Empty>}
      <div className="space-y-3">
        {rows.map(({ o, c }) => {
          const img = proofUrl(o);
          return (
            <div key={o.id} className="flex flex-wrap gap-4 rounded-xl border border-line bg-panel p-4 shadow-sm">
              {img && (
                <a href={img} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img} alt="payment" className="h-28 w-20 rounded-lg object-cover" />
                </a>
              )}
              <div className="min-w-0 flex-1 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">#{o.code}</span>
                  <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                  {o.note === "COD" && <Badge tone="blue">COD</Badge>}
                  <span className="text-xs text-muted">{fmt(o.createdAt)}</span>
                </div>
                <div className="mt-1">{o.items.map((i) => `${i.name} x${i.qty}`).join(", ")}</div>
                <div className="font-semibold">{formatMMK(o.total)} {o.paymentMethod && <span className="font-normal text-muted">· {o.paymentMethod}</span>}</div>
                {o.paymentProof?.detectedAmount && o.paymentProof.detectedAmount !== o.total && (
                  <div className="text-xs text-amber-700">⚠️ Screenshot ပေါ်က ပမာဏ {formatMMK(o.paymentProof.detectedAmount)}</div>
                )}
                <div className="mt-1 text-xs text-muted">
                  {Object.entries(o.fields).map(([k, v]) => `${k}: ${v}`).join(" · ")} ·{" "}
                  <Link href={`/t/${tenantId}/inbox?c=${c.id}`} className="text-brand">
                    စကားဝိုင်း →
                  </Link>
                </div>
              </div>
              {(o.status === "awaiting_payment" || o.status === "payment_submitted") && (
                <div className="flex items-start gap-2">
                  <form action={orderAction}>
                    {hid}
                    <input type="hidden" name="orderId" value={o.id} />
                    <input type="hidden" name="op" value="confirm" />
                    <SubmitButton confirm="ငွေရကြောင်း အတည်ပြုပြီး Customer ကို အကြောင်းကြားမလား?">✅ အတည်ပြု</SubmitButton>
                  </form>
                  <form action={orderAction}>
                    {hid}
                    <input type="hidden" name="orderId" value={o.id} />
                    <input type="hidden" name="op" value="cancel" />
                    <SubmitButton variant="ghost" confirm="ပယ်ဖျက်မလား?">ပယ်ဖျက်</SubmitButton>
                  </form>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
