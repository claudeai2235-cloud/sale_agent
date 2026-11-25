import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { setupAction } from "../auth-actions";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.role, "super_admin")).limit(1);
  if (existing.length) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-line bg-panel p-6 shadow-sm">
        <h1 className="text-lg font-semibold">ပထမဆုံး Setup — Super Admin ဖန်တီးရန်</h1>
        <p className="mb-5 mt-1 text-sm text-muted">ဒီ Account က Bot Control Center တစ်ခုလုံးကို ထိန်းချုပ်မယ့် သင့်ရဲ့ Account ပါ။</p>
        <ActionForm action={setupAction}>
          <Field label="SETUP_SECRET" hint="Vercel Environment Variables ထဲမှာ ထည့်ထားတဲ့ SETUP_SECRET">
            <Input name="secret" type="password" required />
          </Field>
          <Field label="နာမည်">
            <Input name="name" defaultValue="Admin" />
          </Field>
          <Field label="Email">
            <Input name="email" type="email" required />
          </Field>
          <Field label="Password (အနည်းဆုံး ၈ လုံး)">
            <Input name="password" type="password" minLength={8} required />
          </Field>
          <SubmitButton>Super Admin ဖန်တီးမည်</SubmitButton>
        </ActionForm>
      </div>
    </main>
  );
}
