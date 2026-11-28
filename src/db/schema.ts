import {
  pgTable,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,

  uuid,
  index,
  uniqueIndex,
  date,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { TenantSettings } from "@/lib/settings";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ───────────── Platform (Bot Control Center) ───────────── */

export const platformSettings = pgTable("platform_settings", {
  id: integer("id").primaryKey().default(1),
  defaultChatModel: text("default_chat_model").notNull().default("gemini-flash-latest"),
  defaultLiteModel: text("default_lite_model").notNull().default("gemini-flash-lite-latest"),
  /** Encrypted token of an optional platform-wide Telegram bot used for admin notifications. */
  notifyBotToken: text("notify_bot_token"),
  notifyBotUsername: text("notify_bot_username"),
  notifyBotSecret: text("notify_bot_secret"),
  /** Telegram chat ids of the super admin (linked with /admin <code> on the platform bot). */
  superAdminChatIds: jsonb("super_admin_chat_ids").$type<string[]>().notNull().default([]),
  superAdminLinkCode: text("super_admin_link_code"),
  globalPause: boolean("global_pause").notNull().default(false),
  lastTickAt: timestamp("last_tick_at", { withTimezone: true }),
  lastLearnAt: timestamp("last_learn_at", { withTimezone: true }),
  lastBillingCheckAt: timestamp("last_billing_check_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const tenants = pgTable("tenants", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  status: text("status").$type<"active" | "suspended">().notNull().default("active"),
  botEnabled: boolean("bot_enabled").notNull().default(true),
  /** Answers to the business questionnaire, keyed by question key. */
  profile: jsonb("profile").$type<Record<string, string>>().notNull().default({}),
  settings: jsonb("settings").$type<Partial<TenantSettings>>().notNull().default({}),
  /** Code an admin sends to the bot as `/admin <code>` to receive notifications. */
  adminLinkCode: text("admin_link_code").notNull(),
  // Billing
  planName: text("plan_name").notNull().default("Standard"),
  monthlyFee: integer("monthly_fee").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  graceDays: integer("grace_days").notNull().default(3),
  billingNote: text("billing_note"),
  lastExpiryReminderAt: timestamp("last_expiry_reminder_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tenantPayments = pgTable("tenant_payments", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(),
  months: integer("months").notNull().default(1),
  method: text("method"),
  note: text("note"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull().default(""),
  passwordHash: text("password_hash").notNull(),
  role: text("role").$type<"super_admin" | "tenant_owner" | "tenant_staff">().notNull(),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    day: date("day").notNull(),
    model: text("model").notNull(),
    purpose: text("purpose").notNull(),
    calls: integer("calls").notNull().default(0),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
  },
  (t) => [uniqueIndex("ai_usage_uniq").on(t.tenantId, t.day, t.model, t.purpose)],
);

/* ───────────── Channels ───────────── */

export type BusinessConnection = { id: string; ownerUserId: string; ownerName: string; canReply: boolean; enabled: boolean; at: string };
export type ChannelMeta = { business?: Record<string, BusinessConnection> };

export const channels = pgTable(
  "channels",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    type: text("type").$type<"telegram" | "messenger">().notNull(),
    name: text("name").notNull().default(""),
    /** Telegram: bot username. Messenger: page id. */
    externalId: text("external_id").notNull(),
    /** Encrypted bot token / page access token. */
    token: text("token").notNull(),
    /** Telegram webhook secret token. */
    secret: text("secret").notNull(),
    active: boolean("active").notNull().default(true),
    lastError: text("last_error"),
    /** Telegram Business connections (bot answering inside a Premium user's own chats). */
    meta: jsonb("meta").$type<ChannelMeta>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("channels_type_ext").on(t.type, t.externalId)],
);

/* ───────────── Catalogue & knowledge ───────────── */

export const products = pgTable("products", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"course" | "product" | "service">().notNull().default("product"),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  details: text("details").notNull().default(""),
  benefits: text("benefits").notNull().default(""),
  audience: text("audience").notNull().default(""),
  price: integer("price").notNull().default(0),
  salePrice: integer("sale_price"),
  saleEndsAt: timestamp("sale_ends_at", { withTimezone: true }),
  /** Courses: class start date and last day to enrol — drive the exact countdown Thiri tells customers. */
  classStartAt: timestamp("class_start_at", { withTimezone: true }),
  enrollDeadlineAt: timestamp("enroll_deadline_at", { withTimezone: true }),
  duration: text("duration").notNull().default(""),
  deliveryInfo: text("delivery_info").notNull().default(""),
  bonus: text("bonus").notNull().default(""),
  imageUrl: text("image_url"),
  stock: integer("stock"),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const faqs = pgTable("faqs", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  source: text("source").$type<"manual" | "learned" | "ai">().notNull().default("manual"),
  createdAt: createdAt(),
});

export const objections = pgTable("objections", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  objection: text("objection").notNull(),
  response: text("response").notNull(),
  source: text("source").$type<"manual" | "learned" | "ai">().notNull().default("manual"),
  createdAt: createdAt(),
});

export const paymentMethods = pgTable("payment_methods", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  accountName: text("account_name").notNull().default(""),
  accountNumber: text("account_number").notNull().default(""),
  note: text("note").notNull().default(""),
  isCod: boolean("is_cod").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/* ───────────── Conversations ───────────── */

export type CustomerProfile = {
  needs?: string[];
  painPoints?: string[];
  objections?: string[];
  interestedProductIds?: string[];
  budget?: string;
  notes?: string;
  email?: string;
  address?: string;
  lostReason?: string;
  source?: string;
  /** Telegram Business connection used to reply to this customer. */
  bizConnectionId?: string;
  /** Long-term facts Thiri remembers about this customer (older than the chat window). */
  memory?: string[];
  /** productId → Myanmar date (YYYY-MM-DD) the countdown was last told, so it isn't repeated the same day. */
  countdownShown?: Record<string, string>;
  /** Messenger said this person can't be reached (#551 — blocked/left/unavailable). Cleared when they write again. */
  unreachableAt?: string;
  unreachableError?: string;
  deliveryRetries?: number;
  /** Bought / enrolled — Thiri supports instead of selling. */
  enrolledProductIds?: string[];
};

export const customers = pgTable(
  "customers",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => channels.id, { onDelete: "set null" }),
    channelType: text("channel_type").$type<"telegram" | "messenger" | "test">().notNull(),
    externalId: text("external_id").notNull(),
    displayName: text("display_name").notNull().default(""),
    name: text("name"),
    phone: text("phone"),
    stage: text("stage")
      .$type<"new" | "interested" | "considering" | "ready" | "ordered" | "paid" | "lost">()
      .notNull()
      .default("new"),
    profile: jsonb("profile").$type<CustomerProfile>().notNull().default({}),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    botPausedUntil: timestamp("bot_paused_until", { withTimezone: true }),
    handoffReason: text("handoff_reason"),
    needsHuman: boolean("needs_human").notNull().default(false),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    lastOutboundAt: timestamp("last_outbound_at", { withTimezone: true }),
    lastBotReplyAt: timestamp("last_bot_reply_at", { withTimezone: true }),
    /** Follow-up step already sent since the customer's last message (0 = none). */
    followupStep: integer("followup_step").notNull().default(0),
    followupStoppedAt: timestamp("followup_stopped_at", { withTimezone: true }),
    processingUntil: timestamp("processing_until", { withTimezone: true }),
    unanswered: boolean("unanswered").notNull().default(false),
    learnedAt: timestamp("learned_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("customers_tenant_channel_ext").on(t.tenantId, t.channelType, t.externalId),
    index("customers_tenant_updated").on(t.tenantId, t.updatedAt),
  ],
);

export type Attachment = {
  type: "image" | "file" | "audio" | "video" | "sticker";
  /** Messenger: CDN url. Telegram: file_id. */
  ref: string;
  mime?: string;
  blobUrl?: string;
};

export const messages = pgTable(
  "messages",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    direction: text("direction").$type<"in" | "out">().notNull(),
    sender: text("sender").$type<"customer" | "bot" | "human" | "system">().notNull(),
    text: text("text").notNull().default(""),
    attachments: jsonb("attachments").$type<Attachment[]>().notNull().default([]),
    externalId: text("external_id"),
    handled: boolean("handled").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("messages_customer_created").on(t.customerId, t.createdAt),
    // Dedupes webhook re-deliveries (Meta/Telegram retry) even when they race.
    uniqueIndex("messages_tenant_external").on(t.tenantId, t.externalId).where(sql`${t.externalId} is not null`),
  ],
);

export type OrderItem = { productId: string; name: string; qty: number; unitPrice: number };

export const orders = pgTable(
  "orders",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").notNull().references(() => customers.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    items: jsonb("items").$type<OrderItem[]>().notNull().default([]),
    total: integer("total").notNull().default(0),
    paymentMethod: text("payment_method"),
    fields: jsonb("fields").$type<Record<string, string>>().notNull().default({}),
    status: text("status")
      .$type<"awaiting_payment" | "payment_submitted" | "confirmed" | "cancelled">()
      .notNull()
      .default("awaiting_payment"),
    paymentProof: jsonb("payment_proof").$type<{ attachment: Attachment; messageId: string; index: number; detectedAmount?: number; at: string } | null>(),
    paymentReminderSent: boolean("payment_reminder_sent").notNull().default(false),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("orders_tenant_created").on(t.tenantId, t.createdAt)],
);

/** Maps a Telegram notification message to a customer so admins can reply to it. */
export const adminNotifications = pgTable(
  "admin_notifications",
  {
    id: id(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    botKey: text("bot_key").notNull(),
    chatId: text("chat_id").notNull(),
    messageId: integer("message_id").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("admin_notif_lookup").on(t.botKey, t.chatId, t.messageId)],
);

/* ───────────── Self-learning & insights ───────────── */

export const lessons = pgTable("lessons", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"faq" | "objection" | "gap" | "insight" | "style">().notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  customerId: uuid("customer_id").references(() => customers.id, { onDelete: "set null" }),
  status: text("status").$type<"pending" | "approved" | "rejected">().notNull().default("pending"),
  createdAt: createdAt(),
});

export const reports = pgTable("reports", {
  id: id(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  kind: text("kind").notNull().default("growth"),
  content: text("content").notNull(),
  createdAt: createdAt(),
});

export type Tenant = typeof tenants.$inferSelect;
export type Channel = typeof channels.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Product = typeof products.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type PaymentMethod = typeof paymentMethods.$inferSelect;
