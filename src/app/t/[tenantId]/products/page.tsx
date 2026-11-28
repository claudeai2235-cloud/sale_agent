import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { products, type Product } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { formatMMK } from "@/lib/myanmar";
import { effectivePrice } from "@/lib/agent/prompt";
import { countdownFor, mmDateKey, mmDateText } from "@/lib/countdown";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Field, Input, PageHeader, Select, Textarea, Toggle } from "@/components/ui";
import { deleteProduct, saveProduct } from "../actions";

function ProductForm({ tenantId, p }: { tenantId: string; p?: Product }) {
  const d = p?.saleEndsAt ? mmDateKey(new Date(p.saleEndsAt)) : "";
  const cs = p?.classStartAt ? mmDateKey(new Date(p.classStartAt)) : "";
  const ed = p?.enrollDeadlineAt ? mmDateKey(new Date(p.enrollDeadlineAt)) : "";
  return (
    <ActionForm action={saveProduct} resetOnSuccess={!p}>
      <input type="hidden" name="tenantId" value={tenantId} />
      {p && <input type="hidden" name="id" value={p.id} />}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Field label="အမည်" required>
            <Input name="name" defaultValue={p?.name} placeholder="AI Basic Workflow — 7 Days Video Course" required />
          </Field>
        </div>
        <Field label="အမျိုးအစား">
          <Select name="kind" defaultValue={p?.kind ?? "course"}>
            <option value="course">Course / သင်တန်း</option>
            <option value="service">Service / ဝန်ဆောင်မှု</option>
            <option value="product">Product / ပစ္စည်း</option>
          </Select>
        </Field>
      </div>
      <Field label="တစ်ကြောင်းတည်း အကျဉ်း" hint="Customer ကို ပထမဆုံး မိတ်ဆက်တဲ့အခါ သုံးမယ်">
        <Input name="summary" defaultValue={p?.summary} placeholder="AI ကို နေ့စဉ်အလုပ်မှာ ၇ ရက်အတွင်း လက်တွေ့သုံးတတ်အောင် သင်ပေးတဲ့ Video Course" />
      </Field>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ရမယ့် အကျိုးကျေးဇူး / ရလဒ်" hint="Feature ထက် Customer ရမယ့် ရလဒ်ကို ရေးပါ — Thiri အသုံးအများဆုံး">
          <Textarea name="benefits" defaultValue={p?.benefits} placeholder={"• Content ရေးချိန် ၇၀% သက်သာ\n• Customer စာပြန်တာ AI နဲ့ အလိုအလျောက်\n• English မကောင်းလည်း ရ"} rows={4} />
        </Field>
        <Field label="အသေးစိတ် (သင်ခန်းစာ၊ ပါဝင်တာ၊ Spec)">
          <Textarea name="details" defaultValue={p?.details} placeholder={"Day 1: AI ဆိုတာ ဘာလဲ + ChatGPT/Gemini setup\nDay 2: Content ရေးနည်း\n…"} rows={4} />
        </Field>
      </div>
      <Field label="ဘယ်သူတွေအတွက်လဲ">
        <Input name="audience" defaultValue={p?.audience} placeholder="လုပ်ငန်းငယ်ပိုင်ရှင်၊ Online seller၊ ရုံးဝန်ထမ်း၊ AI စလေ့လာမယ့်သူ" />
      </Field>
      <div className="grid gap-4 md:grid-cols-4">
        <Field label="ပုံမှန်စျေး (ကျပ်)" required>
          <Input name="price" type="number" min={0} defaultValue={p?.price ?? ""} placeholder="150000" required />
        </Field>
        <Field label="Promotion စျေး">
          <Input name="salePrice" type="number" min={0} defaultValue={p?.salePrice ?? ""} placeholder="105000" />
        </Field>
        <Field label="Promotion ကုန်ရက်" hint="မထည့်ရင် အမြဲ">
          <Input name="saleEndsAt" type="date" defaultValue={d} />
        </Field>
        <Field label="Stock" hint="Digital ဆို ဗလာထား">
          <Input name="stock" type="number" min={0} defaultValue={p?.stock ?? ""} />
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg border border-dashed border-line p-3 md:grid-cols-2">
        <Field label="📅 အတန်းစမည့်ရက်" hint="ထည့်ထားရင် မဝယ်ရသေးတဲ့ Customer ကို ‘အတန်းစဖို့ … ရက်သာ ကျန်ပါတော့တယ်’ လို့ နေ့တိုင်း အတိအကျ ရေတွက်ပြီး ပြောပေးမယ်">
          <Input name="classStartAt" type="date" defaultValue={cs} />
        </Field>
        <Field label="⏳ နောက်ဆုံး အပ်နှံရက်" hint="မထည့်ရင် အတန်းစရက်အထိ လက်ခံ။ ကျော်သွားရင် Thiri က ‘ဒီအသုတ် ပိတ်ပါပြီ’ လို့ ရိုးရိုးသားသား ပြောမယ်">
          <Input name="enrollDeadlineAt" type="date" defaultValue={ed} />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="ကြာချိန်">
          <Input name="duration" defaultValue={p?.duration} placeholder="၇ ရက် (တစ်နေ့ ၃၀ မိနစ်)" />
        </Field>
        <Field label="ဘယ်လို ရမလဲ / ပို့ဆောင်ပုံ">
          <Input name="deliveryInfo" defaultValue={p?.deliveryInfo} placeholder="ငွေချေပြီး ၃၀ မိနစ်အတွင်း Link ပို့" />
        </Field>
        <Field label="Bonus / လက်ဆောင်">
          <Input name="bonus" defaultValue={p?.bonus} placeholder="Prompt Template 100 ခု" />
        </Field>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <Field label="ပုံ URL" hint="https:// နဲ့စတဲ့ ပုံ Link — Thiri က Customer ကို ပုံပို့ပေးနိုင်မယ်">
            <Input name="imageUrl" defaultValue={p?.imageUrl ?? ""} placeholder="https://…/course-cover.jpg" />
          </Field>
        </div>
        <Field label="အစဉ်">
          <Input name="sortOrder" type="number" defaultValue={p?.sortOrder ?? 0} />
        </Field>
      </div>
      <Toggle name="active" label="ရောင်းနေဆဲ (Thiri က ဒီပစ္စည်းကို သိမယ်)" defaultChecked={p?.active ?? true} />
      <SubmitButton>{p ? "ပြင်ဆင်မှု သိမ်းမည်" : "ထည့်မည်"}</SubmitButton>
    </ActionForm>
  );
}

function ClassInfo({ p }: { p: Product }) {
  if (!p.classStartAt) return null;
  const cd = countdownFor(p);
  if (!cd) return <p className="mt-1 text-xs text-muted">📅 {mmDateText(new Date(p.classStartAt))} က အတန်းစပြီးပါပြီ — အသုတ်သစ်ရက် ပြင်ထည့်ပါ</p>;
  if (cd.closed) return <p className="mt-1 text-xs text-red-600">⛔ စာရင်းပိတ်ပြီ (အတန်းစ {mmDateText(new Date(p.classStartAt))})</p>;
  return (
    <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800">
      ⏳ ဒီနေ့ Customer ကို ပြောမယ့်စာ: “{cd.text}”
    </p>
  );
}

export default async function ProductsPage({ params }: PageProps<"/t/[tenantId]/products">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const list = await db.select().from(products).where(eq(products.tenantId, tenantId)).orderBy(asc(products.sortOrder), asc(products.createdAt));
  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader title="ပစ္စည်း / Course / ဝန်ဆောင်မှု" desc="စျေးနှုန်းကို ဒီမှာ ထည့်တာနဲ့ Thiri က အမှန်အတိုင်း ပြောပြီး Order တွက်ပေးပါမယ်။ AI က စျေးကို ကိုယ်တိုင် မတွက်ပါ — ဒီ Data ကနေပဲ ယူပါတယ်။" />
      <details className="rounded-xl border border-line bg-panel p-5 shadow-sm" open={!list.length}>
        <summary className="cursor-pointer font-semibold">➕ အသစ်ထည့်ရန်</summary>
        <div className="mt-4">
          <ProductForm tenantId={tenantId} />
        </div>
      </details>
      {!list.length && <Empty>ပစ္စည်း မရှိသေးပါ</Empty>}
      {list.map((p) => {
        const ep = effectivePrice(p);
        return (
          <Card key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 font-semibold">
                  {p.name} {!p.active && <Badge tone="gray">ပိတ်ထား</Badge>} {ep.onSale && <Badge tone="purple">Promotion</Badge>}
                </div>
                <p className="text-sm text-muted">{p.summary}</p>
                <ClassInfo p={p} />
              </div>
              <div className="text-right">
                <div className="font-semibold">{formatMMK(ep.price)}</div>
                {ep.onSale && <div className="text-xs text-muted line-through">{formatMMK(p.price)}</div>}
              </div>
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-brand">ပြင်ရန်</summary>
              <div className="mt-4">
                <ProductForm tenantId={tenantId} p={p} />
                <form action={deleteProduct} className="mt-3">
                  <input type="hidden" name="tenantId" value={tenantId} />
                  <input type="hidden" name="id" value={p.id} />
                  <SubmitButton variant="danger" confirm="ဖျက်မှာ သေချာလား?">ဖျက်မည်</SubmitButton>
                </form>
              </div>
            </details>
          </Card>
        );
      })}
    </div>
  );
}
