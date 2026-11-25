import Link from "next/link";
import { and, asc, desc, eq, ne, or, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { customers, messages, orders, products } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { botPaused } from "@/lib/agent/engine";
import { messengerWindowOpen } from "@/lib/channels/outbound";
import { formatMMK } from "@/lib/myanmar";
import { fmt } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Empty, PageHeader, Select, STAGE_LABEL, ORDER_STATUS, Textarea } from "@/components/ui";
import { botControlAction, sendReplyAction } from "../actions";

const FILTERS = [
  { key: "all", label: "အားလုံး" },
  { key: "human", label: "🙋 လူကိုင်ရန်" },
  { key: "unanswered", label: "⏳ မဖြေရသေး" },
  { key: "hot", label: "🔥 ဝယ်ရန်နီး" },
  { key: "paid", label: "✅ ဝယ်ပြီး" },
];

export default async function InboxPage({ params, searchParams }: PageProps<"/t/[tenantId]/inbox">) {
  const { tenantId } = await params;
  const sp = await searchParams;
  const f = typeof sp.f === "string" ? sp.f : "all";
  const cid = typeof sp.c === "string" ? sp.c : undefined;
  await requireTenant(tenantId);

  const conds: SQL[] = [eq(customers.tenantId, tenantId), ne(customers.channelType, "test")];
  if (f === "human") conds.push(eq(customers.needsHuman, true));
  if (f === "unanswered") conds.push(eq(customers.unanswered, true));
  if (f === "hot") conds.push(or(eq(customers.stage, "ready"), eq(customers.stage, "ordered"))!);
  if (f === "paid") conds.push(eq(customers.stage, "paid"));
  const list = await db.select().from(customers).where(and(...conds)).orderBy(desc(customers.updatedAt)).limit(100);

  const b = `/t/${tenantId}/inbox`;
  let detail = null;
  if (cid) {
    const [c] = await db.select().from(customers).where(and(eq(customers.id, cid), eq(customers.tenantId, tenantId))).limit(1);
    if (c) {
      const [msgs, os, ps] = await Promise.all([
        db.select().from(messages).where(eq(messages.customerId, c.id)).orderBy(asc(messages.createdAt)).limit(300),
        db.select().from(orders).where(eq(orders.customerId, c.id)).orderBy(desc(orders.createdAt)),
        db.select({ id: products.id, name: products.name }).from(products).where(eq(products.tenantId, tenantId)),
      ]);
      detail = { c, msgs, os, ps };
    }
  }
  const hid = <input type="hidden" name="tenantId" value={tenantId} />;

  return (
    <div>
      <PageHeader title="စကားဝိုင်းများ" desc="Thiri ဖြေနေတာတွေကို ကြည့်ပြီး လိုအပ်ရင် ကိုယ်တိုင် ဝင်ဖြေနိုင်ပါတယ် (ကိုယ်တိုင်ဖြေရင် Bot က ခဏ ရပ်ပေးပါမယ်)" />
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((x) => (
          <Link key={x.key} href={`${b}?f=${x.key}`} className={`rounded-full border px-3 py-1 text-sm ${f === x.key ? "border-brand bg-brand-soft text-brand" : "border-line bg-white"}`}>
            {x.label}
          </Link>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <div className="max-h-[75vh] overflow-y-auto rounded-xl border border-line bg-panel">
          {!list.length && <p className="p-4 text-sm text-muted">မရှိပါ</p>}
          {list.map((c) => (
            <Link key={c.id} href={`${b}?f=${f}&c=${c.id}`} className={`block border-b border-line p-3 hover:bg-gray-50 ${cid === c.id ? "bg-brand-soft" : ""}`}>
              <div className="flex items-center gap-2">
                <span>{c.channelType === "telegram" ? "✈️" : "💬"}</span>
                <span className="flex-1 truncate text-sm font-medium">{c.name || c.displayName || "Customer"}</span>
                {c.unanswered && <span className="h-2 w-2 rounded-full bg-red-500" />}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1">
                <Badge tone={STAGE_LABEL[c.stage].tone}>{STAGE_LABEL[c.stage].label}</Badge>
                {c.needsHuman && <Badge tone="red">လူကိုင်ရန်</Badge>}
                <span className="ml-auto text-xs text-muted">{fmt(c.lastInboundAt ?? c.updatedAt)}</span>
              </div>
            </Link>
          ))}
        </div>

        {!detail ? (
          <Empty>ဘယ်ဘက်က စကားဝိုင်းတစ်ခု ရွေးပါ</Empty>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
            <div className="flex max-h-[75vh] flex-col rounded-xl border border-line bg-panel">
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {detail.msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.direction === "in" ? "justify-start" : "justify-end"}`}>
                    <div
                      className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                        m.direction === "in" ? "bg-gray-100" : m.sender === "human" ? "bg-amber-100" : "bg-brand text-white"
                      }`}
                    >
                      {m.attachments.map((a, i) =>
                        a.type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img key={i} src={m.direction === "in" ? `/api/media/${m.id}?i=${i}` : a.ref} alt="" className="mb-1 max-h-60 rounded-lg" />
                        ) : (
                          <div key={i} className="text-xs opacity-70">[{a.type}]</div>
                        ),
                      )}
                      {m.text && <div className="whitespace-pre-wrap">{m.text}</div>}
                      <div className="mt-0.5 text-[10px] opacity-60">
                        {m.sender === "human" ? "👤 Admin · " : m.sender === "bot" ? "🤖 Thiri · " : ""}
                        {m.meta && (m.meta as { followup?: number }).followup ? "Follow-up · " : ""}
                        {fmt(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t border-line p-3">
                {detail.c.channelType === "messenger" && !messengerWindowOpen(detail.c, 0) && (
                  <p className="mb-2 text-xs text-amber-700">⚠️ ၂၄ နာရီကျော်သွားပါပြီ — HUMAN_AGENT tag ဖွင့်ထားမှ ပို့လို့ရပါမယ် (Thiri & AI Setting)</p>
                )}
                <ActionForm action={sendReplyAction} resetOnSuccess className="flex items-end gap-2">
                  {hid}
                  <input type="hidden" name="customerId" value={detail.c.id} />
                  <Textarea name="text" rows={2} placeholder="ကိုယ်တိုင် စာပြန်ရန်…" className="flex-1" />
                  <SubmitButton>ပို့</SubmitButton>
                </ActionForm>
              </div>
            </div>

            <div className="space-y-4">
              <Card title={detail.c.name || detail.c.displayName || "Customer"}>
                <div className="space-y-1 text-sm">
                  <div>📞 {detail.c.phone ?? "-"}</div>
                  {detail.c.profile.email && <div>✉️ {detail.c.profile.email}</div>}
                  {detail.c.profile.address && <div>📍 {detail.c.profile.address}</div>}
                  <div className="pt-1">
                    {botPaused(detail.c) ? <Badge tone="amber">Bot ရပ်ထား ({fmt(detail.c.botPausedUntil)} အထိ)</Badge> : <Badge tone="green">Thiri ဖြေနေ</Badge>}
                  </div>
                  {detail.c.handoffReason && <div className="text-xs text-red-600">လွှဲရခြင်း: {detail.c.handoffReason}</div>}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["answer", "🤖 Thiri ကို ဖြေခိုင်းမည်"],
                      botPaused(detail.c) ? ["resume", "Bot ပြန်ဖွင့်"] : ["pause", "Bot ရပ်မည်"],
                      ["done", "✓ ပြီးပြီ"],
                      ["stopFollowup", "Follow-up မလိုက်တော့"],
                    ] as const
                  ).map(([op, label]) => (
                    <form key={op} action={botControlAction}>
                      {hid}
                      <input type="hidden" name="customerId" value={detail.c.id} />
                      <input type="hidden" name="op" value={op} />
                      <SubmitButton variant="ghost">{label}</SubmitButton>
                    </form>
                  ))}
                </div>
                <form action={botControlAction} className="mt-3 flex gap-2">
                  {hid}
                  <input type="hidden" name="customerId" value={detail.c.id} />
                  <input type="hidden" name="op" value="stage" />
                  <Select name="stage" defaultValue={detail.c.stage}>
                    {Object.entries(STAGE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v.label}
                      </option>
                    ))}
                  </Select>
                  <SubmitButton variant="ghost">ပြောင်း</SubmitButton>
                </form>
              </Card>
              <Card title="🧠 Thiri သိထားတာ">
                <dl className="space-y-2 text-sm">
                  {(
                    [
                      ["လိုအပ်ချက်", detail.c.profile.needs],
                      ["ပြဿနာ", detail.c.profile.painPoints],
                      ["တွန့်ဆုတ်မှု", detail.c.profile.objections],
                      ["စိတ်ဝင်စားတာ", detail.c.profile.interestedProductIds?.map((id) => detail.ps.find((p) => p.id === id)?.name ?? "")],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-xs text-muted">{k}</dt>
                      <dd>{v?.filter(Boolean).join("၊ ") || "-"}</dd>
                    </div>
                  ))}
                  {detail.c.profile.budget && (
                    <div>
                      <dt className="text-xs text-muted">Budget</dt>
                      <dd>{detail.c.profile.budget}</dd>
                    </div>
                  )}
                  {detail.c.profile.lostReason && (
                    <div>
                      <dt className="text-xs text-muted">မဝယ်ရခြင်း</dt>
                      <dd>{detail.c.profile.lostReason}</dd>
                    </div>
                  )}
                </dl>
              </Card>
              {detail.os.length > 0 && (
                <Card title="🧾 Order">
                  {detail.os.map((o) => (
                    <div key={o.id} className="mb-2 text-sm">
                      #{o.code} — {formatMMK(o.total)} <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                    </div>
                  ))}
                </Card>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
