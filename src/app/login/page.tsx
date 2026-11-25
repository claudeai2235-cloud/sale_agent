import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input } from "@/components/ui";
import { loginAction } from "../auth-actions";

export default async function LoginPage() {
  const s = await getSession();
  if (s) redirect(s.role === "super_admin" ? "/control" : `/t/${s.tid}`);
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-6 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand text-xl font-bold text-white">T</div>
          <h1 className="text-lg font-semibold">Thiri AI Sales Agent</h1>
          <p className="text-sm text-muted">Dashboard သို့ ဝင်ရောက်ရန်</p>
        </div>
        <ActionForm action={loginAction}>
          <Field label="Email">
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Field label="Password">
            <Input name="password" type="password" required autoComplete="current-password" />
          </Field>
          <div className="pt-1">
            <SubmitButton>ဝင်မည်</SubmitButton>
          </div>
        </ActionForm>
      </div>
    </main>
  );
}
