export const MM_TZ = "Asia/Yangon";

export function mmNow(d = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: MM_TZ,
    dateStyle: "full",
    timeStyle: "short",
  }).format(d);
}

export function mmHour(d = new Date()) {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: MM_TZ, hour: "numeric", hourCycle: "h23" }).format(d));
}

export function fmt(d: Date | string | null | undefined) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: MM_TZ, dateStyle: "medium", timeStyle: "short" }).format(new Date(d));
}

export function fmtDate(d: Date | string | null | undefined) {
  if (!d) return "-";
  return new Intl.DateTimeFormat("en-GB", { timeZone: MM_TZ, dateStyle: "medium" }).format(new Date(d));
}

export function inQuietHours(start: number, end: number, d = new Date()) {
  if (start === end) return false;
  const h = mmHour(d);
  return start < end ? h >= start && h < end : h >= start || h < end;
}

export const minutes = (n: number) => n * 60_000;
export const hours = (n: number) => n * 3_600_000;
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Request-time helpers (kept out of components so render code stays pure). */
export const nowMs = () => Date.now();
export const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
