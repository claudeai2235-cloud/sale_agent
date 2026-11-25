import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { aiUsage, channels, tenantPayments, tenants, users } from "@/db/schema";
import { formatMMK } from "@/lib/myanmar";
import { fmt, fmtDate } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, LinkButton, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { addTenantUser, deleteTenant, deleteTenantUser, recordPayment, resetUserPassword, updateTenant } from "../actions";

export default async function ManageTenant({ params }: PageProps<"/control/[tenantId]">) {
  const { tenantId } = await params;
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!t) notFound();
  const [pays, us, chs, usage] = await Promise.all([
    db.select().from(tenantPayments).where(eq(tenantPayments.tenantId, tenantId)).orderBy(desc(tenantPayments.createdAt)),
    db.select().from(users).where(eq(users.tenantId, tenantId)),
    db.select().from(channels).where(eq(channels.tenantId, tenantId)),
    db
      .select({ day: aiUsage.day, calls: sql<number>`sum(${aiUsage.calls})::int`, inp: sql<number>`sum(${aiUsage.inputTokens})::int`, out: sql<number>`sum(${aiUsage.outputTokens})::int` })
      .from(aiUsage)
      .where(eq(aiUsage.tenantId, tenantId))
      .groupBy(aiUsage.day)
      .orderBy(desc(aiUsage.day))
      .limit(14),
  ]);
  const exp = t.expiresAt ? new Date(new Date(t.expiresAt).getTime() + 6.5 * 3600_000).toISOString().slice(0, 10) : "";
  const hid = <input type="hidden" name="tenantId" value={t.id} />;
  return (
    <div className="space-y-6">
      <PageHeader
        title={t.name}
        desc={<>Admin link code: <code className="font-mono">{t.adminLinkCode}</code> · ဖန်တီးခဲ့: {fmtDate(t.createdAt)}</>}
        actions={<LinkButton href={`/t/${t.id}`}>Dashboard ဝင်မည် →</LinkButton>}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="⚙️ အခြေအနေ နဲ့ Plan">
          <ActionForm action={updateTenant}>
            {hid}
            <Field label="အမည်">
              <Input name="name" defaultValue={t.name} />
            </Field>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Status">
                <Select name="status" defaultValue={t.status}>
                  <option value="active">Active</option>
                  <option value="suspended">ပိတ်ထား (Suspended)</option>
                </Select>
              </Field>
              <Field label="Plan">
                <Input name="planName" defaultValue={t.planName} />
              </Field>
              <Field label="လစဉ်ကြေး">
                <Input name="monthlyFee" type="number" defaultValue={t.monthlyFee} />
              </Field>
              <Field label="သက်တမ်းကုန်ရက်" hint="ဗလာ = အကန့်အသတ်မဲ့">
                <Input name="expiresAt" type="date" defaultValue={exp} />
              </Field>
              <Field label="Grace ရက်" hint="သက်တမ်းကုန်ပြီး Bot ဆက်ဖြေမယ့်ရက်">
                <Input name="graceDays" type="number" defaultValue={t.graceDays} />
              </Field>
            </div>
            <Toggle name="botEnabled" label="Bot ဖွင့်ထား" defaultChecked={t.botEnabled} />
            <Field label="Billing မှတ်ချက်">
              <Textarea name="billingNote" defaultValue={t.billingNote ?? ""} />
            </Field>
            <SubmitButton />
          </ActionForm>
        </Card>
        <div className="space-y-6">
          <Card title="💰 လစဉ်ကြေး ရရှိမှု မှတ်တမ်းသွင်း / သက်တမ်းတိုး" desc={t.expiresAt ? `လက်ရှိ ကုန်ရက်: ${fmtDate(t.expiresAt)}` : "အကန့်အသတ်မဲ့"}>
            <ActionForm action={recordPayment} resetOnSuccess>
              {hid}
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="လ">
                  <Input name="months" type="number" min={1} defaultValue={1} />
                </Field>
                <Field label="ပမာဏ">
                  <Input name="amount" type="number" defaultValue={t.monthlyFee} />
                </Field>
                <Field label="နည်းလမ်း">
                  <Input name="method" placeholder="KBZPay" />
                </Field>
              </div>
              <Field label="မှတ်ချက်">
                <Input name="note" />
              </Field>
              <SubmitButton>မှတ်တမ်းသွင်းပြီး သက်တမ်းတိုးမည်</SubmitButton>
            </ActionForm>
            <div className="mt-4 divide-y divide-line text-sm">
              {pays.map((p) => (
                <div key={p.id} className="flex justify-between py-2">
                  <span>
                    {fmtDate(p.createdAt)} · {p.months} လ {p.method && `· ${p.method}`}
                  </span>
                  <span className="font-medium">{formatMMK(p.amount)}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="🔌 Channel များ">
            {chs.map((c) => (
              <div key={c.id} className="flex items-center gap-2 py-1 text-sm">
                {c.type === "telegram" ? "✈️" : "💬"} {c.name} <Badge tone={c.active ? "green" : "gray"}>{c.active ? "on" : "off"}</Badge>
                {c.lastError && <span className="truncate text-xs text-red-600">{c.lastError}</span>}
              </div>
            ))}
            {!chs.length && <p className="text-sm text-muted">မချိတ်ရသေး</p>}
            <Link href={`/t/${t.id}/channels`} className="mt-2 inline-block text-sm text-brand">
              Channel စီမံရန် →
            </Link>
          </Card>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="👤 Dashboard Login များ (လုပ်ငန်းရှင်)">
          <div className="mb-4 divide-y divide-line">
            {us.map((u) => (
              <div key={u.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="flex-1">
                  {u.email} <Badge>{u.role === "tenant_owner" ? "Owner" : "Staff"}</Badge>
                </span>
                <ActionForm action={resetUserPassword} className="flex gap-1">
                  {hid}
                  <input type="hidden" name="userId" value={u.id} />
                  <Input name="password" type="password" placeholder="Password အသစ်" className="w-36" />
                  <SubmitButton variant="ghost">ပြောင်း</SubmitButton>
                </ActionForm>
                <form action={deleteTenantUser}>
                  {hid}
                  <input type="hidden" name="userId" value={u.id} />
                  <SubmitButton variant="ghost" confirm="ဖျက်မလား?">ဖျက်</SubmitButton>
                </form>
              </div>
            ))}
            {!us.length && <p className="py-2 text-sm text-muted">Login မပေးထားပါ — သင်ကိုယ်တိုင်ပဲ စီမံနေပါတယ်</p>}
          </div>
          <ActionForm action={addTenantUser} resetOnSuccess>
            {hid}
            <div className="grid gap-2 md:grid-cols-2">
              <Input name="name" placeholder="နာမည်" />
              <Input name="email" type="email" placeholder="Email" required />
              <Input name="password" type="password" placeholder="Password (၈ လုံးအထက်)" required />
              <Select name="role" defaultValue="tenant_owner">
                <option value="tenant_owner">Owner</option>
                <option value="tenant_staff">Staff</option>
              </Select>
            </div>
            <SubmitButton>Login ဖန်တီးမည်</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="🤖 AI အသုံးပြုမှု (ရက် ၁၄)">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {usage.map((u) => (
                <tr key={u.day}>
                  <td className="py-1.5">{u.day}</td>
                  <td>{u.calls} calls</td>
                  <td className="text-right text-xs text-muted">
                    in {u.inp.toLocaleString("en-US")} · out {u.out.toLocaleString("en-US")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!usage.length && <p className="text-sm text-muted">မရှိသေးပါ</p>}
        </Card>
      </div>
      <Card title="⚠️ လုပ်ငန်းဖျက်ရန်" desc="Data အားလုံး (Customer, Order, Setting) ပျက်ပါမယ် — ပြန်ယူလို့မရပါ">
        <ActionForm action={deleteTenant} className="flex flex-wrap items-end gap-2">
          {hid}
          <Field label={`အတည်ပြုရန် “${t.name}” လို့ ရိုက်ပါ`}>
            <Input name="confirm" />
          </Field>
          <SubmitButton variant="danger">အပြီးဖျက်မည်</SubmitButton>
        </ActionForm>
      </Card>
      <p className="text-xs text-muted">Last update {fmt(t.updatedAt)}</p>
    </div>
  );
}
