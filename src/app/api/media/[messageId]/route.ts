import { eq } from "drizzle-orm";
import { db } from "@/db";
import { customers, messages } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { verifyMediaSig } from "@/lib/notify";
import { getChannel, telegramFor } from "@/lib/channels/outbound";

/** Streams a customer attachment (e.g. payment screenshot) for the dashboard or Telegram admin notifications. */
export async function GET(req: Request, ctx: RouteContext<"/api/media/[messageId]">) {
  const { messageId } = await ctx.params;
  const u = new URL(req.url);
  const i = Number(u.searchParams.get("i") ?? 0);
  const [m] = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!m) return new Response("not found", { status: 404 });
  if (!verifyMediaSig(messageId, i, u.searchParams.get("sig"))) {
    const s = await getSession();
    if (!s || (s.role !== "super_admin" && s.tid !== m.tenantId)) return new Response("forbidden", { status: 403 });
  }
  const a = m.attachments[i];
  if (!a) return new Response("not found", { status: 404 });
  if (a.blobUrl) return Response.redirect(a.blobUrl, 302);
  const [c] = await db.select().from(customers).where(eq(customers.id, m.customerId)).limit(1);
  try {
    if (c.channelType === "telegram") {
      const ch = await getChannel(c.channelId);
      if (!ch) return new Response("channel missing", { status: 404 });
      const f = await telegramFor(ch).downloadFile(a.ref);
      return new Response(new Uint8Array(f.data), { headers: { "content-type": f.mime, "cache-control": "private, max-age=3600" } });
    }
    const res = await fetch(a.ref);
    if (!res.ok) return new Response("expired", { status: 410 });
    return new Response(res.body, { headers: { "content-type": res.headers.get("content-type") ?? "image/jpeg", "cache-control": "private, max-age=3600" } });
  } catch {
    return new Response("unavailable", { status: 502 });
  }
}
