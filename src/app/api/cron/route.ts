import { tick, ensurePlatformRow } from "@/lib/agent/jobs";

export const maxDuration = 300;

/**
 * Background jobs: follow-ups, payment reminders, self-learning, billing reminders, daily summary.
 * Call every 5-10 minutes (Vercel schedule or any external cron) with
 * `Authorization: Bearer <CRON_SECRET>` or `?key=<CRON_SECRET>`.
 */
export async function GET(req: Request) {
  const key = new URL(req.url).searchParams.get("key") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return new Response("forbidden", { status: 403 });
  await ensurePlatformRow();
  const r = await tick();
  return Response.json(r);
}
