import { requireTenant } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { savePersona } from "../actions";

export default async function PersonaPage({ params }: PageProps<"/t/[tenantId]/persona">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const s = resolveSettings(tenant.settings);
  return (
    <div className="max-w-3xl">
      <PageHeader title="Thiri (Persona) နဲ့ AI Setting" />
      <ActionForm action={savePersona} className="space-y-6">
        <input type="hidden" name="tenantId" value={tenantId} />
        <Card title="👩‍💼 Persona">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="နာမည်">
              <Input name="name" defaultValue={s.persona.name} />
            </Field>
            <Field label="ရာထူး">
              <Input name="role" defaultValue={s.persona.role} />
            </Field>
            <Field label="ယဉ်ကျေးမှု စကားလုံး" hint="ရှင် / ရှင့်">
              <Input name="politeParticle" defaultValue={s.persona.politeParticle} />
            </Field>
            <Field label="Emoji">
              <Select name="emojiLevel" defaultValue={s.persona.emojiLevel}>
                <option value="none">မသုံး</option>
                <option value="low">နည်းနည်း</option>
                <option value="medium">အသင့်အတင့်</option>
              </Select>
            </Field>
            <Field label="တစ်ကြိမ်ဖြေရင် စာ Bubble အများဆုံး">
              <Input name="maxBubbles" type="number" min={1} max={5} defaultValue={s.persona.maxBubbles} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="ထပ်ဆောင်း ပြောဆိုပုံ ညွှန်ကြားချက်" hint="ဥပမာ — Customer ကို ‘အစ်ကို/အစ်မ’ လို့ ခေါ်ပါ၊ ဆရာ့နာမည် ‘ဆရာဇွဲ’ လို့ ပြောပါ">
              <Textarea name="extraStyle" defaultValue={s.persona.extraStyle} />
            </Field>
          </div>
        </Card>
        <Card title="🤖 AI">
          <div className="space-y-3">
            <Toggle name="botEnabled" label="Bot ဖွင့်ထားမည် (ပိတ်ရင် Customer စာတွေ Inbox မှာပဲ စုထားမယ်)" defaultChecked={tenant.botEnabled} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Gemini Model (ဗလာ = Platform default)" hint="ဥပမာ gemini-flash-latest / gemini-flash-lite-latest">
                <Input name="chatModel" defaultValue={s.ai.chatModel} placeholder="platform default" />
              </Field>
              <Field label="စဉ်းစားချိန် (Thinking)" hint="Low = မြန်ပြီး စျေးသက်သာ (အကြံပြု)၊ High = ပိုစဉ်းစားပေမဲ့ နှေး">
                <Select name="thinkingLevel" defaultValue={s.ai.thinkingLevel}>
                  <option value="low">Low (အကြံပြု)</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="default">Model default</option>
                </Select>
              </Field>
              <Field label="Creativity (temperature 0–1.5)">
                <Input name="temperature" type="number" step="0.1" defaultValue={s.ai.temperature} />
              </Field>
              <Field label="မသေချာရင် လူကိုလွှဲမယ့် Confidence အောက်ခြေ (0–1)">
                <Input name="confidenceThreshold" type="number" step="0.05" defaultValue={s.ai.confidenceThreshold} />
              </Field>
              <Field label="မှတ်မိမယ့် စာအရေအတွက်">
                <Input name="historyMessages" type="number" defaultValue={s.ai.historyMessages} />
              </Field>
              <Field label="ဖြေမယ့်အချိန် စောင့်ချိန် (စက္ကန့်)" hint="Customer က စာတွေ ဆက်တိုက်ပို့ရင် စုပြီးမှ ဖြေဖို့">
                <Input name="replyDelaySeconds" type="number" defaultValue={s.ai.replyDelaySeconds} />
              </Field>
            </div>
          </div>
        </Card>
        <Card title="🧠 သင်ယူမှု">
          <div className="space-y-3">
            <Toggle name="learningEnabled" label="စကားဝိုင်းတွေကနေ အလိုအလျောက် သင်ယူမည်" defaultChecked={s.learning.enabled} />
            <Toggle name="autoApprove" label="သင်ယူတာတွေကို ကျွန်ုပ် မစစ်ဘဲ တိုက်ရိုက်သုံးမည်" hint="မအကြံပြုပါ — စစ်ပြီးမှ သုံးတာ ပိုလုံခြုံပါတယ်" defaultChecked={s.learning.autoApprove} />
            <Toggle
              name="humanAgentTag"
              label="Messenger: ၂၄ နာရီကျော်ရင် လူကိုယ်တိုင်ဖြေတဲ့စာကို HUMAN_AGENT tag နဲ့ ပို့မည်"
              hint="Meta App Review မှာ Human Agent permission ရပြီးမှ ဖွင့်ပါ (၇ ရက်အထိ)"
              defaultChecked={s.messenger.humanAgentTag}
            />
          </div>
        </Card>
        <SubmitButton />
      </ActionForm>
    </div>
  );
}
