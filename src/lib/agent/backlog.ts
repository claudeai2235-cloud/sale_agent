import { and, desc, eq, gt, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { channels, customers, messages, tenants, type Channel, type ChannelMeta, type Tenant } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { appUrl } from "@/lib/notify";
import { resolveSettings } from "@/lib/settings";
import { hours, minutes } from "@/lib/time";
import { messengerWindowOpen } from "@/lib/channels/outbound";
import { MessengerApi } from "@/lib/channels/messenger";
import { TelegramApi } from "@/lib/channels/telegram";
import { ingestInbound, processCustomer, tenantServing } from "./engine";

export type ScanResult = { imported: number; answered: number; manual: number; error?: string; at: string; auto: boolean };

async function patchChannelMeta(ch: Channel, patch: Partial<ChannelMeta>) {
  await db
    .update(channels)
    .set({ meta: sql`${channels.meta} || ${JSON.stringify(patch)}::jsonb` })
    .where(eq(channels.id, ch.id));
}

/**
 * Reads the Page's recent Messenger conversations, imports customer messages the webhook missed,
 * and lets Thiri answer every conversation whose last message is still from the customer.
 * `maxAnswer` keeps one run short; anything left is answered by the next run / the sweeper.
 */
export async function scanMessengerChannel(tenant: Tenant, ch: Channel, opts: { auto: boolean; maxAnswer?: number }): Promise<ScanResult> {
  const at = new Date().toISOString();
  const api = new MessengerApi(decrypt(ch.token));
  let convs;
  try {
    convs = await api.conversations(opts.auto ? 25 : 50);
  } catch (e) {
    const res = { imported: 0, answered: 0, manual: 0, error: (e as Error).message.slice(0, 300), at, auto: opts.auto };
    await patchChannelMeta(ch, { lastScan: res });
    return res;
  }
  const res: ScanResult = { imported: 0, answered: 0, manual: 0, at, auto: opts.auto };
  const maxAnswer = opts.maxAnswer ?? 50;
  for (const conv of convs.data) {
    const msgs = (conv.messages?.data ?? []).slice().reverse(); // oldest → newest
    const last = msgs[msgs.length - 1];
    if (!last || last.from.id === ch.externalId) continue; // page already replied
    // Auto runs only look at the last 24h — older chats can't be answered on Messenger anyway.
    if (opts.auto && Date.now() - new Date(last.created_time).getTime() > hours(24)) continue;
    const lastPageIdx = msgs.map((m) => m.from.id).lastIndexOf(ch.externalId);
    const unanswered = msgs.slice(lastPageIdx + 1);
    const person = conv.participants.data.find((p) => p.id !== ch.externalId);
    if (!person) continue;

    let customerId: string | null = null;
    for (const m of unanswered) {
      const r = await ingestInbound({
        tenant,
        channel: ch,
        channelType: "messenger",
        externalUserId: person.id,
        displayName: person.name,
        text: m.message ?? "",
        externalMessageId: m.id,
        at: new Date(m.created_time),
      });
      if (r) {
        customerId = r.customer.id;
        res.imported++;
      }
    }
    if (!customerId) {
      const [c] = await db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, tenant.id), eq(customers.channelType, "messenger"), eq(customers.externalId, person.id)))
        .limit(1);
      customerId = c?.id ?? null;
    }
    if (!customerId) continue;
    const [c] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
    const [pending] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.customerId, c.id), eq(messages.direction, "in"), eq(messages.handled, false)))
      .limit(1);
    if (!pending) continue; // already answered / being handled by a human
    if (!messengerWindowOpen(c, 5)) {
      // Meta policy: can't reply after 24h — leave it for a human in the inbox.
      await db.update(messages).set({ handled: true }).where(and(eq(messages.customerId, c.id), eq(messages.handled, false)));
      await db.update(customers).set({ unanswered: true }).where(eq(customers.id, c.id));
      res.manual++;
      continue;
    }
    if (res.answered >= maxAnswer) continue; // left unhandled → the next run / sweeper answers it
    if (c.processingUntil && new Date(c.processingUntil) > new Date()) continue; // already being answered
    await processCustomer(c.id);
    res.answered++;
  }
  // Messages had to be imported → the webhook missed them. Re-subscribe the Page to the app (self-heal).
  if (res.imported > 0) await api.subscribeApp().catch((e) => console.error("re-subscribe failed", e));
  await patchChannelMeta(ch, { lastScan: res });
  return res;
}

/** Makes sure the Telegram webhook still points at this app; fixes it if not. */
async function checkTelegramWebhook(ch: Channel) {
  const api = new TelegramApi(decrypt(ch.token));
  const url = `${appUrl()}/api/webhooks/telegram/${ch.id}`;
  const at = new Date().toISOString();
  try {
    const info = await api.call<{ url: string; pending_update_count: number; last_error_message?: string; last_error_date?: number }>("getWebhookInfo");
    const recentError = info.last_error_date && Date.now() / 1000 - info.last_error_date < 600;
    let fixed = false;
    if (info.url !== url || (recentError && info.pending_update_count > 0)) {
      await api.setWebhook(url, ch.secret);
      fixed = true;
    }
    await patchChannelMeta(ch, {
      lastScan: { imported: 0, answered: 0, manual: 0, at, auto: true, error: fixed ? `Webhook ပြန်ပြင်ပြီး (${info.last_error_message ?? "URL မကိုက်"})` : undefined },
    });
  } catch (e) {
    await patchChannelMeta(ch, { lastScan: { imported: 0, answered: 0, manual: 0, at, auto: true, error: (e as Error).message.slice(0, 300) } });
  }
}

/**
 * Re-answers conversations still flagged "unanswered" where the customer wrote last and Thiri never replied
 * (e.g. a failed delivery or an earlier error). One automatic retry per customer message.
 */
export async function reconcileUnanswered(tenantIds: string[], limit: number) {
  if (!tenantIds.length) return 0;
  const rows = await db
    .select()
    .from(customers)
    .where(
      and(
        inArray(customers.tenantId, tenantIds),
        inArray(customers.channelType, ["telegram", "messenger"]),
        eq(customers.unanswered, true),
        lt(customers.lastInboundAt, new Date(Date.now() - minutes(2))),
        gt(customers.lastInboundAt, new Date(Date.now() - hours(23.5))),
        or(isNull(customers.lastOutboundAt), sql`${customers.lastOutboundAt} < ${customers.lastInboundAt}`),
        or(isNull(customers.processingUntil), lt(customers.processingUntil, new Date())),
        sql`${customers.profile}->>'unreachableAt' is null`,
        sql`coalesce(${customers.profile}->>'autoRetryFor', '') <> to_char(${customers.lastInboundAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')`,
      ),
    )
    .orderBy(customers.lastInboundAt)
    .limit(limit);
  let n = 0;
  for (const c of rows) {
    const key = new Date(c.lastInboundAt!).toISOString().slice(0, 19);
    await db
      .update(customers)
      .set({ profile: sql`${customers.profile} || ${JSON.stringify({ autoRetryFor: key })}::jsonb` })
      .where(eq(customers.id, c.id));
    // Re-open the customer's latest messages (since our last reply) so Thiri answers them.
    const tail = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.customerId, c.id), eq(messages.direction, "in"), c.lastOutboundAt ? gt(messages.createdAt, c.lastOutboundAt) : undefined))
      .orderBy(desc(messages.createdAt))
      .limit(3);
    if (!tail.length) continue;
    await db.update(messages).set({ handled: false }).where(inArray(messages.id, tail.map((m) => m.id)));
    try {
      await processCustomer(c.id); // respects pauses / human handoff / tenant status
      n++;
    } catch (e) {
      console.error("reconcile failed", c.id, e);
    }
  }
  return n;
}

/** Cron job: automatic "check unanswered and reply" for every business that has it switched on. */
export async function runAutoScans(maxChannels = 3) {
  const list = await db.select().from(channels).where(eq(channels.active, true));
  const tenantCache = new Map<string, Tenant | null>();
  const enabledTenants: string[] = [];
  let done = 0;
  for (const ch of list) {
    if (!tenantCache.has(ch.tenantId)) {
      const [t] = await db.select().from(tenants).where(eq(tenants.id, ch.tenantId)).limit(1);
      const s = t ? resolveSettings(t.settings) : null;
      const on = !!t && !!s?.autoScan.enabled && (await tenantServing(t));
      tenantCache.set(ch.tenantId, on ? t : null);
      if (on) enabledTenants.push(t.id);
    }
    const t = tenantCache.get(ch.tenantId);
    if (!t || done >= maxChannels) continue;
    const s = resolveSettings(t.settings);
    const last = ch.meta.lastScan?.at ? new Date(ch.meta.lastScan.at).getTime() : 0;
    if (Date.now() - last < minutes(Math.max(1, s.autoScan.intervalMinutes)) - 10_000) continue;
    done++;
    try {
      if (ch.type === "messenger") await scanMessengerChannel(t, ch, { auto: true, maxAnswer: 5 });
      else await checkTelegramWebhook(ch);
    } catch (e) {
      console.error("auto scan failed", ch.id, e);
    }
  }
  const reconciled = await reconcileUnanswered(enabledTenants, 5).catch((e) => (console.error("reconcile", e), 0));
  return done + reconciled;
}
