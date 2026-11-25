import { requireTenant } from "@/lib/auth";
import { ALL_QUESTIONS } from "@/lib/questionnaire";
import { resolveSettings } from "@/lib/settings";
import { latestConsultantReport } from "@/lib/agent/autofill";
import { fmt } from "@/lib/time";
import { Card, PageHeader } from "@/components/ui";
import { autofillAction } from "../actions";
import { AutofillForm } from "./autofill-form";

// Deep research + structuring can take a couple of minutes.
export const maxDuration = 300;

export default async function AutofillPage({ params }: PageProps<"/t/[tenantId]/autofill">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const last = resolveSettings(tenant.settings).autofill;
  const report = await latestConsultantReport(tenantId);
  const labels = Object.fromEntries(ALL_QUESTIONS.map((q) => [q.key, q.label]));
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="🪄 AI Business Coach — အလိုအလျောက်ဖြည့်"
        desc="သင့်လုပ်ငန်းအကြောင်း စာနဲ့ရေး (သို့) အသံနဲ့ ပြောရုံပါပဲ။ AI က Business / Sales / Marketing Consultant တစ်ယောက်လို စျေးကွက်ကို သုတေသနလုပ်၊ နက်နက်နဲနဲ စဉ်းစားပြီး ဗလာနေရာအားလုံး (Customer နားလည်မှု၊ ကွာခြားချက်၊ FAQ၊ Objection ဖြေနည်း၊ ပစ္စည်း၊ Follow-up) ကို ဖြည့်ပေးပါမယ်။ ပြီးရင် ပြန်စစ်ပြီး မကြိုက်တာကို ပြင်ရုံပါပဲ။"
      />
      <div className="rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">
        🔒 စျေးနှုန်း၊ Promotion၊ Customer အရေအတွက်၊ Review၊ ငွေလွှဲ Account လို <b>အချက်အလက်အမှန်</b> တွေကို AI က မခန့်မှန်းပါ — သင်ပြောထားမှပဲ ထည့်ပါတယ်။ မသိတာတွေကို “သင်ကိုယ်တိုင် ဖြည့်ရန်” စာရင်းထဲ ထည့်ပေးပါမယ်။
      </div>
      <AutofillForm tenantId={tenantId} action={autofillAction} labels={labels} />
      {last && (
        <Card title="နောက်ဆုံးအကြိမ် AI ဖြည့်ခဲ့တာ" desc={fmt(last.at)}>
          <p className="text-sm">
            လုပ်ငန်းအချက်အလက် {last.filledKeys.length} ခု · ပစ္စည်း {last.addedProducts.length} ခု · FAQ {last.addedFaqs} · Objection {last.addedObjections}
          </p>
          {last.todo.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm text-amber-800">
              {last.todo.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          )}
        </Card>
      )}
      {report && (
        <Card title="📑 Consultant Report (Analysis & Research)" desc={fmt(report.createdAt)}>
          <details>
            <summary className="cursor-pointer text-sm text-brand">အပြည့်အစုံ ဖတ်ရန်</summary>
            <div className="mt-3 whitespace-pre-wrap text-sm">{report.content}</div>
          </details>
        </Card>
      )}
    </div>
  );
}
