import { requireTenant } from "@/lib/auth";
import { HANDOFF_TRIGGER_LABELS, resolveSettings, type HandoffTrigger } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Textarea, Toggle } from "@/components/ui";
import { saveHandoff } from "../actions";

export default async function HandoffPage({ params }: PageProps<"/t/[tenantId]/handoff">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const s = resolveSettings(tenant.settings);
  const h = s.handoff;
  return (
    <div className="max-w-3xl">
      <PageHeader
        title="လူကိုလွှဲပေးခြင်း (Human Handoff)"
        desc="ဒီအခြေအနေတွေမှာ Thiri က အဲ့ Customer အတွက် ခဏရပ်ပြီး သင့် Telegram ကို ချက်ချင်း အကြောင်းကြားပါမယ်။ Telegram အကြောင်းကြားစာကို Reply ပြန်ရုံနဲ့ Customer ဆီ တိုက်ရိုက် ရောက်ပါတယ်။"
      />
      <ActionForm action={saveHandoff} className="space-y-6">
        <input type="hidden" name="tenantId" value={tenantId} />
        <Card title="ဘယ်အချိန် လူကိုလွှဲမလဲ">
          <div className="space-y-2">
            <Toggle name="enabled" label="Human handoff ဖွင့်မည်" defaultChecked={h.enabled} />
            <div className="grid gap-2 md:grid-cols-2">
              {(Object.keys(HANDOFF_TRIGGER_LABELS) as HandoffTrigger[]).map((t) => (
                <Toggle key={t} name={`t_${t}`} label={HANDOFF_TRIGGER_LABELS[t]} defaultChecked={h.triggers[t]} />
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Thiri ကိုယ်တိုင် လျှော့ပေးခွင့်ရှိတဲ့ Discount အများဆုံး (%)" hint="0 = လုံးဝ မလျှော့ရ (Discount မူဝါဒ ထက်ကျော်ရင် လွှဲ)">
              <Input name="maxDiscountPercent" type="number" min={0} max={100} defaultValue={h.maxDiscountPercent} />
            </Field>
            <Field label="Bot ရပ်ထားမယ့်ကြာချိန် (မိနစ်)" hint="ပြီးရင် အလိုအလျောက် ပြန်ဖွင့်">
              <Input name="pauseMinutes" type="number" min={5} defaultValue={h.pauseMinutes} />
            </Field>
          </div>
          <div className="mt-4 space-y-4">
            <Field label="ဒီစကားလုံးတွေ ပါလာရင် ချက်ချင်းလွှဲ (တစ်ကြောင်းတစ်ခု / comma)" hint="ဥပမာ — လိမ်, တိုင်မယ်, refund, manager">
              <Textarea name="keywords" defaultValue={h.keywords.join("\n")} rows={3} />
            </Field>
            <Field label="ကိုယ်ပိုင် လွှဲရမယ့် အခြေအနေများ (စာနဲ့ရေး)" hint="ဥပမာ — Company/အဖွဲ့လိုက် ၁၀ ယောက်အထက် ဝယ်ချင်ရင်၊ Invoice/ပြေစာ တောင်းရင်">
              <Textarea name="customRules" defaultValue={h.customRules} />
            </Field>
            <Field label="လွှဲတဲ့အခါ Customer ကို ပြောမယ့်စာ">
              <Textarea name="customerMessage" defaultValue={h.customerMessage} />
            </Field>
          </div>
        </Card>
        <Card title="🔔 Telegram အကြောင်းကြားချက်များ" desc="Admin Telegram ကို “Messenger / Telegram” စာမျက်နှာမှာ ချိတ်ပါ">
          <div className="grid gap-2 md:grid-cols-2">
            <Toggle name="onOrder" label="Order အသစ်" defaultChecked={s.notifications.onOrder} />
            <Toggle name="onPaymentProof" label="ငွေလွှဲ Screenshot" defaultChecked={s.notifications.onPaymentProof} />
            <Toggle name="onHandoff" label="လူကိုလွှဲ" defaultChecked={s.notifications.onHandoff} />
            <Toggle name="onDailySummary" label="ညနေ ၈ နာရီ နေ့စဉ်အကျဉ်းချုပ်" defaultChecked={s.notifications.onDailySummary} />
          </div>
        </Card>
        <SubmitButton />
      </ActionForm>
    </div>
  );
}
