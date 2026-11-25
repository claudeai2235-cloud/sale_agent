"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { platformSettings, users } from "@/db/schema";
import { createSession, destroySession, hashPassword, verifyLogin } from "@/lib/auth";
import { randomCode } from "@/lib/crypto";
import type { ActionResult } from "@/components/action-form";

export async function loginAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const u = await verifyLogin(String(fd.get("email") ?? ""), String(fd.get("password") ?? ""));
  if (!u) return { ok: false, message: "Email သို့မဟုတ် Password မှားနေပါတယ်" };
  await createSession({ uid: u.id, role: u.role, tid: u.tenantId, name: u.name });
  redirect(u.role === "super_admin" ? "/control" : `/t/${u.tenantId}`);
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}

export async function setupAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  if (existing.length) return { ok: false, message: "Super Admin ရှိပြီးသားပါ" };
  if (!process.env.SETUP_SECRET || fd.get("secret") !== process.env.SETUP_SECRET) return { ok: false, message: "SETUP_SECRET မှားနေပါတယ်" };
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!email.includes("@") || password.length < 8) return { ok: false, message: "Email မှန်ကန်ရမယ်၊ Password အနည်းဆုံး ၈ လုံး" };
  const [u] = await db
    .insert(users)
    .values({ email, name: String(fd.get("name") ?? "Admin"), passwordHash: await hashPassword(password), role: "super_admin" })
    .returning();
  await db.insert(platformSettings).values({ id: 1, superAdminLinkCode: randomCode(8) }).onConflictDoNothing();
  await createSession({ uid: u.id, role: u.role, tid: null, name: u.name });
  redirect("/control");
}
