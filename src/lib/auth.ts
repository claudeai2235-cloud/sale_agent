import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users, tenants } from "@/db/schema";

const COOKIE = "thiri_session";
export type Session = { uid: string; role: "super_admin" | "tenant_owner" | "tenant_staff"; tid: string | null; name: string };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET must be set (32+ random characters)");
  return new TextEncoder().encode(s);
}

export async function createSession(s: Session) {
  const token = await new SignJWT(s).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("14d").sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

export async function requireSuperAdmin() {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "super_admin") redirect(s.tid ? `/t/${s.tid}` : "/login");
  return s;
}

/** Super admin may open any business; business users only their own. */
export async function requireTenant(tenantId: string) {
  const s = await getSession();
  if (!s) redirect("/login");
  if (s.role !== "super_admin" && s.tid !== tenantId) redirect(s.tid ? `/t/${s.tid}` : "/login");
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  if (!tenant) redirect(s.role === "super_admin" ? "/control" : "/login");
  return { session: s, tenant };
}

export async function verifyLogin(email: string, password: string) {
  const [u] = await db.select().from(users).where(eq(users.email, email.trim().toLowerCase())).limit(1);
  if (!u) return null;
  return (await bcrypt.compare(password, u.passwordHash)) ? u : null;
}

export const hashPassword = (p: string) => bcrypt.hash(p, 10);
