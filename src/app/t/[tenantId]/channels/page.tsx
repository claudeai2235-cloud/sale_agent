import { eq } from "drizzle-orm";
import { db } from "@/db";
import { channels, platformSettings } from "@/db/schema";
import { requireTenant } from "@/lib/auth";
import { resolveSettings } from "@/lib/settings";
import { appUrl } from "@/lib/notify";
import { fmt } from "@/lib/time";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Card, Field, Input, PageHeader } from "@/components/ui";
import { connectMessenger, connectTelegram, deleteChannel, regenerateLinkCode, removeAdminChat, scanMessengerBacklog, toggleChannel } from "../actions";

export default async function ChannelsPage({ params }: PageProps<"/t/[tenantId]/channels">) {
  const { tenantId } = await params;
  const { tenant } = await requireTenant(tenantId);
  const list = await db.select().from(channels).where(eq(channels.tenantId, tenantId));
  const [p] = await db.select().from(platformSettings).limit(1);
  const s = resolveSettings(tenant.settings);
  const tgBots = list.filter((c) => c.type === "telegram");
  const hid = <input type="hidden" name="tenantId" value={tenantId} />;
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Messenger / Telegram ချိတ်ဆက်ခြင်း" desc="Token တွေကို Database ထဲမှာ Encrypt လုပ်ပြီး သိမ်းပါတယ်။ Chat ထဲ ဘယ်တော့မှ မပို့ပါနဲ့။" />

      <Card title="ချိတ်ထားသော Channel များ">
        {!list.length && <p className="text-sm text-muted">မချိတ်ရသေးပါ</p>}
        <div className="divide-y divide-line">
          {list.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="text-xl">{c.type === "telegram" ? "✈️" : "💬"}</span>
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {c.name} <span className="text-xs text-muted">{c.type === "telegram" ? `@${c.externalId}` : `Page ID ${c.externalId}`}</span>
                </div>
                {c.lastError && <div className="truncate text-xs text-red-600">နောက်ဆုံး Error: {c.lastError}</div>}
                {Object.values(c.meta.business ?? {}).map((b) => (
                  <div key={b.id} className="text-xs text-muted">
                    💼 Telegram Business: {b.ownerName} ရဲ့ Account — {b.enabled && b.canReply ? <span className="text-emerald-600">Thiri ဖြေနေ</span> : <span className="text-red-600">ပိတ်/ဖြေခွင့်မရှိ</span>}
                  </div>
                ))}
              </div>
              <Badge tone={c.active ? "green" : "gray"}>{c.active ? "အလုပ်လုပ်နေ" : "ပိတ်ထား"}</Badge>
              {c.type === "messenger" && (
                <ActionForm action={scanMessengerBacklog} className="contents">
                  {hid}
                  <input type="hidden" name="channelId" value={c.id} />
                  <SubmitButton variant="ghost">📥 မဖြေရသေးတာတွေ စစ်ပြီး ဖြေမည်</SubmitButton>
                </ActionForm>
              )}
              <form action={toggleChannel}>
                {hid}
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton variant="ghost">{c.active ? "ပိတ်" : "ဖွင့်"}</SubmitButton>
              </form>
              <form action={deleteChannel}>
                {hid}
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton variant="danger" confirm="ဖြုတ်မှာ သေချာလား?">ဖြုတ်</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card title="✈️ Telegram Bot ချိတ်ရန်">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Telegram မှာ @BotFather ကို ဖွင့်ပြီး /newbot (သို့) ရှိပြီးသား Bot ရဲ့ Token ကို ယူပါ</li>
            <li>Token ကို အောက်မှာ ထည့်ပါ — Webhook ကို အလိုအလျောက် သတ်မှတ်ပေးပါမယ်</li>
            <li>
              <b>Telegram Business (ကိုယ်ပိုင် Account ထဲက Chat တွေကို Thiri ဖြေစေချင်ရင်):</b> Premium Account → Settings → Telegram Business → Chatbots → ဒီ Bot ကို ထည့်ပြီး “Reply to messages” ဖွင့်ပါ။ ကိုယ်တိုင် ဝင်ရေးလိုက်ရင် အဲ့ Customer အတွက် Thiri ခဏ ရပ်ပေးပါမယ်။
            </li>
          </ol>
          <ActionForm action={connectTelegram} resetOnSuccess>
            {hid}
            <Field label="Bot Token">
              <Input name="token" type="password" placeholder="123456789:AA…" autoComplete="off" required />
            </Field>
            <SubmitButton>ချိတ်မည်</SubmitButton>
          </ActionForm>
        </Card>
        <Card title="💬 Facebook Messenger ချိတ်ရန်">
          <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>Meta App ရဲ့ Webhook ကို <code className="rounded bg-gray-100 px-1">{appUrl() || "<APP_URL>"}/api/webhooks/messenger</code> သို့ သတ်မှတ်ပြီး messages, messaging_postbacks, message_echoes ကို Subscribe လုပ်ပါ (Control Center တစ်ခါပဲ လုပ်ရ)</li>
            <li>Page ရဲ့ Page Access Token ကို အောက်မှာ ထည့်ပါ</li>
          </ol>
          <ActionForm action={connectMessenger} resetOnSuccess>
            {hid}
            <Field label="Page Access Token" hint="Page token ဖြစ်ရမယ် (User token မဟုတ်) — pages_messaging, pages_read_engagement, pages_manage_metadata ခွင့်ပြုချက်ပါရမယ်">
              <Input name="token" type="password" placeholder="EAA…" autoComplete="off" required />
            </Field>
            <Field label="Page ID (မထည့်လည်းရ)" hint="Token စစ်လို့မရရင် သုံးပါတယ် — Facebook Page → About → Page transparency (သို့) Meta Business Suite မှာ ကြည့်ပါ">
              <Input name="pageId" inputMode="numeric" placeholder="1234567890" autoComplete="off" />
            </Field>
            <SubmitButton>ချိတ်မည်</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card
        title="🔔 Admin အကြောင်းကြားချက် (Telegram)"
        desc="Order၊ ငွေလွှဲ Screenshot၊ လူကိုလွှဲ စတာတွေ Admin ရဲ့ Telegram ကို ရောက်လာမယ်။ အကြောင်းကြားစာကို Reply ပြန်ရင် Customer ဆီ ရောက်ပါတယ်။"
      >
        <div className="rounded-lg bg-brand-soft p-4 text-sm">
          <p>အောက်က Bot တစ်ခုခုကို Telegram မှာ ဖွင့်ပြီး ဒီ Command ကို ပို့ပါ:</p>
          <p className="my-2 font-mono text-base font-semibold">/admin {tenant.adminLinkCode}</p>
          <ul className="list-disc pl-5">
            {tgBots.map((b) => (
              <li key={b.id}>@{b.externalId} (ဒီလုပ်ငန်းရဲ့ Bot)</li>
            ))}
            {p?.notifyBotUsername && <li>@{p.notifyBotUsername} (Platform အကြောင်းကြား Bot — Messenger သီးသန့်သုံးရင်)</li>}
            {!tgBots.length && !p?.notifyBotUsername && <li>Telegram Bot တစ်ခု အရင်ချိတ်ပါ</li>}
          </ul>
          <form action={regenerateLinkCode} className="mt-2">
            {hid}
            <button className="text-xs text-brand underline">Code အသစ်ထုတ်မည်</button>
          </form>
        </div>
        <div className="mt-4 divide-y divide-line">
          {s.notifications.adminChats.map((c) => (
            <div key={`${c.via}${c.chatId}`} className="flex items-center gap-3 py-2 text-sm">
              <span className="flex-1">
                {c.name ?? c.chatId} <span className="text-xs text-muted">via {c.via === "platform" ? "Platform bot" : "Business bot"}</span>
              </span>
              <form action={removeAdminChat}>
                {hid}
                <input type="hidden" name="chatId" value={c.chatId} />
                <input type="hidden" name="via" value={c.via} />
                <button className="text-xs text-red-600">ဖယ်ရှား</button>
              </form>
            </div>
          ))}
          {!s.notifications.adminChats.length && <p className="py-2 text-sm text-muted">Admin မချိတ်ရသေးပါ</p>}
        </div>
      </Card>
      <p className="text-xs text-muted">Updated {fmt(new Date())}</p>
    </div>
  );
}
