import { describe, expect, it } from "vitest";
import { countdownFor, daysUntil, mmDateText } from "../src/lib/countdown";

const start = new Date("2026-12-06T09:00:00+06:30");

describe("class countdown (Myanmar days)", () => {
  it("matches the owner's example: 8 days on 28 Nov, 7 days on 29 Nov", () => {
    expect(countdownFor({ name: "AI အခြေခံအတတ်သင်", classStartAt: start }, "ရှင်", new Date("2026-11-28T10:00:00+06:30"))?.text).toBe(
      "AI အခြေခံအတတ်သင် အတန်းစဖို့ ၈ ရက်သာ ကျန်ပါတော့တယ်ရှင့်။ ဒီဇင်ဘာလ ၆ ရက်နေ့ အတန်းလေး စမှာပါရှင်။",
    );
    expect(countdownFor({ name: "X", classStartAt: start }, "ရှင်", new Date("2026-11-29T10:00:00+06:30"))?.days).toBe(7);
  });
  it("counts by Myanmar calendar day, not UTC (just after midnight MMT)", () => {
    // 18:00 UTC on 28 Nov is already 00:30 on 29 Nov in Yangon
    expect(daysUntil(start, new Date("2026-11-28T18:00:00Z"))).toBe(7);
  });
  it("handles tomorrow, today, past", () => {
    expect(countdownFor({ name: "X", classStartAt: start }, "ရှင်", new Date("2026-12-05T20:00:00+06:30"))?.text).toContain("မနက်ဖြန်");
    expect(countdownFor({ name: "X", classStartAt: start }, "ရှင်", new Date("2026-12-06T07:00:00+06:30"))?.text).toContain("ဒီနေ့");
    expect(countdownFor({ name: "X", classStartAt: start }, "ရှင်", new Date("2026-12-07T07:00:00+06:30"))).toBeNull();
  });
  it("mentions the enrol deadline, and marks closed after it", () => {
    const deadline = new Date("2026-12-03T23:59:00+06:30");
    const c = countdownFor({ name: "X", classStartAt: start, enrollDeadlineAt: deadline }, "ရှင်", new Date("2026-11-28T10:00:00+06:30"));
    expect(c?.text).toContain("ဒီဇင်ဘာလ ၃ ရက်နေ့ (၅ ရက်သာ ကျန်)");
    expect(countdownFor({ name: "X", classStartAt: start, enrollDeadlineAt: deadline }, "ရှင်", new Date("2026-12-04T10:00:00+06:30"))?.closed).toBe(true);
  });
  it("formats Burmese dates", () => {
    expect(mmDateText(start)).toBe("ဒီဇင်ဘာလ ၆ ရက်နေ့");
  });
});
