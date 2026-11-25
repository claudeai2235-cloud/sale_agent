import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { adminNotifications, customers, orders, platformSettings, tenants, type Tenant } from "@/db/schema";
import { resolveSettings, type AdminChat } from "@/lib/settings";
import type { TelegramApi, TgUpdate } from "@/lib/channels/telegram";
import { cancelOrder, confirmOrder, resumeBot, sendHumanReply } from "./engine";

/** Which tenants does this Telegram chat administrate through this bot? */
async function adminTenants(botKey: string, chatId: string): Promise<Tenant[]> {
  const rows = await db
    .select()
    .from(tenants)
    .where(sql`exists (select 1 from jsonb_array_elements(coalesce(${tenants.settings}->'notifications'->'adminChats','[]'::jsonb)) e where e->>'chatId' = ${chatId} and e->>'via' = ${botKey})`);
  return rows;
}

async function isSuperAdminChat(chatId: string) {
  const [p] = await db.select().from(platformSettings).limit(1);
  return !!p?.superAdminChatIds.includes(chatId);
}

const HELP = `Thiri Admin Bot 🤖
• Customer စာ / Order / လူကိုလွှဲ အကြောင်းကြားချက်တွေ ဒီကို ရောက်လာပါမယ်။
• အကြောင်းကြားစာကို Reply ပြန်ရင် Customer ဆီ တိုက်ရိုက် ပို့ပေးပါတယ်။
• ခလုတ်တွေနဲ့ Order အတည်ပြု / Bot ပြန်ဖွင့် လုပ်နိုင်ပါတယ်။`;

/**
 * Handles admin traffic on a Telegram bot. Returns true when the update was
 * an admin action (so it must not be treated as a customer message).
 */
export async function handleAdminUpdate(botKey: string, bot: TelegramApi, u: TgUpdate): Promise<boolean> {
  // Linking: /admin CODE
  const msg = u.message;
  const text = msg?.text?.trim() ?? "";
  if (msg && /^\/admin(@\w+)?\s+\S+/i.test(text)) {
    const code = text.split(/\s+/)[1].toUpperCase();
    const chatId = String(msg.chat.id);
    const [p] = await db.select().from(platformSettings).limit(1);
    if (botKey === "platform" && p?.superAdminLinkCode && code === p.superAdminLinkCode) {
      const ids = Array.from(new Set([...(p.superAdminChatIds ?? []), chatId]));
      await db.update(platformSettings).set({ superAdminChatIds: ids }).where(eq(platformSettings.id, 1));
      await bot.sendMessage(chatId, "✅ Super Admin အဖြစ် ချိတ်ဆက်ပြီးပါပြီ။ Billing သတိပေးချက်တွေ ဒီကို ရောက်ပါမယ်။");
      return true;
    }
    const [t] = await db.select().from(tenants).where(eq(tenants.adminLinkCode, code)).limit(1);
    if (!t) {
      await bot.sendMessage(chatId, "❌ Code မှားနေပါတယ်။ Dashboard → Channels စာမျက်နှာက Code ကို ပြန်စစ်ပါ။");
      return true;
    }
    const s = resolveSettings(t.settings);
    const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") || msg.from?.username || chatId;
    const chats: AdminChat[] = [...s.notifications.adminChats.filter((c) => !(c.chatId === chatId && c.via === botKey)), { chatId, via: botKey, name }];
    await db
      .update(tenants)
      .set({ settings: { ...t.settings, notifications: { ...s.notifications, adminChats: chats } } })
      .where(eq(tenants.id, t.id));
    await bot.sendMessage(chatId, `✅ “${t.name}” ရဲ့ Admin အဖြစ် ချိတ်ဆက်ပြီးပါပြီ။\n\n${HELP}`);
    return true;
  }

  const chatId = String(u.callback_query?.message?.chat.id ?? msg?.chat.id ?? "");
  if (!chatId) return false;
  const mine = await adminTenants(botKey, chatId);
  const superAdmin = await isSuperAdminChat(chatId);
  if (!mine.length && !superAdmin) return false;
  const allowedTenant = (id: string) => superAdmin || mine.some((t) => t.id === id);

  // Buttons
  const cq = u.callback_query;
  if (cq?.data) {
    const [action, id] = cq.data.split(":");
    let note = "";
    if (action === "ok" || action === "no") {
      const [o] = await db.select().from(orders).where(eq(orders.id, id)).limit(1);
      if (!o || !allowedTenant(o.tenantId)) note = "ခွင့်မပြုပါ";
      else if (action === "ok") {
        await confirmOrder(id);
        note = `✅ Order #${o.code} အတည်ပြုပြီး Customer ကို အကြောင်းကြားပြီးပါပြီ`;
      } else {
        await cancelOrder(id);
        note = `❌ Order #${o.code} ပယ်ဖျက်ပြီးပါပြီ`;
      }
    } else if (action === "resume") {
      const [c] = await db.select().from(customers).where(eq(customers.id, id)).limit(1);
      if (!c || !allowedTenant(c.tenantId)) note = "ခွင့်မပြုပါ";
      else {
        await resumeBot(id);
        note = "🤖 Bot ပြန်ဖွင့်ပြီးပါပြီ";
      }
    }
    await bot.answerCallback(cq.id, note.slice(0, 190));
    if (cq.message) {
      await bot.clearButtons(cq.message.chat.id, cq.message.message_id);
      if (note) await bot.sendMessage(cq.message.chat.id, note, undefined, cq.message.message_id);
    }
    return true;
  }

  if (!msg) return true;
  // Reply to a notification → message the customer
  if (msg.reply_to_message) {
    const [n] = await db
      .select()
      .from(adminNotifications)
      .where(and(eq(adminNotifications.botKey, botKey), eq(adminNotifications.chatId, chatId), eq(adminNotifications.messageId, msg.reply_to_message.message_id)))
      .limit(1);
    if (!n?.customerId || !allowedTenant(n.tenantId)) {
      await bot.sendMessage(chatId, "ဒီစာက Customer နဲ့ ချိတ်ထားတဲ့ အကြောင်းကြားစာ မဟုတ်ပါ။", undefined, msg.message_id);
      return true;
    }
    const body = msg.text ?? msg.caption ?? "";
    if (!body.trim()) {
      await bot.sendMessage(chatId, "လောလောဆယ် စာသားပဲ ပို့လို့ရပါသေးတယ်။", undefined, msg.message_id);
      return true;
    }
    const res = await sendHumanReply(n.customerId, body);
    await bot.sendMessage(chatId, res.ok ? "✅ ပို့ပြီးပါပြီ" : `❌ ပို့မရပါ: ${res.error}`, undefined, msg.message_id);
    if (res.ok) {
      // Let further replies to this confirmation also route to the same customer.
      await db.insert(adminNotifications).values({ tenantId: n.tenantId, customerId: n.customerId, botKey, chatId, messageId: msg.message_id });
    }
    return true;
  }

  await bot.sendMessage(chatId, HELP);
  return true;
}
