import { asc } from "drizzle-orm";
import { db } from "@/db";
import { tenants } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Toggle } from "@/components/ui";
import { createTenant } from "../actions";

export default async function NewTenant() {
  const ts = await db.select({ id: tenants.id, name: tenants.name }).from(tenants).orderBy(asc(tenants.name));
  return (
    <div className="max-w-3xl">
      <PageHeader title="လုပ်ငန်းအသစ် ဖန်တီးရန်" desc="ဖန်တီးလိုက်တာနဲ့ ဒီလုပ်ငန်းအတွက် Dashboard၊ Thiri Bot နဲ့ Admin link code အသစ် ရပါမယ်။ လုပ်ငန်းရှင်ကို Login ပေးချင်မှ ပေးပါ — မပေးလည်း သင်ကိုယ်တိုင် စီမံနိုင်ပါတယ်။" />
      <ActionForm action={createTenant} className="space-y-6">
        <Card title="လုပ်ငန်း">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="လုပ်ငန်းအမည်" required>
              <Input name="name" required />
            </Field>
            <Field label="Plan">
              <Input name="planName" defaultValue="Standard" />
            </Field>
            <Field label="လစဉ်ကြေး (ကျပ်)">
              <Input name="monthlyFee" type="number" min={0} defaultValue={0} />
            </Field>
            <Field label="သက်တမ်း (လ)" hint="0 = အကန့်အသတ်မဲ့ (ကိုယ့်လုပ်ငန်းအတွက်)">
              <Input name="months" type="number" min={0} defaultValue={1} />
            </Field>
          </div>
          <div className="mt-3">
            <Toggle name="paid" label="ပထမလ ငွေရပြီး (Payment မှတ်တမ်း သွင်းမည်)" />
          </div>
        </Card>
        <Card title="Template ကနေ ကူးမည် (မလိုရင် ကျော်)" desc="ရှိပြီးသား လုပ်ငန်းတစ်ခုရဲ့ Setting/Data ကို အခြေခံအဖြစ် ကူးယူပြီး အချိန်ကုန်သက်သာစေပါတယ်">
          <Field label="Template">
            <Select name="templateId" defaultValue="">
              <option value="">— မကူးပါ —</option>
              {ts.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <Toggle name="copyProfile" label="လုပ်ငန်းအချက်အလက် မေးခွန်းအဖြေများ" />
            <Toggle name="copyCatalog" label="ပစ္စည်း၊ FAQ၊ Objection၊ Payment အမျိုးအစား" />
          </div>
        </Card>
        <Card title="လုပ်ငန်းရှင် Login (Optional)">
          <div className="grid gap-4 md:grid-cols-3">
            <Field label="နာမည်">
              <Input name="ownerName" />
            </Field>
            <Field label="Email">
              <Input name="ownerEmail" type="email" />
            </Field>
            <Field label="Password">
              <Input name="ownerPassword" type="password" minLength={8} />
            </Field>
          </div>
        </Card>
        <SubmitButton>ဖန်တီးမည်</SubmitButton>
      </ActionForm>
    </div>
  );
}
