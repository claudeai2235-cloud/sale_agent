import { after } from "next/server";
import { tick, ensurePlatformRow } from "@/lib/agent/jobs";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * Background jobs: follow-ups, payment reminders, self-learning, billing reminders, daily summary.
 * Call every 5 minutes (cron-job.org, Vercel schedule, …) with
 * `?key=<CRON_SECRET>` or `Authorization: Bearer <CRON_SECRET>`.
 *
 * Responds immediately (cron services time out after ~30s) and runs the jobs
 * in the background. Add `&wait=1` to wait for the result when testing by hand.
 */
async function handle(req: Request) {
  const url = new URL(req.url);
  const key = (url.searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "").trim();
  const secret = (process.env.CRON_SECRET ?? "").trim();
  if (!secret) return Response.json({ ok: false, error: "CRON_SECRET is not configured" }, { status: 500 });
  if (key !== secret) return Response.json({ ok: false, error: "wrong key" }, { status: 403 });

  const run = async () => {
    try {
      await ensurePlatformRow();
      return await tick();
    } catch (e) {
      console.error("cron tick failed", e);
      return { ran: false, error: e instanceof Error ? e.message : String(e) };
    }
  };

  if (url.searchParams.get("wait") === "1") {
    const result = await run();
    return Response.json({ ok: !("error" in result), ...result, note: result.ran ? undefined : "jobs ran less than a minute ago — skipped" });
  }

  after(run);
  return Response.json({ ok: true, started: new Date().toISOString() }, { headers: { "cache-control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
