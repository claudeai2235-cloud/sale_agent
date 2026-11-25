"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { faqs, objections, paymentMethods, platformSettings, products, tenantPayments, tenants, users } from "@/db/schema";
import { hashPassword, requireSuperAdmin } from "@/lib/auth";
import { encrypt, randomCode, randomSecret } from "@/lib/crypto";
import { TelegramApi } from "@/lib/channels/telegram";
import { appUrl } from "@/lib/notify";
import { ensurePlatformRow } from "@/lib/agent/jobs";
import type { ActionResult } from "@/components/action-form";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, d = 0) => {
  const v = Number(String(fd.get(k) ?? "").replace(/[, ]/g, ""));
  return Number.isFinite(v) ? v : d;
};
const bool = (fd: FormData, k: string) => fd.get(k) === "on";

function slugify(s: string) {
  const base = s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${base || "biz"}-${randomCode(4).toLowerCase()}`;
}

const addMonths = (d: Date, m: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + m);
  return x;
};

export async function createTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const name = str(fd, "name");
  if (!name) return { ok: false, message: "လုပ်ငန်းအမည် ထည့်ပါ" };
  const months = num(fd, "months", 1);
  const ownerEmail = str(fd, "ownerEmail").toLowerCase();
  const ownerPassword = str(fd, "ownerPassword");
  if (ownerEmail && ownerPassword.length < 8) return { ok: false, message: "Owner Password အနည်းဆုံး ၈ လုံး" };
  if (ownerEmail) {
    const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, ownerEmail)).limit(1);
    if (dup) return { ok: false, message: "ဒီ Email နဲ့ User ရှိပြီးသားပါ" };
  }

  const templateId = str(fd, "templateId");
  const [tpl] = templateId ? await db.select().from(tenants).where(eq(tenants.id, templateId)).limit(1) : [];
  const tplSettings = tpl ? { ...(tpl.settings as Record<string, unknown>) } : {};
  delete tplSettings._lastSummary;
  if (tplSettings.notifications) tplSettings.notifications = { ...(tplSettings.notifications as object), adminChats: [] };

  const [t] = await db
    .insert(tenants)
    .values({
      name,
      slug: slugify(name),
      adminLinkCode: randomCode(8),
      planName: str(fd, "planName") || "Standard",
      monthlyFee: num(fd, "monthlyFee"),
      expiresAt: months > 0 ? addMonths(new Date(), months) : null,
      profile: tpl && fd.get("copyProfile") === "on" ? { ...tpl.profile, business_name: name } : { business_name: name },
      settings: tplSettings,
    })
    .returning();

  if (tpl && fd.get("copyCatalog") === "on") {
    const [ps, fs, os, pms] = await Promise.all([
      db.select().from(products).where(eq(products.tenantId, tpl.id)),
      db.select().from(faqs).where(eq(faqs.tenantId, tpl.id)),
      db.select().from(objections).where(eq(objections.tenantId, tpl.id)),
      db.select().from(paymentMethods).where(eq(paymentMethods.tenantId, tpl.id)),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const strip = <T extends { id: string; tenantId: string }>({ id, tenantId, ...rest }: T) => ({ ...rest, tenantId: t.id });
    if (ps.length) await db.insert(products).values(ps.map(strip));
    if (fs.length) await db.insert(faqs).values(fs.map(strip));
    if (os.length) await db.insert(objections).values(os.map(strip));
    // Payment accounts belong to the template business — copy only the method names.
    if (pms.length) await db.insert(paymentMethods).values(pms.map((m) => ({ ...strip(m), accountName: "", accountNumber: "", active: false })));
  }
  if (months > 0 && num(fd, "monthlyFee") > 0 && fd.get("paid") === "on") {
    await db.insert(tenantPayments).values({ tenantId: t.id, amount: num(fd, "monthlyFee") * months, months, periodStart: new Date(), periodEnd: t.expiresAt!, note: "Initial" });
  }
  if (ownerEmail) {
    await db.insert(users).values({ email: ownerEmail, name: str(fd, "ownerName"), passwordHash: await hashPassword(ownerPassword), role: "tenant_owner", tenantId: t.id });
  }
  revalidatePath("/control");
  redirect(`/control/${t.id}`);
}

export async function updateTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = str(fd, "tenantId");
  const exp = str(fd, "expiresAt");
  await db
    .update(tenants)
    .set({
      name: str(fd, "name"),
      status: str(fd, "status") === "suspended" ? "suspended" : "active",
      botEnabled: bool(fd, "botEnabled"),
      planName: str(fd, "planName"),
      monthlyFee: num(fd, "monthlyFee"),
      graceDays: num(fd, "graceDays", 3),
      expiresAt: exp ? new Date(`${exp}T23:59:59+06:30`) : null,
      billingNote: str(fd, "billingNote") || null,
      updatedAt: new Date(),
    })
    .where(eq(tenants.id, id));
  revalidatePath(`/control/${id}`);
  revalidatePath("/control");
  return { ok: true, message: "သိမ်းပြီးပါပြီ ✓" };
}

export async function recordPayment(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = str(fd, "tenantId");
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t) return { ok: false, message: "မတွေ့ပါ" };
  const months = Math.max(1, num(fd, "months", 1));
  const start = t.expiresAt && new Date(t.expiresAt) > new Date() ? new Date(t.expiresAt) : new Date();
  const end = addMonths(start, months);
  await db.insert(tenantPayments).values({
    tenantId: id,
    amount: num(fd, "amount", t.monthlyFee * months),
    months,
    method: str(fd, "method") || null,
    note: str(fd, "note") || null,
    periodStart: start,
    periodEnd: end,
  });
  await db.update(tenants).set({ expiresAt: end, status: "active", lastExpiryReminderAt: null }).where(eq(tenants.id, id));
  revalidatePath(`/control/${id}`);
  revalidatePath("/control");
  return { ok: true, message: `သက်တမ်း ${end.toDateString()} အထိ တိုးပြီးပါပြီ ✓` };
}

export async function addTenantUser(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = str(fd, "tenantId");
  const email = str(fd, "email").toLowerCase();
  const password = str(fd, "password");
  if (!email.includes("@") || password.length < 8) return { ok: false, message: "Email မှန်ရမယ်၊ Password ၈ လုံးအထက်" };
  const [dup] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (dup) return { ok: false, message: "ဒီ Email ရှိပြီးသားပါ" };
  await db.insert(users).values({
    email,
    name: str(fd, "name"),
    passwordHash: await hashPassword(password),
    role: str(fd, "role") === "tenant_staff" ? "tenant_staff" : "tenant_owner",
    tenantId: id,
  });
  revalidatePath(`/control/${id}`);
  return { ok: true, message: "Login ဖန်တီးပြီးပါပြီ ✓ — Email/Password ကို လုပ်ငန်းရှင်ထံ လုံခြုံစွာ ပေးပါ" };
}

export async function resetUserPassword(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const password = str(fd, "password");
  if (password.length < 8) return { ok: false, message: "Password ၈ လုံးအထက်" };
  await db.update(users).set({ passwordHash: await hashPassword(password) }).where(and(eq(users.id, str(fd, "userId")), eq(users.tenantId, str(fd, "tenantId"))));
  return { ok: true, message: "Password ပြောင်းပြီးပါပြီ ✓" };
}

export async function deleteTenantUser(fd: FormData) {
  await requireSuperAdmin();
  await db.delete(users).where(and(eq(users.id, str(fd, "userId")), eq(users.tenantId, str(fd, "tenantId"))));
  revalidatePath(`/control/${str(fd, "tenantId")}`);
}

export async function deleteTenant(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  const id = str(fd, "tenantId");
  const [t] = await db.select().from(tenants).where(eq(tenants.id, id)).limit(1);
  if (!t || str(fd, "confirm") !== t.name) return { ok: false, message: "အတည်ပြုရန် လုပ်ငန်းအမည်ကို အတိအကျ ရိုက်ပါ" };
  await db.delete(tenants).where(eq(tenants.id, id));
  revalidatePath("/control");
  redirect("/control");
}

/* ───────── Platform ───────── */

export async function savePlatform(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  await ensurePlatformRow();
  await db
    .update(platformSettings)
    .set({
      defaultChatModel: str(fd, "defaultChatModel") || "gemini-flash-latest",
      defaultLiteModel: str(fd, "defaultLiteModel") || "gemini-flash-lite-latest",
      globalPause: bool(fd, "globalPause"),
      updatedAt: new Date(),
    })
    .where(eq(platformSettings.id, 1));
  revalidatePath("/control/settings");
  return { ok: true, message: "သိမ်းပြီးပါပြီ ✓" };
}

export async function connectNotifyBot(_: ActionResult, fd: FormData): Promise<ActionResult> {
  await requireSuperAdmin();
  await ensurePlatformRow();
  const token = str(fd, "token");
  if (!appUrl()) return { ok: false, message: "APP_URL မသတ်မှတ်ရသေးပါ" };
  const api = new TelegramApi(token);
  try {
    const me = await api.getMe();
    const secret = randomSecret();
    await api.setWebhook(`${appUrl()}/api/webhooks/telegram/platform`, secret);
    await db.update(platformSettings).set({ notifyBotToken: encrypt(token), notifyBotUsername: me.username, notifyBotSecret: secret }).where(eq(platformSettings.id, 1));
    revalidatePath("/control/settings");
    return { ok: true, message: `✅ @${me.username} ချိတ်ပြီးပါပြီ` };
  } catch (e) {
    return { ok: false, message: (e as Error).message };
  }
}

export async function regenerateSuperCode() {
  await requireSuperAdmin();
  await ensurePlatformRow();
  await db.update(platformSettings).set({ superAdminLinkCode: randomCode(8) }).where(eq(platformSettings.id, 1));
  revalidatePath("/control/settings");
}

export async function removeSuperChat(fd: FormData) {
  await requireSuperAdmin();
  const [p] = await db.select().from(platformSettings).limit(1);
  await db
    .update(platformSettings)
    .set({ superAdminChatIds: (p?.superAdminChatIds ?? []).filter((c) => c !== str(fd, "chatId")) })
    .where(eq(platformSettings.id, 1));
  revalidatePath("/control/settings");
}
