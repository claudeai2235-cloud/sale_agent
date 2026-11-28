import { after } from "next/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { channels, customers, messages, tenants, type Channel } from "@/db/schema";
import { resolveSettings } from "@/lib/settings";
import { minutes, sleep } from "@/lib/time";
import { messengerFor } from "@/lib/channels/outbound";
import { verifyMetaSignature, type MsgrEvent, type MsgrWebhook } from "@/lib/channels/messenger";
import { debounceAndProcess, ingestInbound } from "@/lib/agent/engine";
import { tick } from "@/lib/agent/jobs";

export const maxDuration = 300;

/** Meta webhook verification handshake. */
export async function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get("hub.mode") === "subscribe" && u.searchParams.get("hub.verify_token") === process.env.META_VERIFY_TOKEN) {
    return new Response(u.searchParams.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("forbidden", { status: 403 });
}

export async function POST(req: Request) {
  const raw = await req.text();
  if (!verifyMetaSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 401 });
  const body = JSON.parse(raw) as MsgrWebhook;
  if (body.object !== "page") return new Response("ok");

  after(async () => {
    for (const entry of body.entry ?? []) {
      const [ch] = await db.select().from(channels).where(and(eq(channels.type, "messenger"), eq(channels.externalId, entry.id))).limit(1);
      if (!ch || !ch.active) continue;
      await db
        .update(channels)
        .set({ meta: sql`${channels.meta} || ${JSON.stringify({ lastWebhookAt: new Date().toISOString() })}::jsonb` })
        .where(eq(channels.id, ch.id));
      for (const ev of entry.messaging ?? []) {
        try {
          await handleEvent(ch, ev);
        } catch (e) {
          console.error("messenger event failed", e);
        }
      }
    }
    await tick().catch((e) => console.error("tick", e));
  });
  return new Response("EVENT_RECEIVED");
}

async function handleEvent(ch: Channel, ev: MsgrEvent) {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, ch.tenantId)).limit(1);
  const s = resolveSettings(tenant.settings);

  // Echo of a message sent by the Page. If we didn't send it, a human replied from the Page inbox → pause the bot.
  if (ev.message?.is_echo) {
    await sleep(3000); // let our own send() record its message id first
    const [ours] = await db.select({ id: messages.id }).from(messages).where(eq(messages.externalId, ev.message.mid)).limit(1);
    if (ours) return;
    const appId = process.env.META_APP_ID;
    if (appId && String(ev.message.app_id ?? "") === appId) return;
    const [c] = await db
      .select()
      .from(customers)
      .where(and(eq(customers.tenantId, tenant.id), eq(customers.channelType, "messenger"), eq(customers.externalId, ev.recipient.id)))
      .limit(1);
    if (!c) return;
    await db.insert(messages).values({
      tenantId: tenant.id,
      customerId: c.id,
      direction: "out",
      sender: "human",
      text: ev.message.text ?? "",
      externalId: ev.message.mid,
      handled: true,
      meta: { fromPageInbox: true },
    });
    await db
      .update(customers)
      .set({ botPausedUntil: new Date(Date.now() + minutes(s.handoff.pauseMinutes)), lastOutboundAt: new Date(), unanswered: false })
      .where(eq(customers.id, c.id));
    return;
  }

  const text = ev.message?.text ?? ev.postback?.title ?? ev.postback?.payload ?? "";
  const attachments = (ev.message?.attachments ?? [])
    .filter((a) => a.payload?.url)
    .map((a) => ({ type: (a.type === "image" ? (a.payload?.sticker_id ? "sticker" : "image") : a.type === "audio" ? "audio" : a.type === "video" ? "video" : "file") as "image", ref: a.payload!.url! }));
  if (!text && !attachments.length) return;

  const api = messengerFor(ch);
  const [existing] = await db
    .select({ id: customers.id, displayName: customers.displayName })
    .from(customers)
    .where(and(eq(customers.tenantId, tenant.id), eq(customers.channelType, "messenger"), eq(customers.externalId, ev.sender.id)))
    .limit(1);
  let displayName = existing?.displayName;
  if (!displayName) {
    const p = await api.profile(ev.sender.id);
    displayName = p ? [p.first_name, p.last_name].filter(Boolean).join(" ") : "";
  }
  let finalText = text;
  if (!finalText && attachments.some((a) => (a.type as string) === "audio")) finalText = "(Voice message ပို့ထားပါတယ် — နားမထောင်နိုင်ကြောင်း ယဉ်ယဉ်ကျေးကျေး ပြောပြီး စာနဲ့ ရေးပေးဖို့ တောင်းဆိုပါ)";
  if (!finalText && attachments.some((a) => (a.type as string) === "sticker")) finalText = "👍";

  const r = await ingestInbound({
    tenant,
    channel: ch,
    channelType: "messenger",
    externalUserId: ev.sender.id,
    displayName,
    text: finalText,
    attachments,
    externalMessageId: ev.message?.mid ?? `pb:${ev.sender.id}:${ev.timestamp}`,
    at: new Date(ev.timestamp),
  });
  if (!r) return;
  await api.markSeen(ev.sender.id);
  await debounceAndProcess(r.customer.id, r.message.id, s.ai.replyDelaySeconds);
}
