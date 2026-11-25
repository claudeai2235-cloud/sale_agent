import { describe, expect, it, beforeAll } from "vitest";
import { toUnicode, mmDigitsToLatin } from "../src/lib/myanmar";
import { resolveSettings, DEFAULT_SETTINGS } from "../src/lib/settings";
import { effectivePrice } from "../src/lib/agent/prompt";
import { encrypt, decrypt } from "../src/lib/crypto";
import { inQuietHours } from "../src/lib/time";
import type { Product } from "../src/db/schema";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "test-key-0123456789abcdef";
});

describe("myanmar text", () => {
  it("converts Zawgyi to Unicode", () => {
    expect(toUnicode("ေက်းဇူးတင္ပါတယ္")).toEqual({ text: "ကျေးဇူးတင်ပါတယ်", wasZawgyi: true });
  });
  it("leaves Unicode and English alone", () => {
    expect(toUnicode("ဈေးဘယ်လောက်လဲ").wasZawgyi).toBe(false);
    expect(toUnicode("hello").text).toBe("hello");
  });
  it("converts Myanmar digits", () => {
    expect(mmDigitsToLatin("၀၉၁၂၃")).toBe("09123");
  });
});

describe("settings", () => {
  it("deep-merges stored settings over defaults", () => {
    const s = resolveSettings({ persona: { name: "Hnin" } } as never);
    expect(s.persona.name).toBe("Hnin");
    expect(s.persona.politeParticle).toBe(DEFAULT_SETTINGS.persona.politeParticle);
    expect(s.handoff.triggers.complaint).toBe(true);
  });
  it("arrays replace instead of merging", () => {
    const s = resolveSettings({ followup: { steps: [{ delayMinutes: 5, goal: "x" }] } } as never);
    expect(s.followup.steps).toHaveLength(1);
  });
});

describe("pricing", () => {
  const base = { price: 100000, salePrice: 70000, saleEndsAt: null } as unknown as Product;
  it("uses sale price while active", () => {
    expect(effectivePrice(base)).toEqual({ price: 70000, onSale: true });
    expect(effectivePrice({ ...base, saleEndsAt: new Date(Date.now() + 86400000) })).toEqual({ price: 70000, onSale: true });
  });
  it("falls back to normal price after the sale ends", () => {
    expect(effectivePrice({ ...base, saleEndsAt: new Date(Date.now() - 1000) })).toEqual({ price: 100000, onSale: false });
    expect(effectivePrice({ ...base, salePrice: null })).toEqual({ price: 100000, onSale: false });
  });
});

describe("crypto", () => {
  it("round-trips tokens", () => {
    const c = encrypt("secret-token");
    expect(c).not.toContain("secret-token");
    expect(decrypt(c)).toBe("secret-token");
  });
});

describe("quiet hours (Myanmar time)", () => {
  it("handles ranges across midnight", () => {
    // 16:00 UTC = 22:30 MMT
    expect(inQuietHours(22, 8, new Date("2026-01-01T16:00:00Z"))).toBe(true);
    // 06:00 UTC = 12:30 MMT
    expect(inQuietHours(22, 8, new Date("2026-01-01T06:00:00Z"))).toBe(false);
  });
});
