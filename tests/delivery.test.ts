import { describe, expect, it } from "vitest";
import { isTransientError, isUnreachableError } from "@/lib/channels/outbound";

const graph = (message: string, code?: number, subcode?: number) => Object.assign(new Error(`Messenger: ${message}`), { code, subcode });

describe("delivery error classification", () => {
  it("treats Messenger #551 as one unreachable person, not a transient failure", () => {
    const e = graph("(#551) This person isn't available right now.", 551, 1545041);
    expect(isUnreachableError(e)).toBe(true);
    expect(isTransientError(e)).toBe(false);
  });
  it("detects blocked Telegram users", () => {
    expect(isUnreachableError(new Error("Telegram sendMessage: Forbidden: bot was blocked by the user"))).toBe(true);
  });
  it("retries rate limits and network errors", () => {
    expect(isTransientError(graph("Calls to this api have exceeded the rate limit.", 613))).toBe(true);
    expect(isTransientError(new TypeError("fetch failed"))).toBe(true);
    expect(isTransientError(new Error("Telegram sendMessage: Too Many Requests: retry after 3"))).toBe(true);
    expect(isTransientError(graph("500"))).toBe(true);
  });
  it("does not retry auth / policy errors", () => {
    const e = graph("Error validating access token", 190);
    expect(isTransientError(e)).toBe(false);
    expect(isUnreachableError(e)).toBe(false);
  });
});
