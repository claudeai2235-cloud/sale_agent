import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { channels, customers, messages, tenants, type Channel } from "@/db/schema";
import { resolveSettings } from "@/lib/settings";
import { minutes } from "@/lib/time";
import type { TgUpdate } from "@/lib/channels/telegram";
import { debounceAndProcess, ingestInbound } from "./engine";

/**
 * Telegram Business: a Telegram Premium user connects this bot in
 * Settings → Telegram Business → Chatbots, and Thiri answers customers
 * inside that user's own private chats.
 */
export async function handleBusinessUpdate(ch: Channel, u: TgUpdate) {
  const bc = u.business_connection;
  if (bc) {
    const business = { ...(ch.meta.business ?? {}) };
    business[bc.id] = {
      id: bc.id,
      ownerUserId: String(bc.user.id),
      ownerName: [bc.user.first_name, bc.user.last_name].filter(Boolean).join(" ") || bc.user.username || String(bc.user.id),
      canReply: bc.rights?.can_reply ?? bc.can_reply ?? false,
      enabled: bc.is_enabled,
      at: new Date(bc.date * 1000).toISOString(),
    };
    await db.update(channels).set({ meta: { ...ch.meta, business } }).where(eq(channels.id, ch.id));
    return;
  }

  const m = u.business_message;
  if (!m?.business_connection_id || m.chat.type !== "private") return;
  if (m.sender_business_bot) return; // sent by a bot (us) on behalf of the owner
  const conn = ch.meta.business?.[m.business_connection_id];
  if (!conn || !conn.enabled) return;

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ch.tenantId)).limit(1);
  const s = resolveSettings(tenant.settings);
  const externalUserId = `biz:${m.chat.id}`;

  // The owner typed in this chat themself → record as a human reply and let Thiri step back.
  if (m.from && String(m.from.id) === conn.ownerUserId) {
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenant.id), eq(customers.channelType, "telegram"), eq(customers.externalId, externalUserId)))
      .limit(1);
    if (!c) return;
    await db
      .insert(messages)
      .values({
        tenantId: tenant.id,
        customerId: c.id,
        direction: "out",
        sender: "human",
        text: m.text ?? m.caption ?? "",
        externalId: `tgbiz:${ch.id}:${m.chat.id}:${m.message_id}`,
        handled: true,
        meta: { fromOwnerAccount: true },
      })
      .onConflictDoNothing();
    await db
      .update(customers)
      .set({ botPausedUntil: new Date(Date.now() + minutes(s.handoff.pauseMinutes)), lastOutboundAt: new Date(), unanswered: false })
      .where(eq(customers.id, c.id));
    return;
  }

  if (!conn.canReply) return;
  const r = await ingestInbound({
    tenant,
    channel: ch,
    channelType: "telegram",
    externalUserId,
    displayName: [m.from?.first_name, m.from?.last_name].filter(Boolean).join(" ") || m.from?.username || "",
    text: m.text ?? m.caption ?? (m.sticker ? (m.sticker.emoji ?? "👍") : ""),
    attachments: m.photo?.length ? [{ type: "image", ref: m.photo[m.photo.length - 1].file_id }] : [],
    externalMessageId: `tgbiz:${ch.id}:${m.chat.id}:${m.message_id}`,
    at: new Date(m.date * 1000),
  });
  if (!r) return;
  if (r.customer.profile.bizConnectionId !== conn.id) {
    await db
      .update(customers)
      .set({ profile: { ...r.customer.profile, bizConnectionId: conn.id } })
      .where(eq(customers.id, r.customer.id));
  }
  await debounceAndProcess(r.customer.id, r.message.id, s.ai.replyDelaySeconds);
}
