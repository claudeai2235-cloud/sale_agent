/**
 * Per-business configuration. Everything here is editable from the business
 * dashboard; missing keys fall back to DEFAULT_SETTINGS.
 */

export type OrderField = { key: string; label: string; required: boolean; hint?: string };
export type FollowupStep = { delayMinutes: number; goal: string };
export type AdminChat = { chatId: string; via: string; name?: string };

export type HandoffTrigger =
  | "complaint"
  | "ask_human"
  | "refund"
  | "discount"
  | "payment_issue"
  | "angry"
  | "uncertain"
  | "custom";

export type TenantSettings = {
  persona: {
    name: string;
    role: string;
    politeParticle: string;
    emojiLevel: "none" | "low" | "medium";
    maxBubbles: number;
    extraStyle: string;
  };
  ai: {
    chatModel: string; // empty = platform default
    thinkingLevel: "default" | "low" | "medium" | "high";
    temperature: number;
    confidenceThreshold: number;
    historyMessages: number;
    replyDelaySeconds: number;
  };
  order: {
    fields: OrderField[];
    requirePaymentProof: boolean;
    afterOrderMessage: string;
    confirmedMessage: string;
  };
  handoff: {
    enabled: boolean;
    triggers: Record<HandoffTrigger, boolean>;
    maxDiscountPercent: number;
    keywords: string[];
    customRules: string;
    pauseMinutes: number;
    customerMessage: string;
  };
  followup: {
    enabled: boolean;
    steps: FollowupStep[];
    paymentReminderMinutes: number;
    telegramMaxHours: number;
    quietStartHour: number;
    quietEndHour: number;
  };
  notifications: {
    adminChats: AdminChat[];
    onOrder: boolean;
    onPaymentProof: boolean;
    onHandoff: boolean;
    onDailySummary: boolean;
  };
  learning: { enabled: boolean; autoApprove: boolean };
  messenger: { humanAgentTag: boolean };
};

export const HANDOFF_TRIGGER_LABELS: Record<HandoffTrigger, string> = {
  complaint: "Complaint / မကျေနပ်မှု တိုင်ကြားလာရင်",
  ask_human: "လူနဲ့ပြောချင်တယ်လို့ တောင်းဆိုရင်",
  refund: "ငွေပြန်အမ်း / ပစ္စည်းပြန်လဲ တောင်းဆိုရင်",
  discount: "ခွင့်ပြုထားတဲ့ Discount ထက် ပိုဆစ်ရင်",
  payment_issue: "ငွေလွှဲပြဿနာ (လွှဲပြီးပေမဲ့ မရောက်၊ ငွေမကိုက်)",
  angry: "Customer စိတ်ဆိုး / ရိုင်းစိုင်းလာရင်",
  uncertain: "Bot မသေချာတဲ့အခါ (Data ထဲမှာ အဖြေမရှိ)",
  custom: "ကိုယ်တိုင်သတ်မှတ်ထားတဲ့ အခြေအနေများ",
};

export const DEFAULT_SETTINGS: TenantSettings = {
  persona: {
    name: "Thiri",
    role: "အရောင်းနဲ့ Customer Service တာဝန်ခံ",
    politeParticle: "ရှင်",
    emojiLevel: "low",
    maxBubbles: 3,
    extraStyle: "",
  },
  ai: {
    chatModel: "",
    thinkingLevel: "low",
    temperature: 0.7,
    confidenceThreshold: 0.45,
    historyMessages: 24,
    replyDelaySeconds: 4,
  },
  order: {
    fields: [
      { key: "name", label: "အမည်", required: true },
      { key: "phone", label: "ဖုန်းနံပါတ်", required: true },
      { key: "email", label: "Gmail (Course access အတွက်)", required: false },
      { key: "address", label: "နေရပ်လိပ်စာ", required: false },
    ],
    requirePaymentProof: true,
    afterOrderMessage:
      "Order လေး မှတ်ထားပေးပါပြီရှင့်။ ငွေလွှဲပြီးရင် Screenshot လေး ဒီမှာ ပို့ပေးပါနော်။",
    confirmedMessage:
      "ငွေလက်ခံရရှိပါပြီရှင့်၊ ကျေးဇူးအများကြီးတင်ပါတယ်။ ဆက်လုပ်ရမယ့်အဆင့်တွေကို အခုပဲ ပို့ပေးပါမယ်နော်။",
  },
  handoff: {
    enabled: true,
    triggers: {
      complaint: true,
      ask_human: true,
      refund: true,
      discount: true,
      payment_issue: true,
      angry: true,
      uncertain: true,
      custom: true,
    },
    maxDiscountPercent: 0,
    keywords: [],
    customRules: "",
    pauseMinutes: 120,
    customerMessage: "ခဏလေး စောင့်ပေးပါနော်ရှင့်၊ တာဝန်ရှိသူနဲ့ တိုက်ရိုက် ချိတ်ဆက်ပေးပါမယ်။",
  },
  followup: {
    enabled: true,
    steps: [
      { delayMinutes: 60, goal: "စိတ်ဝင်စားနေတုန်းလား နွေးနွေးထွေးထွေး မေးပြီး မေးစရာရှိရင် ကူညီမယ်လို့ ပြော" },
      {
        delayMinutes: 20 * 60,
        goal: "ဆုံးဖြတ်ဖို့ ခက်နေတဲ့ အကြောင်းရင်းကို ဖြေရှင်းပေး၊ promotion/အကျိုးကျေးဇူးကို သတိပေးပြီး နောက်ဆုံးတစ်ခါ ညင်ညင်သာသာ ဆွဲခေါ်",
      },
    ],
    paymentReminderMinutes: 180,
    telegramMaxHours: 72,
    quietStartHour: 22,
    quietEndHour: 8,
  },
  notifications: {
    adminChats: [],
    onOrder: true,
    onPaymentProof: true,
    onHandoff: true,
    onDailySummary: true,
  },
  learning: { enabled: true, autoApprove: false },
  messenger: { humanAgentTag: false },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function deepMerge<T>(base: T, over: unknown): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : (over as T)) ?? base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) continue;
    const b = (base as Record<string, unknown>)[k];
    out[k] = isObj(b) && isObj(v) ? deepMerge(b, v) : v;
  }
  return out as T;
}

export function resolveSettings(stored: Partial<TenantSettings> | null | undefined): TenantSettings {
  return deepMerge(DEFAULT_SETTINGS, stored ?? {});
}
