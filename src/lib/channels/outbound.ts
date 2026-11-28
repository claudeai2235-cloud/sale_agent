import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { channels, customers, messages, type Channel, type Customer } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { hours, sleep } from "@/lib/time";
import { MessengerApi } from "./messenger";
import { TelegramApi } from "./telegram";

export function telegramFor(ch: Channel) {
  return new TelegramApi(decrypt(ch.token));
}
export function messengerFor(ch: Channel) {
  return new MessengerApi(decrypt(ch.token));
}

export async function getChannel(id: string | null) {
  if (!id) return null;
  const [ch] = await db.select().from(channels).where(eq(channels.id, id)).limit(1);
  return ch ?? null;
}

/** Messenger only allows free-form messages within 24h of the customer's last message. */
export function messengerWindowOpen(c: Pick<Customer, "lastInboundAt">, marginMinutes = 10) {
  if (!c.lastInboundAt) return false;
  return Date.now() - new Date(c.lastInboundAt).getTime() < hours(24) - marginMinutes * 60_000;
}

export type SendResult = { ok: boolean; error?: string; sent: number; unreachable?: boolean; retryable?: boolean };

type ApiError = Error & { code?: number; subcode?: number };

/**
 * The customer can't receive messages (Messenger #551 "This person isn't available right now",
 * blocked the page/bot, deleted account…). This is about one person, not the channel.
 */
export function isUnreachableError(e: unknown) {
  const err = e as ApiError;
  const msg = (err?.message ?? "").toLowerCase();
  if (err?.code === 551 || err?.subcode === 1545041) return true;
  if (err?.code === 100 && err?.subcode === 2018001) return true; // no matching user
  if (err?.code === 200 && (err?.subcode === 2018028 || err?.subcode === 1545041)) return true; // can't message this person
  return /bot was blocked by the user|user is deactivated|chat not found|bot can't initiate conversation|isn't available right now/.test(msg);
}

/** Network hiccups, rate limits and temporary Graph/Telegram errors are worth retrying. */
export function isTransientError(e: unknown) {
  const err = e as ApiError;
  if (err?.code !== undefined && [1, 2, 4, 17, 32, 341, 613, -1].includes(err.code)) return true;
  const msg = (err?.message ?? "").toLowerCase();
  return err instanceof TypeError || /fetch failed|timeout|timed out|econnreset|etimedout|socket|too many requests|retry after|temporar|unexpected error|service unavailable|bad gateway|internal server error| 5\d\d\b/.test(msg);
}

/** Runs one API call with up to 3 attempts for transient errors (1.5s, 4s back-off). #551 gets one quick re-try too. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let unreachableTries = 0;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const retryUnreachable = isUnreachableError(e) && unreachableTries++ < 1;
      if (attempt >= 2 || !(isTransientError(e) || retryUnreachable)) throw e;
      await sleep(attempt === 0 ? 1500 : 4000);
    }
  }
}

/**
 * Sends one or more chat bubbles to a customer on their channel, records them,
 * and simulates natural typing between bubbles.
 */
export async function sendToCustomer(
  customer: Customer,
  bubbles: string[],
  opts: { sender: "bot" | "human" | "system"; images?: string[]; meta?: Record<string, unknown>; humanAgentTag?: boolean; typing?: boolean } = {
    sender: "bot",
  },
): Promise<SendResult> {
  const texts = bubbles.map((b) => b.trim()).filter(Boolean);
  const images = opts.images ?? [];
  if (!texts.length && !images.length) return { ok: true, sent: 0 };

  let tag: "HUMAN_AGENT" | undefined;
  if (customer.channelType === "messenger" && !messengerWindowOpen(customer, 0)) {
    if (opts.sender === "human" && opts.humanAgentTag) tag = "HUMAN_AGENT";
    else return { ok: false, sent: 0, error: "Messenger 24 နာရီ window ကျော်သွားလို့ ပို့လို့မရပါ (Meta policy)" };
  }

  const ch = customer.channelType === "test" ? null : await getChannel(customer.channelId);
  if (customer.channelType !== "test" && (!ch || !ch.active)) return { ok: false, sent: 0, error: "Channel မရှိ / ပိတ်ထားသည်" };

  let sent = 0;
  try {
    // Telegram Business chats are addressed as "biz:<chatId>" and replied to through the business connection.
    const biz = customer.externalId.startsWith("biz:") ? customer.profile.bizConnectionId : undefined;
    const chatId = customer.externalId.startsWith("biz:") ? customer.externalId.slice(4) : customer.externalId;
    for (const url of images) {
      let externalId: string | undefined;
      if (ch?.type === "telegram") externalId = String((await withRetry(() => telegramFor(ch).sendPhoto(chatId, url, undefined, undefined, biz))).message_id);
      else if (ch?.type === "messenger") externalId = (await withRetry(() => messengerFor(ch).sendImage(customer.externalId, url))).message_id;
      await record(customer, "", opts.sender, externalId, [{ type: "image", ref: url }], opts.meta);
      sent++;
    }
    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      if (opts.typing !== false && ch) {
        if (ch.type === "telegram") await telegramFor(ch).typing(chatId, biz);
        else await messengerFor(ch).typing(customer.externalId);
        // Human-like pause: ~25ms per character, between 0.6s and 2s.
        await sleep(Math.min(2000, Math.max(600, text.length * 25)));
      }
      let externalId: string | undefined;
      if (ch?.type === "telegram") externalId = String((await withRetry(() => telegramFor(ch).sendMessage(chatId, text, undefined, undefined, biz))).message_id);
      else if (ch?.type === "messenger") externalId = (await withRetry(() => messengerFor(ch).sendText(customer.externalId, text, tag))).message_id;
      await record(customer, text, opts.sender, externalId, [], opts.meta);
      sent++;
    }
    if (customer.profile.unreachableAt) {
      await db.update(customers).set({ profile: sql`${customers.profile} - 'unreachableAt'` }).where(eq(customers.id, customer.id));
    }
    return { ok: true, sent };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (isUnreachableError(e)) {
      // One person can't receive messages right now — don't flag the whole channel, don't keep retrying them.
      console.warn("customer unreachable", customer.id, error);
      await db
        .update(customers)
        .set({ profile: sql`${customers.profile} || ${JSON.stringify({ unreachableAt: new Date().toISOString(), unreachableError: error.slice(0, 300) })}::jsonb` })
        .where(eq(customers.id, customer.id));
      return { ok: false, sent, error, unreachable: true };
    }
    console.error("sendToCustomer failed", error);
    if (ch) await db.update(channels).set({ lastError: `${new Date().toISOString()} ${error}` }).where(eq(channels.id, ch.id));
    return { ok: false, sent, error, retryable: isTransientError(e) };
  }
}

async function record(
  customer: Customer,
  text: string,
  sender: "bot" | "human" | "system",
  externalId: string | undefined,
  attachments: { type: "image"; ref: string }[],
  meta?: Record<string, unknown>,
) {
  const now = new Date();
  await db.insert(messages).values({
    tenantId: customer.tenantId,
    customerId: customer.id,
    direction: "out",
    sender,
    text,
    attachments,
    // Telegram message ids are only unique per chat, so namespace them; Messenger mids are global (needed to match echoes).
    externalId: externalId ? (customer.channelType === "telegram" ? `tgout:${customer.id}:${externalId}` : externalId) : null,
    handled: true,
    meta: meta ?? {},
  }).onConflictDoNothing();
  await db
    .update(customers)
    .set({ lastOutboundAt: now, updatedAt: now, ...(sender === "bot" ? { lastBotReplyAt: now } : {}) })
    .where(eq(customers.id, customer.id));
}
