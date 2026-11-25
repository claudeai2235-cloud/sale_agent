import Link from "next/link";
import { and, eq, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { customers, lessons, orders } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { SideNav } from "@/components/nav";
import { logoutAction } from "@/app/auth-actions";

export default async function TenantLayout({ children, params }: LayoutProps<"/t/[tenantId]">) {
  const { tenantId } = await params;
  const { session, tenant } = await requireTenant(tenantId);
  const [[{ inbox }], [{ ord }], [{ learn }]] = await Promise.all([
    db
      .select({ inbox: sql<number>`count(*)::int` })
      .from(customers)
      .where(and(eq(customers.tenantId, tenantId), or(eq(customers.needsHuman, true), eq(customers.unanswered, true)), sql`${customers.channelType} <> 'test'`)),
    db.select({ ord: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.tenantId, tenantId), eq(orders.status, "payment_submitted"))),
    db.select({ learn: sql<number>`count(*)::int` }).from(lessons).where(and(eq(lessons.tenantId, tenantId), eq(lessons.status, "pending"))),
  ]);
  const b = `/t/${tenantId}`;
  const items = [
    { href: b, label: "ပင်မ", icon: "🏠" },
    { href: `${b}/inbox`, label: "စကားဝိုင်းများ", icon: "💬", badge: inbox },
    { href: `${b}/orders`, label: "Order များ", icon: "🧾", badge: ord },
    { href: `${b}/autofill`, label: "AI နဲ့ အလိုအလျောက်ဖြည့်", icon: "🪄" },
    { href: `${b}/setup`, label: "လုပ်ငန်းအချက်အလက်", icon: "📋" },
    { href: `${b}/products`, label: "ပစ္စည်း / ဝန်ဆောင်မှု", icon: "📦" },
    { href: `${b}/knowledge`, label: "FAQ & Objection", icon: "💡" },
    { href: `${b}/payments`, label: "ငွေပေးချေမှု & Order", icon: "💳" },
    { href: `${b}/persona`, label: "Thiri & AI Setting", icon: "👩‍💼" },
    { href: `${b}/handoff`, label: "လူကိုလွှဲခြင်း", icon: "🙋" },
    { href: `${b}/followup`, label: "Follow-up", icon: "⏰" },
    { href: `${b}/channels`, label: "Messenger / Telegram", icon: "🔌" },
    { href: `${b}/learning`, label: "AI သင်ယူမှု", icon: "🧠", badge: learn },
    { href: `${b}/insights`, label: "Growth Insights", icon: "📈" },
    { href: `${b}/test`, label: "Thiri ကို စမ်းရန်", icon: "🧪" },
  ];
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-panel p-3 lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="mb-3 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand font-bold text-white">T</div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{tenant.name}</div>
            <div className="text-xs text-muted">Thiri AI Sales</div>
          </div>
        </div>
        <SideNav items={items} />
        <div className="mt-4 space-y-1 border-t border-line px-2 pt-3 text-xs text-muted">
          {session.role === "super_admin" && (
            <Link href="/control" className="block hover:text-brand">
              ← Control Center
            </Link>
          )}
          <form action={logoutAction}>
            <button className="hover:text-brand">ထွက်မည်</button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        {tenant.status !== "active" && (
          <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">ဒီလုပ်ငန်း Account ကို ယာယီ ပိတ်ထားပါတယ်။ Bot မဖြေပါ။</div>
        )}
        {tenant.expiresAt && new Date(tenant.expiresAt) < new Date() && (
          <div className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
            သက်တမ်း ကုန်သွားပါပြီ။ Grace period ({tenant.graceDays} ရက်) ပြီးရင် Bot ရပ်ပါမယ်။ သက်တမ်းတိုးရန် Admin ကို ဆက်သွယ်ပါ။
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
