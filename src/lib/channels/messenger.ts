import { createHmac, timingSafeEqual } from "node:crypto";

const GRAPH = () => `https://graph.facebook.com/${process.env.GRAPH_API_VERSION || "v23.0"}`;

export class MessengerApi {
  constructor(private pageToken: string) {}

  private async req<T>(path: string, init?: { method?: string; body?: unknown; query?: Record<string, string> }): Promise<T> {
    const q = new URLSearchParams({ ...(init?.query ?? {}), access_token: this.pageToken });
    const res = await fetch(`${GRAPH()}/${path}?${q}`, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
    });
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message: string; code?: number; error_subcode?: number } };
    if (!res.ok || json.error) {
      const e = new Error(`Messenger: ${json.error?.message ?? res.status}`) as Error & { code?: number; subcode?: number };
      e.code = json.error?.code;
      e.subcode = json.error?.error_subcode;
      throw e;
    }
    return json;
  }

  me() {
    return this.req<{ id: string; name: string }>("me", { query: { fields: "id,name" } });
  }

  /** Just the Page ID — needs fewer permissions than reading the name. */
  meId() {
    return this.req<{ id: string }>("me", { query: { fields: "id" } });
  }

  /** Sends a text. `tag` is only used for human replies outside the 24h window (HUMAN_AGENT needs Meta approval). */
  sendText(psid: string, text: string, tag?: "HUMAN_AGENT") {
    return this.req<{ message_id: string }>("me/messages", {
      method: "POST",
      body: {
        recipient: { id: psid },
        messaging_type: tag ? "MESSAGE_TAG" : "RESPONSE",
        ...(tag ? { tag } : {}),
        message: { text: text.slice(0, 2000) },
      },
    });
  }

  sendImage(psid: string, url: string) {
    return this.req<{ message_id: string }>("me/messages", {
      method: "POST",
      body: {
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: { attachment: { type: "image", payload: { url, is_reusable: true } } },
      },
    });
  }

  typing(psid: string) {
    return this.req("me/messages", { method: "POST", body: { recipient: { id: psid }, sender_action: "typing_on" } }).catch(() => undefined);
  }

  markSeen(psid: string) {
    return this.req("me/messages", { method: "POST", body: { recipient: { id: psid }, sender_action: "mark_seen" } }).catch(() => undefined);
  }

  profile(psid: string) {
    return this.req<{ first_name?: string; last_name?: string; name?: string }>(psid, { query: { fields: "first_name,last_name" } }).catch(
      () => null,
    );
  }

  subscribeApp() {
    return this.req("me/subscribed_apps", {
      method: "POST",
      query: { subscribed_fields: "messages,messaging_postbacks,message_echoes" },
    });
  }

  /** Recent conversations with their latest messages, for the "unanswered backlog" scan. */
  conversations(limit = 50) {
    return this.req<{
      data: {
        id: string;
        updated_time: string;
        unread_count?: number;
        participants: { data: { id: string; name?: string }[] };
        messages?: { data: { id: string; message?: string; created_time: string; from: { id: string; name?: string } }[] };
      }[];
    }>("me/conversations", {
      query: { platform: "messenger", limit: String(limit), fields: "updated_time,unread_count,participants,messages.limit(10){message,created_time,from}" },
    });
  }
}

export function verifyMetaSignature(rawBody: string, header: string | null): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret) return false;
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/* Webhook types (subset) */
export type MsgrEvent = {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    app_id?: number;
    attachments?: { type: string; payload?: { url?: string; sticker_id?: number } }[];
  };
  postback?: { title?: string; payload?: string };
  read?: unknown;
  delivery?: unknown;
};
export type MsgrWebhook = { object: string; entry: { id: string; time: number; messaging?: MsgrEvent[] }[] };
