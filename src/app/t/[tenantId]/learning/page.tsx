import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { lessons } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { fmt } from "@/lib/time";
import { SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, Input, PageHeader, Textarea } from "@/components/ui";
import { lessonAction } from "../actions";

const KIND: Record<string, { label: string; tone: "purple" | "blue" | "amber" | "green" }> = {
  gap: { label: "Thiri မဖြေနိုင်ခဲ့တဲ့ မေးခွန်း", tone: "amber" },
  faq: { label: "FAQ အသစ်", tone: "blue" },
  objection: { label: "Objection ဖြေနည်း", tone: "purple" },
  insight: { label: "Business Insight", tone: "green" },
};

export default async function LearningPage({ params }: PageProps<"/t/[tenantId]/learning">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const pending = await db.select().from(lessons).where(and(eq(lessons.tenantId, tenantId), eq(lessons.status, "pending"))).orderBy(desc(lessons.createdAt)).limit(100);
  const recent = await db.select().from(lessons).where(and(eq(lessons.tenantId, tenantId), eq(lessons.status, "approved"))).orderBy(desc(lessons.createdAt)).limit(20);
  const hid = <input type="hidden" name="tenantId" value={tenantId} />;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="AI သင်ယူမှု"
        desc="Thiri က စကားဝိုင်းတွေ ပြီးသွားတိုင်း (သင် ကိုယ်တိုင်ဖြေခဲ့တဲ့ အဖြေတွေ အပါအဝင်) ပြန်လေ့လာပြီး အသစ်သိလာတာတွေကို ဒီမှာ တင်ပြပါတယ်။ အတည်ပြုလိုက်တာနဲ့ FAQ / Objection ထဲ ရောက်ပြီး နောက် Customer တွေကို သုံးပါမယ်။ (Model ကို ပြန်လေ့ကျင့်တာ မဟုတ်ဘဲ သင်စစ်ပြီးသား အသိပညာ တိုးလာတာပါ — ဒါကြောင့် မှားတာ မဝင်ပါ)"
      />
      {!pending.length && <Empty>စစ်ဆေးရန် မရှိပါ 🎉</Empty>}
      {pending.map((l) => (
        <Card key={l.id}>
          <div className="mb-2 flex items-center gap-2">
            <Badge tone={KIND[l.kind]?.tone ?? "blue"}>{KIND[l.kind]?.label ?? l.kind}</Badge>
            <span className="text-xs text-muted">{fmt(l.createdAt)}</span>
          </div>
          {l.kind === "insight" ? (
            <p className="text-sm">{l.title}</p>
          ) : (
            <form action={lessonAction} id={`f-${l.id}`} className="space-y-2">
              {hid}
              <input type="hidden" name="id" value={l.id} />
              <input type="hidden" name="op" value="approve" />
              <Input name="title" defaultValue={l.title} />
              <Textarea name="content" defaultValue={l.content} placeholder={l.kind === "gap" ? "အဖြေကို ရေးပေးပါ — FAQ အဖြစ် သိမ်းပါမယ်" : ""} />
            </form>
          )}
          <div className="mt-3 flex gap-2">
            {l.kind !== "insight" ? (
              <button form={`f-${l.id}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">
                ✅ အတည်ပြု
              </button>
            ) : (
              <form action={lessonAction}>
                {hid}
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="op" value="approve" />
                <SubmitButton>👍 မှတ်ထားမည်</SubmitButton>
              </form>
            )}
            <form action={lessonAction}>
              {hid}
              <input type="hidden" name="id" value={l.id} />
              <input type="hidden" name="op" value="reject" />
              <SubmitButton variant="ghost">ပယ်</SubmitButton>
            </form>
          </div>
        </Card>
      ))}
      {recent.length > 0 && (
        <Card title="မကြာသေးခင်က အတည်ပြုခဲ့တာ">
          <ul className="space-y-1 text-sm">
            {recent.map((l) => (
              <li key={l.id}>
                <Badge tone={KIND[l.kind]?.tone ?? "blue"}>{KIND[l.kind]?.label ?? l.kind}</Badge> {l.title}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
