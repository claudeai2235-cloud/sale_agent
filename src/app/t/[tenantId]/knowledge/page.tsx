import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { faqs, objections } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader, Textarea } from "@/components/ui";
import { deleteFaq, deleteObjection, saveFaq, saveObjection } from "../actions";

export default async function KnowledgePage({ params }: PageProps<"/t/[tenantId]/knowledge">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const [fs, os] = await Promise.all([
    db.select().from(faqs).where(eq(faqs.tenantId, tenantId)).orderBy(desc(faqs.createdAt)),
    db.select().from(objections).where(eq(objections.tenantId, tenantId)).orderBy(desc(objections.createdAt)),
  ]);
  const hid = <input type="hidden" name="tenantId" value={tenantId} />;
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="FAQ နဲ့ Objection Handling" desc="Customer တွေ မကြာခဏ မေးတဲ့မေးခွန်း နဲ့ ဝယ်ဖို့ တွန့်ဆုတ်တဲ့အခါ ပြောရမယ့်စကား။ “AI သင်ယူမှု” ကနေ အတည်ပြုလိုက်တာတွေလည်း ဒီမှာ ရောက်လာပါမယ်။" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="❓ မကြာခဏမေးသော မေးခွန်းများ (FAQ)" desc="ဥပမာ: Laptop လိုလား? / ဘယ်နှစ်ခါ ပြန်ကြည့်လို့ရလဲ? / Certificate ပေးလား?">
          <ActionForm action={saveFaq} resetOnSuccess>
            {hid}
            <Field label="မေးခွန်း">
              <Input name="question" placeholder="ဖုန်းနဲ့ပဲ သင်လို့ရလား?" required />
            </Field>
            <Field label="အဖြေ">
              <Textarea name="answer" placeholder="ရပါတယ်ရှင့်၊ Video တွေက ဖုန်းနဲ့ ကြည့်လို့ရပြီး လက်တွေ့လုပ်တာတွေလည်း ဖုန်းနဲ့ လုပ်လို့ရပါတယ်။" required />
            </Field>
            <SubmitButton>ထည့်မည်</SubmitButton>
          </ActionForm>
          <div className="mt-5 space-y-3">
            {fs.map((f) => (
              <details key={f.id} className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {f.question} {f.source === "learned" && <Badge tone="purple">AI သင်ယူ</Badge>} {f.source === "ai" && <Badge tone="blue">🪄 AI ဖြည့်</Badge>}
                </summary>
                <ActionForm action={saveFaq} className="mt-3 space-y-2">
                  {hid}
                  <input type="hidden" name="id" value={f.id} />
                  <Input name="question" defaultValue={f.question} />
                  <Textarea name="answer" defaultValue={f.answer} />
                  <SubmitButton variant="ghost">သိမ်းမည်</SubmitButton>
                </ActionForm>
                <form action={deleteFaq} className="mt-2">
                  {hid}
                  <input type="hidden" name="id" value={f.id} />
                  <button className="text-xs text-red-600">ဖျက်မည်</button>
                </form>
              </details>
            ))}
          </div>
        </Card>
        <Card title="🛡️ Objection Handling" desc="“စျေးကြီးတယ်”၊ “အချိန်မရှိဘူး”၊ “စဉ်းစားဦးမယ်” လိုမျိုး ပြောလာရင် ဘယ်လိုဖြေမလဲ">
          <ActionForm action={saveObjection} resetOnSuccess>
            {hid}
            <Field label="Customer ပြောတာ">
              <Input name="objection" placeholder="စျေးနည်းနည်း ကြီးတယ်" required />
            </Field>
            <Field label="ပြန်ဖြေရမယ့် နည်း / စကား" hint="အလုပ်ဖြစ်ခဲ့တဲ့ နည်းကို ရေးပါ — Thiri က ဒီ idea ကို အခြေအနေနဲ့ကိုက်အောင် ပြောပါမယ်">
              <Textarea
                name="response"
                placeholder="ခံစားချက်ကို နားလည်ကြောင်းပြော → တစ်ရက်ကို ၁၅,၀၀၀ ပဲကျပြီး အချိန် ၃ နာရီ သက်သာတာ နှိုင်းယှဉ်ပြ → တစ်သက်တာ ကြည့်ခွင့်ကို သတိပေး"
                required
              />
            </Field>
            <SubmitButton>ထည့်မည်</SubmitButton>
          </ActionForm>
          <div className="mt-5 space-y-3">
            {os.map((o) => (
              <details key={o.id} className="rounded-lg border border-line p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {o.objection} {o.source === "learned" && <Badge tone="purple">AI သင်ယူ</Badge>} {o.source === "ai" && <Badge tone="blue">🪄 AI ဖြည့်</Badge>}
                </summary>
                <ActionForm action={saveObjection} className="mt-3 space-y-2">
                  {hid}
                  <input type="hidden" name="id" value={o.id} />
                  <Input name="objection" defaultValue={o.objection} />
                  <Textarea name="response" defaultValue={o.response} />
                  <SubmitButton variant="ghost">သိမ်းမည်</SubmitButton>
                </ActionForm>
                <form action={deleteObjection} className="mt-2">
                  {hid}
                  <input type="hidden" name="id" value={o.id} />
                  <button className="text-xs text-red-600">ဖျက်မည်</button>
                </form>
              </details>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
