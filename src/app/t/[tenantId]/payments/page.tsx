import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { paymentMethods, type PaymentMethod } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Textarea, Toggle } from "@/components/ui";
import { deletePayment, saveOrderSettings, savePayment } from "../actions";

const PROVIDERS = ["KBZPay", "WavePay", "AYA Pay", "CB Pay", "UAB Pay", "KBZ Bank", "AYA Bank", "CB Bank", "Yoma Bank", "COD (ပစ္စည်းရောက်ငွေချေ)", "Other"];

function PaymentForm({ tenantId, m }: { tenantId: string; m?: PaymentMethod }) {
  return (
    <ActionForm action={savePayment} resetOnSuccess={!m}>
      <input type="hidden" name="tenantId" value={tenantId} />
      {m && <input type="hidden" name="id" value={m.id} />}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="အမျိုးအစား" required>
          <Input name="provider" list="providers" defaultValue={m?.provider} placeholder="KBZPay" required />
        </Field>
        <Field label="Account အမည်">
          <Input name="accountName" defaultValue={m?.accountName} placeholder="U Zwe" />
        </Field>
        <Field label="ဖုန်း / Account နံပါတ်">
          <Input name="accountNumber" defaultValue={m?.accountNumber} placeholder="09xxxxxxxxx" />
        </Field>
      </div>
      <Field label="မှတ်ချက်" hint="ဥပမာ — Note မှာ Order နံပါတ် ရေးပေးပါ">
        <Input name="note" defaultValue={m?.note} />
      </Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Toggle name="active" label="သုံးနေဆဲ" defaultChecked={m?.active ?? true} />
        <Toggle name="isCod" label="COD (ငွေကြိုမလွှဲ)" defaultChecked={m?.isCod ?? false} />
        <Field label="အစဉ်">
          <Input name="sortOrder" type="number" defaultValue={m?.sortOrder ?? 0} />
        </Field>
      </div>
      <SubmitButton>{m ? "သိမ်းမည်" : "ထည့်မည်"}</SubmitButton>
    </ActionForm>
  );
}

export default async function PaymentsPage({ params }: PageProps<"/t/[tenantId]/payments">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const s = resolveSettings(tenant.settings);
  const list = await db.select().from(paymentMethods).where(eq(paymentMethods.tenantId, tenantId)).orderBy(asc(paymentMethods.sortOrder));
  const rows = [...s.order.fields, { key: "", label: "", required: false }, { key: "", label: "", required: false }];
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="ငွေပေးချေမှု နဲ့ Order ပိတ်ပုံ" desc="Thiri က Order တင်ပြီးတာနဲ့ ဒီက Account အချက်အလက်ကို အတိအကျ ပို့ပေးပါတယ် (AI က Account နံပါတ်ကို ကိုယ်တိုင် မရေးပါ)။ Screenshot ရောက်ရင် သင့် Telegram ကို အကြောင်းကြားပြီး ✅ နှိပ်ရုံနဲ့ အတည်ပြုနိုင်ပါတယ်။" />
      <datalist id="providers">
        {PROVIDERS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <Card title="💳 ငွေပေးချေမှု နည်းလမ်းများ">
        <PaymentForm tenantId={tenantId} />
        <div className="mt-5 space-y-3">
          {list.map((m) => (
            <details key={m.id} className="rounded-lg border border-line p-3">
              <summary className="cursor-pointer text-sm">
                <span className="font-medium">{m.provider}</span> — {m.accountName} {m.accountNumber} {!m.active && <Badge>ပိတ်</Badge>} {m.isCod && <Badge tone="blue">COD</Badge>}
              </summary>
              <div className="mt-3">
                <PaymentForm tenantId={tenantId} m={m} />
                <form action={deletePayment} className="mt-2">
                  <input type="hidden" name="tenantId" value={tenantId} />
                  <input type="hidden" name="id" value={m.id} />
                  <button className="text-xs text-red-600">ဖျက်မည်</button>
                </form>
              </div>
            </details>
          ))}
        </div>
      </Card>
      <Card title="🧾 Order အတွက် Customer ဆီက ကောက်ယူမယ့် အချက်အလက်" desc="“မဖြစ်မနေ” ကို အမှန်ခြစ်ထားတာတွေ မရမချင်း Thiri က Order မတင်ပါ (ယဉ်ယဉ်ကျေးကျေး တောင်းပါမယ်)။ Key က အင်္ဂလိပ်လို (name, phone, email, address, city…)">
        <ActionForm action={saveOrderSettings}>
          <input type="hidden" name="tenantId" value={tenantId} />
          <div className="space-y-2">
            {rows.map((f, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <Input name="f_key" defaultValue={f.key} placeholder="key" className="col-span-3" />
                <Input name="f_label" defaultValue={f.label} placeholder="ပြသမည့် အမည်" className="col-span-6" />
                <label className="col-span-3 flex items-center gap-2 text-sm">
                  <input type="checkbox" name="f_required" value={String(i)} defaultChecked={f.required} className="accent-[var(--brand)]" /> မဖြစ်မနေ
                </label>
              </div>
            ))}
          </div>
          <Toggle name="requirePaymentProof" label="ငွေလွှဲ Screenshot တောင်းမည်" defaultChecked={s.order.requirePaymentProof} />
          <Field label="Order တင်ပြီးနောက် Account info အောက်မှာ ပို့မယ့်စာ">
            <Textarea name="afterOrderMessage" defaultValue={s.order.afterOrderMessage} />
          </Field>
          <Field label="ငွေရကြောင်း အတည်ပြုလိုက်ရင် Customer ကို ပို့မယ့်စာ" hint="Course Link / Group Link / နောက်အဆင့်တွေ ဒီမှာ ထည့်ထားလို့ရပါတယ်">
            <Textarea name="confirmedMessage" defaultValue={s.order.confirmedMessage} rows={4} />
          </Field>
          <SubmitButton />
        </ActionForm>
      </Card>
    </div>
  );
}
