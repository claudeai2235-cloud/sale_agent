/** Minimal Telegram Bot API client. */

export type TgInlineButton = { text: string; callback_data?: string; url?: string };

export class TelegramApi {
  constructor(private token: string) {}

  async call<T = unknown>(method: string, body: Record<string, unknown> = {}): Promise<T> {
    const res = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string };
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description ?? res.status}`);
    return json.result as T;
  }

  getMe() {
    return this.call<{ id: number; username: string; first_name: string }>("getMe");
  }

  setWebhook(url: string, secret: string) {
    return this.call("setWebhook", {
      url,
      secret_token: secret,
      allowed_updates: ["message", "edited_message", "callback_query", "business_connection", "business_message"],
      drop_pending_updates: false,
    });
  }

  sendMessage(chatId: string | number, text: string, buttons?: TgInlineButton[][], replyTo?: number, businessConnectionId?: string) {
    return this.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
      text: text.slice(0, 4096),
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
      ...(replyTo ? { reply_parameters: { message_id: replyTo, allow_sending_without_reply: true } } : {}),
      link_preview_options: { is_disabled: true },
    });
  }

  sendPhoto(chatId: string | number, photo: string, caption?: string, buttons?: TgInlineButton[][], businessConnectionId?: string) {
    return this.call<{ message_id: number }>("sendPhoto", {
      chat_id: chatId,
      ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}),
      photo,
      caption: caption?.slice(0, 1024),
      ...(buttons ? { reply_markup: { inline_keyboard: buttons } } : {}),
    });
  }

  typing(chatId: string | number, businessConnectionId?: string) {
    return this.call("sendChatAction", { chat_id: chatId, action: "typing", ...(businessConnectionId ? { business_connection_id: businessConnectionId } : {}) }).catch(
      () => undefined,
    );
  }

  answerCallback(id: string, text?: string) {
    return this.call("answerCallbackQuery", { callback_query_id: id, text }).catch(() => undefined);
  }

  clearButtons(chatId: string | number, messageId: number) {
    return this.call("editMessageReplyMarkup", { chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }).catch(
      () => undefined,
    );
  }

  async downloadFile(fileId: string): Promise<{ data: Buffer; mime: string }> {
    const f = await this.call<{ file_path: string }>("getFile", { file_id: fileId });
    const res = await fetch(`https://api.telegram.org/file/bot${this.token}/${f.file_path}`);
    if (!res.ok) throw new Error(`Telegram file download ${res.status}`);
    const ext = f.file_path.split(".").pop()?.toLowerCase();
    const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
    return { data: Buffer.from(await res.arrayBuffer()), mime };
  }
}

/* Update types (subset) */
export type TgUser = { id: number; first_name?: string; last_name?: string; username?: string };
export type TgMessage = {
  message_id: number;
  from?: TgUser;
  chat: { id: number; type: string };
  date: number;
  text?: string;
  caption?: string;
  photo?: { file_id: string; width: number; height: number }[];
  document?: { file_id: string; mime_type?: string };
  voice?: { file_id: string };
  sticker?: { file_id: string; emoji?: string };
  reply_to_message?: { message_id: number };
  business_connection_id?: string;
  sender_business_bot?: TgUser;
};
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  callback_query?: { id: string; from: TgUser; data?: string; message?: { message_id: number; chat: { id: number } } };
  business_connection?: {
    id: string;
    user: TgUser;
    user_chat_id: number;
    date: number;
    can_reply?: boolean;
    rights?: { can_reply?: boolean };
    is_enabled: boolean;
  };
  business_message?: TgMessage;
};
