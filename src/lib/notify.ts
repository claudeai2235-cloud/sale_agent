import { createHmac } from "node:crypto";
import { db } from "@/db";
import { adminNotifications, platformSettings, type Tenant } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { resolveSettings } from "@/lib/settings";
import { getChannel, telegramFor } from "@/lib/channels/outbound";
import { TelegramApi, type TgInlineButton } from "@/lib/channels/telegram";

export function appUrl() {
  const u = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return u.replace(/\/$/, "");
}

/** Signed URL so Telegram (or a browser) can fetch a customer attachment through our server. */
export function signedMediaUrl(messageId: string, index = 0) {
  const sig = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`${messageId}:${index}`).digest("base64url").slice(0, 32);
  return `${appUrl()}/api/media/${messageId}?i=${index}&sig=${sig}`;
}
export function verifyMediaSig(messageId: string, index: number, sig: string | null) {
  if (!sig) return false;
  const expected = createHmac("sha256", process.env.SESSION_SECRET ?? "").update(`${messageId}:${index}`).digest("base64url").slice(0, 32);
  return expected === sig;
}

export async function platformBot(): Promise<TelegramApi | null> {
  const [p] = await db.select().from(platformSettings).limit(1);
  return p?.notifyBotToken ? new TelegramApi(decrypt(p.notifyBotToken)) : null;
}

/** botKey: "platform" or "channel:<channelId>" */
export async function botForKey(key: string): Promise<TelegramApi | null> {
  if (key === "platform") return platformBot();
  if (key.startsWith("channel:")) {
    const ch = await getChannel(key.slice(8));
    return ch && ch.type === "telegram" ? telegramFor(ch) : null;
  }
  return null;
}

export type NotifyEvent = "order" | "payment" | "handoff" | "summary" | "message" | "info";

export async function notifyAdmins(
  tenant: Tenant,
  event: NotifyEvent,
  n: { text: string; customerId?: string; photoUrl?: string; buttons?: TgInlineButton[][] },
) {
  const s = resolveSettings(tenant.settings).notifications;
  const enabled =
    event === "order" ? s.onOrder : event === "payment" ? s.onPaymentProof : event === "handoff" ? s.onHandoff : event === "summary" ? s.onDailySummary : true;
  if (!enabled || !s.adminChats.length) return 0;
  let delivered = 0;
  for (const chat of s.adminChats) {
    try {
      const bot = await botForKey(chat.via);
      if (!bot) continue;
      let messageId: number;
      if (n.photoUrl && appUrl()) {
        try {
          messageId = (await bot.sendPhoto(chat.chatId, n.photoUrl, n.text, n.buttons)).message_id;
        } catch {
          messageId = (await bot.sendMessage(chat.chatId, n.text, n.buttons)).message_id;
        }
      } else {
        messageId = (await bot.sendMessage(chat.chatId, n.text, n.buttons)).message_id;
      }
      if (n.customerId) {
        await db.insert(adminNotifications).values({ tenantId: tenant.id, customerId: n.customerId, botKey: chat.via, chatId: chat.chatId, messageId });
      }
      delivered++;
    } catch (e) {
      console.error("notifyAdmins failed", chat.chatId, e);
    }
  }
  return delivered;
}

export async function notifySuperAdmin(text: string) {
  const [p] = await db.select().from(platformSettings).limit(1);
  if (!p?.notifyBotToken || !p.superAdminChatIds.length) return;
  const bot = new TelegramApi(decrypt(p.notifyBotToken));
  for (const chatId of p.superAdminChatIds) await bot.sendMessage(chatId, text).catch((e) => console.error(e));
}
