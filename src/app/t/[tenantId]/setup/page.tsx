import { requireTenant } from "@/lib/auth";
import Link from "next/link";
import { QUESTIONNAIRE, profileCompleteness } from "@/lib/questionnaire";
import { resolveSettings } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Input, PageHeader, Textarea } from "@/components/ui";
import { saveProfile } from "../actions";

export default async function SetupPage({ params }: PageProps<"/t/[tenantId]/setup">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const comp = profileCompleteness(tenant.profile);
  const aiKeys = new Set(resolveSettings(tenant.settings).autofill?.filledKeys ?? []);
  return (
    <div className="max-w-4xl">
      <PageHeader
        title="လုပ်ငန်းအချက်အလက် (Thiri ရဲ့ ဦးနှောက်)"
        desc="ဒီမေးခွန်းတွေကို ဖြေထားသလောက် Thiri က သင့်လုပ်ငန်းကို နားလည်ပြီး လူတစ်ယောက်လို ရောင်းပေးနိုင်ပါတယ်။ မှန်တာကိုပဲ ရေးပါ — Thiri က ဒီမှာရှိတာကို အမှန်လို့ ယူဆပြီး Customer ကို ပြောမှာပါ။"
      />
      <Link href={`/t/${tenantId}/autofill`} className="mb-4 flex items-center gap-3 rounded-xl border-2 border-brand/30 bg-brand-soft p-4 hover:border-brand">
        <span className="text-2xl">🪄</span>
        <span className="text-sm">
          <b className="block text-brand">တစ်ခုချင်း မဖြည့်ချင်ဘူးလား?</b>
          လုပ်ငန်းအကြောင်း ရေး (သို့) အသံနဲ့ ပြောရုံနဲ့ AI Business Coach က ဗလာနေရာအားလုံး ဖြည့်ပေးပါမယ် →
        </span>
      </Link>
      <div className="mb-6 rounded-xl border border-line bg-panel p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span>ပြည့်စုံမှု</span>
          <span className="font-semibold">{comp.percent}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-gray-100">
          <div className="h-full bg-brand" style={{ width: `${comp.percent}%` }} />
        </div>
        {comp.importantMissing.length > 0 && <p className="mt-2 text-xs text-amber-700">အရေးကြီးတာ မဖြည့်ရသေး: {comp.importantMissing.join("၊ ")}</p>}
      </div>
      <ActionForm action={saveProfile} className="space-y-6">
        <input type="hidden" name="tenantId" value={tenantId} />
        {QUESTIONNAIRE.map((sec) => (
          <Card key={sec.key} title={sec.title} desc={sec.intro}>
            <div className="space-y-5">
              {sec.questions.map((q) => (
                <div key={q.key}>
                  <div className="mb-1 flex items-center gap-2 text-sm font-medium">
                    {q.label} {q.important && <Badge tone="purple">အရေးကြီး</Badge>} {aiKeys.has(q.key) && <Badge tone="blue">🪄 AI ဖြည့် — စစ်ပါ</Badge>}
                  </div>
                  <p className="mb-1.5 text-xs text-muted">ဘာကြောင့်လိုလဲ: {q.why}</p>
                  {q.long ? (
                    <Textarea name={q.key} defaultValue={tenant.profile[q.key] ?? ""} placeholder={`ဥပမာ — ${q.example}`} rows={3} />
                  ) : (
                    <Input name={q.key} defaultValue={tenant.profile[q.key] ?? ""} placeholder={`ဥပမာ — ${q.example}`} />
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
        <div className="sticky bottom-4 flex justify-end">
          <SubmitButton>အားလုံး သိမ်းမည်</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
