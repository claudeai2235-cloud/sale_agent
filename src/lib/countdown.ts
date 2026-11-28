import { MM_TZ } from "./time";
import { withDot } from "./myanmar";

/**
 * Exact class-start countdown, counted in Myanmar calendar days (Asia/Yangon).
 * Computed in code — never by the AI — so the number is always right.
 */

const MONTHS = ["ဇန်နဝါရီ", "ဖေဖော်ဝါရီ", "မတ်", "ဧပြီ", "မေ", "ဇွန်", "ဇူလိုင်", "ဩဂုတ်", "စက်တင်ဘာ", "အောက်တိုဘာ", "နိုဝင်ဘာ", "ဒီဇင်ဘာ"];
const MM_DIGITS = "၀၁၂၃၄၅၆၇၈၉";

export const mmNum = (n: number) => String(n).replace(/\d/g, (d) => MM_DIGITS[Number(d)]);

/** "YYYY-MM-DD" of the given instant in Myanmar time. */
export function mmDateKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MM_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/** Whole Myanmar calendar days from `now` until `target` (0 = today, negative = past). */
export function daysUntil(target: Date, now = new Date()) {
  const [ty, tm, td] = mmDateKey(target).split("-").map(Number);
  const [ny, nm, nd] = mmDateKey(now).split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(ny, nm - 1, nd)) / 86_400_000);
}

/** e.g. "ဒီဇင်ဘာလ ၆ ရက်နေ့" */
export function mmDateText(d: Date) {
  const [, m, day] = mmDateKey(d).split("-").map(Number);
  return `${MONTHS[m - 1]}လ ${mmNum(day)} ရက်နေ့`;
}

export type CountdownInput = { name: string; classStartAt: Date | string | null; enrollDeadlineAt?: Date | string | null };

export type Countdown = { days: number; deadlineDays: number | null; text: string; closed: boolean };

/**
 * The sentence Thiri appends, e.g.
 * "AI အခြေခံအတတ်သင် အတန်းစဖို့ ၈ ရက်သာ ကျန်ပါတော့တယ်ရှင့်။ ဒီဇင်ဘာလ ၆ ရက်နေ့ အတန်းလေး စမှာပါရှင်။"
 * Returns null when there is no upcoming class (no date, or already started).
 */
export function countdownFor(p: CountdownInput, particle = "ရှင်", now = new Date()): Countdown | null {
  if (!p.classStartAt) return null;
  const start = new Date(p.classStartAt);
  const days = daysUntil(start, now);
  if (days < 0) return null;
  const deadline = p.enrollDeadlineAt ? new Date(p.enrollDeadlineAt) : null;
  const deadlineDays = deadline ? daysUntil(deadline, now) : null;
  // Enrolment for this batch is over even though the class hasn't started.
  if (deadlineDays !== null && deadlineDays < 0) return { days, deadlineDays, text: "", closed: true };

  let text: string;
  if (days === 0) text = `${p.name} အတန်းက ဒီနေ့ (${mmDateText(start)}) စမှာပါ${particle}။`;
  else if (days === 1) text = `${p.name} အတန်းစဖို့ မနက်ဖြန် တစ်ရက်ပဲ ကျန်ပါတော့တယ်${withDot(particle)}။ ${mmDateText(start)} အတန်းလေး စမှာပါ${particle}။`;
  else text = `${p.name} အတန်းစဖို့ ${mmNum(days)} ရက်သာ ကျန်ပါတော့တယ်${withDot(particle)}။ ${mmDateText(start)} အတန်းလေး စမှာပါ${particle}။`;

  if (deadline && deadlineDays !== null && deadlineDays >= 0 && deadlineDays < days) {
    text +=
      deadlineDays === 0
        ? ` စာရင်းသွင်းလို့ရတာ ဒီနေ့ နောက်ဆုံးပါနော်${particle}။`
        : ` စာရင်းသွင်းရန် နောက်ဆုံးရက်က ${mmDateText(deadline)} (${mmNum(deadlineDays)} ရက်သာ ကျန်) ပါနော်${particle}။`;
  }
  return { days, deadlineDays, text, closed: false };
}
