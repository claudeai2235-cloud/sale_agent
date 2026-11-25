import { requireTenant } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Toggle } from "@/components/ui";
import { saveFollowup } from "../actions";

export default async function FollowupPage({ params }: PageProps<"/t/[tenantId]/followup">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const f = resolveSettings(tenant.settings).followup;
  const rows = [...f.steps, { delayMinutes: 0, goal: "" }, { delayMinutes: 0, goal: "" }];
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Follow-up စနစ်"
        desc="Customer က စာပြန်မလာတော့ရင် Thiri က အရင်ပြောခဲ့တာတွေကို မှတ်မိပြီး သူ့လိုအပ်ချက်နဲ့ ကိုက်တဲ့ စာတိုလေးနဲ့ ပြန်လိုက်ပါမယ် (Template မဟုတ်၊ လူတစ်ယောက်ချင်းစီအတွက် ရေးပါတယ်)။ မဝယ်ချင်ကြောင်း ပြောထားသူ၊ ဝယ်ပြီးသူ၊ စိတ်ဆိုးနေသူကို မလိုက်ပါ။"
      />
      <div className="mb-6 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
        ⚠️ Messenger: Meta policy အရ Customer ရဲ့ နောက်ဆုံးစာကနေ ၂၄ နာရီ ကျော်ရင် အရောင်း Follow-up ပို့ခွင့် မရှိပါ (Page ပိတ်ခံရနိုင်)။ စနစ်က ၂၃ နာရီ ၄၀ မိနစ်ကျော်ရင် Messenger ကို အလိုအလျောက် မပို့ပါ။
      </div>
      <ActionForm action={saveFollowup} className="space-y-6">
        <input type="hidden" name="tenantId" value={tenantId} />
        <Card title="Follow-up အဆင့်များ" desc="အချိန်ကို Customer ရဲ့ နောက်ဆုံးစာကနေ ရေတွက်ပါတယ်။ ရည်ရွယ်ချက်ကို ရှင်းရှင်းရေးပါ — Thiri က အဲ့ဒါကို လိုက်ပြီး စာရေးပါမယ်။">
          <Toggle name="enabled" label="Follow-up ဖွင့်မည်" defaultChecked={f.enabled} />
          <div className="mt-4 space-y-3">
            {rows.map((s, i) => {
              const inHours = s.delayMinutes >= 60 && s.delayMinutes % 60 === 0;
              return (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <Input name="s_delay" type="number" min={0} defaultValue={s.delayMinutes ? (inHours ? s.delayMinutes / 60 : s.delayMinutes) : ""} placeholder="ကြာချိန်" className="col-span-3 md:col-span-2" />
                  <Select name="s_unit" defaultValue={inHours ? "h" : "m"} className="col-span-3 md:col-span-2">
                    <option value="m">မိနစ်</option>
                    <option value="h">နာရီ</option>
                  </Select>
                  <Input name="s_goal" defaultValue={s.goal} placeholder="ရည်ရွယ်ချက် — ဥပမာ Free Lesson ပို့ပေးပြီး စိတ်ဝင်စားမှု ပြန်နှိုး" className="col-span-12 md:col-span-8" />
                </div>
              );
            })}
          </div>
        </Card>
        <Card title="အခြား">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Order တင်ပြီး ငွေမလွှဲသေးရင် သတိပေးမယ့်အချိန် (မိနစ်)">
              <Input name="paymentReminderMinutes" type="number" defaultValue={f.paymentReminderMinutes} />
            </Field>
            <Field label="Telegram Follow-up အများဆုံး (နာရီ)">
              <Input name="telegramMaxHours" type="number" defaultValue={f.telegramMaxHours} />
            </Field>
            <Field label="မပို့ရမယ့်အချိန် စ (နာရီ, 0-23)" hint="မြန်မာစံတော်ချိန်">
              <Input name="quietStartHour" type="number" min={0} max={23} defaultValue={f.quietStartHour} />
            </Field>
            <Field label="မပို့ရမယ့်အချိန် ဆုံး (နာရီ)">
              <Input name="quietEndHour" type="number" min={0} max={23} defaultValue={f.quietEndHour} />
            </Field>
          </div>
        </Card>
        <SubmitButton />
      </ActionForm>
    </div>
  );
}
