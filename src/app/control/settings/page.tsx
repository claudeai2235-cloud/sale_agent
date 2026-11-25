import { db } from "@/db";
import { platformSettings } from "@/db/schema";
import { appUrl } from "@/lib/notify";
import { ensurePlatformRow } from "@/lib/agent/jobs";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, Input, PageHeader, Toggle } from "@/components/ui";
import { connectNotifyBot, regenerateSuperCode, removeSuperChat, savePlatform } from "../actions";

const ENV = ["DATABASE_URL", "GEMINI_API_KEY", "ENCRYPTION_KEY", "SESSION_SECRET", "APP_URL", "CRON_SECRET", "META_APP_SECRET", "META_VERIFY_TOKEN", "META_APP_ID", "SETUP_SECRET"];

export default async function PlatformSettings() {
  await ensurePlatformRow();
  const [p] = await db.select().from(platformSettings).limit(1);
  const base = appUrl();
  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Platform Setting" desc="လုပ်ငန်းအားလုံးကို သက်ရောက်တဲ့ Setting များ" />
      <Card title="🤖 AI Model (Gemini)" desc="Model ID ကို Google AI Studio ရဲ့ Models စာမျက်နှာမှာ စစ်ပါ။ “-latest” alias တွေက Google ရဲ့ နောက်ဆုံး Flash / Flash-Lite ကို အလိုအလျောက် ညွှန်ပါတယ်။">
        <ActionForm action={savePlatform}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Chat model (Customer နဲ့ စကားပြော)" hint="အရောင်းအတွက် ဉာဏ်ကောင်းဖို့ Flash ကို အကြံပြု">
              <Input name="defaultChatModel" defaultValue={p.defaultChatModel} />
            </Field>
            <Field label="Lite model (သင်ယူမှု/Backup)" hint="စျေးအသက်သာဆုံး">
              <Input name="defaultLiteModel" defaultValue={p.defaultLiteModel} />
            </Field>
          </div>
          <Toggle name="globalPause" label="🚨 Bot အားလုံးကို ချက်ချင်း ရပ်မည် (Emergency)" defaultChecked={p.globalPause} />
          <SubmitButton />
        </ActionForm>
      </Card>
      <Card
        title="🔔 Platform အကြောင်းကြား Telegram Bot"
        desc="Messenger သီးသန့်သုံးတဲ့ လုပ်ငန်းတွေရဲ့ Admin အကြောင်းကြားချက်နဲ့ သင့် Billing သတိပေးချက်တွေ အတွက် Bot သီးသန့် တစ်ခု (@BotFather မှာ အသစ်ဖန်တီးပါ — Customer bot နဲ့ မတူရ)"
      >
        {p.notifyBotUsername && <p className="mb-3 text-sm">လက်ရှိ: @{p.notifyBotUsername}</p>}
        <ActionForm action={connectNotifyBot} resetOnSuccess>
          <Field label="Bot Token">
            <Input name="token" type="password" autoComplete="off" required />
          </Field>
          <SubmitButton>ချိတ်မည်</SubmitButton>
        </ActionForm>
        <div className="mt-4 rounded-lg bg-brand-soft p-4 text-sm">
          Super Admin အဖြစ် ချိတ်ရန် Platform bot ကို <span className="font-mono font-semibold">/admin {p.superAdminLinkCode ?? "—"}</span> ပို့ပါ
          <form action={regenerateSuperCode} className="mt-1">
            <button className="text-xs text-brand underline">Code အသစ်</button>
          </form>
          <ul className="mt-2">
            {p.superAdminChatIds.map((c) => (
              <li key={c} className="flex items-center gap-2">
                {c}
                <form action={removeSuperChat}>
                  <input type="hidden" name="chatId" value={c} />
                  <button className="text-xs text-red-600">ဖယ်</button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      </Card>
      <Card title="🌐 Webhook / Cron URL များ">
        <ul className="space-y-2 break-all font-mono text-xs">
          <li>Messenger webhook: {base}/api/webhooks/messenger</li>
          <li>Cron (၅-၁၀ မိနစ်တစ်ခါ): {base}/api/cron?key=CRON_SECRET</li>
        </ul>
      </Card>
      <Card title="🔐 Environment Variables">
        <ul className="grid gap-1 text-sm md:grid-cols-2">
          {ENV.map((k) => (
            <li key={k}>
              {process.env[k] ? "✅" : "❌"} <span className="font-mono">{k}</span>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
