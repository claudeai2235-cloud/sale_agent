import { after } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { channels, platformSettings, tenants } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { resolveSettings } from "@/lib/settings";
import { TelegramApi, type TgUpdate } from "@/lib/channels/telegram";
import { handleAdminUpdate } from "@/lib/agent/admin-bot";
import { debounceAndProcess, ingestInbound } from "@/lib/agent/engine";
import { handleBusinessUpdate } from "@/lib/agent/telegram-business";
import { tick } from "@/lib/agent/jobs";

export const maxDuration = 300;

export async function POST(req: Request, ctx: RouteContext<"/api/webhooks/telegram/[key]">) {
  const { key } = await ctx.params;
  const secret = req.headers.get("x-telegram-bot-api-secret-token");
  const update = (await req.json().catch(() => null)) as TgUpdate | null;
  if (!update) return new Response("bad request", { status: 400 });

  if (key === "platform") {
    const [p] = await db.select().from(platformSettings).limit(1);
    if (!p?.notifyBotToken || secret !== p.notifyBotSecret) return new Response("forbidden", { status: 403 });
    const bot = new TelegramApi(decrypt(p.notifyBotToken));
    after(async () => {
      const handled = await handleAdminUpdate("platform", bot, update);
      if (!handled && update.message) await bot.sendMessage(update.message.chat.id, "ဒါက Admin အကြောင်းကြားချက် Bot ပါ။ `/admin CODE` နဲ့ ချိတ်ဆက်ပါ။");
    });
    return Response.json({ ok: true });
  }

  const [ch] = await db.select().from(channels).where(eq(channels.id, key)).limit(1);
  if (!ch || ch.type !== "telegram" || secret !== ch.secret) return new Response("forbidden", { status: 403 });
  if (!ch.active) return Response.json({ ok: true });
  await db
    .update(channels)
    .set({ meta: sql`${channels.meta} || ${JSON.stringify({ lastWebhookAt: new Date().toISOString() })}::jsonb` })
    .where(eq(channels.id, ch.id));
  const bot = new TelegramApi(decrypt(ch.token));
  const botKey = `channel:${ch.id}`;

  after(async () => {
    try {
      if (update.business_connection || update.business_message) {
        await handleBusinessUpdate(ch, update);
        return;
      }
      if (await handleAdminUpdate(botKey, bot, update)) return;
      const m = update.message;
      if (!m || m.chat.type !== "private" || !m.from) return;
      const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ch.tenantId)).limit(1);
      let text = m.text ?? m.caption ?? "";
      if (/^\/start\b/.test(text)) text = "(Customer က Bot ကို စတင်ဖွင့်လိုက်ပါတယ် — နွေးနွေးထွေးထွေး နှုတ်ဆက်ပြီး ဘာကူညီရမလဲ မေးပါ)";
      const attachments = [
        ...(m.photo?.length ? [{ type: "image" as const, ref: m.photo[m.photo.length - 1].file_id }] : []),
        ...(m.document?.mime_type?.startsWith("image/") ? [{ type: "image" as const, ref: m.document.file_id, mime: m.document.mime_type }] : []),
        ...(m.voice ? [{ type: "audio" as const, ref: m.voice.file_id }] : []),
        ...(m.sticker ? [{ type: "sticker" as const, ref: m.sticker.file_id }] : []),
      ];
      if (m.sticker && !text) text = m.sticker.emoji ?? "(sticker)";
      if (m.voice && !text) text = "(Voice message ပို့ထားပါတယ် — နားမထောင်နိုင်ကြောင်း ယဉ်ယဉ်ကျေးကျေး ပြောပြီး စာနဲ့ ရေးပေးဖို့ တောင်းဆိုပါ)";
      const r = await ingestInbound({
        tenant,
        channel: ch,
        channelType: "telegram",
        externalUserId: String(m.chat.id),
        displayName: [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || m.from.username || "",
        text,
        attachments,
        externalMessageId: `tg:${ch.id}:${m.message_id}`,
        at: new Date(m.date * 1000),
      });
      if (r) {
        await bot.typing(m.chat.id);
        await debounceAndProcess(r.customer.id, r.message.id, resolveSettings(tenant.settings).ai.replyDelaySeconds);
      }
    } catch (e) {
      console.error("telegram webhook processing failed", e);
    }
    await tick().catch((e) => console.error("tick", e));
  });
  return Response.json({ ok: true });
}
