import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, messages } from "@/db/schema";
import { getSession, requireTenant } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, PageHeader, STAGE_LABEL, Textarea } from "@/components/ui";
import { testChatReset, testChatSend } from "../actions";

export default async function TestPage({ params }: PageProps<"/t/[tenantId]/test">) {
  const { tenantId } = await params;
  await requireTenant(tenantId);
  const s = await getSession();
  const [c] = await db
    .select()
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.channelType, "test"), eq(customers.externalId, `test:${s!.uid}`)))
    .limit(1);
  const msgs = c ? await db.select().from(messages).where(eq(messages.customerId, c.id)).orderBy(asc(messages.createdAt)) : [];
  const hid = <input type="hidden" name="tenantId" value={tenantId} />;
  return (
    <div className="max-w-3xl">
      <PageHeader title="Thiri ကို စမ်းကြည့်ရန်" desc="Customer တစ်ယောက်လို စာရေးပြီး Thiri ဘယ်လိုဖြေလဲ စမ်းပါ။ Data ပြင်ပြီးတိုင်း ဒီမှာ စမ်းကြည့်ပါ (Order တွေ တကယ်တင်ပါမယ် — စမ်းပြီးရင် ပယ်ဖျက်ပါ)" />
      <Card
        actions={
          <form action={testChatReset}>
            {hid}
            <SubmitButton variant="ghost">🔄 အစကပြန်စ</SubmitButton>
          </form>
        }
        title="Test Chat"
        desc={c ? <>Stage: <Badge tone={STAGE_LABEL[c.stage].tone}>{STAGE_LABEL[c.stage].label}</Badge>{c.handoffReason && <> · လွှဲ: {c.handoffReason}</>}</> : undefined}
      >
        <div className="mb-4 max-h-[55vh] space-y-2 overflow-y-auto rounded-lg bg-gray-50 p-4">
          {!msgs.length && <p className="text-center text-sm text-muted">“မင်္ဂလာပါ Course အကြောင်း သိချင်လို့” လိုမျိုး စမ်းရေးကြည့်ပါ</p>}
          {msgs.map((m) => (
            <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.direction === "in" ? "bg-brand text-white" : "bg-white shadow-sm"}`}>
                {m.attachments.some((a) => a.type === "image") && <div className="text-xs opacity-70">[ပုံ]</div>}
                {m.text}
              </div>
            </div>
          ))}
        </div>
        <ActionForm action={testChatSend} resetOnSuccess className="flex items-end gap-2">
          {hid}
          <Textarea name="text" rows={2} placeholder="Customer အနေနဲ့ ရေးပါ…" className="flex-1" />
          <SubmitButton>ပို့</SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
