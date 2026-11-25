"use client";

import { useActionState, useEffect, useRef, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionResult = { ok: boolean; message?: string } | null;
type Action = (prev: ActionResult, fd: FormData) => Promise<ActionResult>;

/** Form wrapper around a server action that shows a success/error message. */
export function ActionForm({
  action,
  children,
  className = "space-y-4",
  resetOnSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className}>
      {children}
      {state?.message && (
        <p className={`rounded-lg px-3 py-2 text-sm ${state.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>{state.message}</p>
      )}
    </form>
  );
}

export function SubmitButton({ children = "သိမ်းမည်", variant = "primary", confirm }: { children?: ReactNode; variant?: "primary" | "ghost" | "danger"; confirm?: string }) {
  const { pending } = useFormStatus();
  const cls =
    variant === "primary"
      ? "bg-brand text-brand-ink hover:opacity-90"
      : variant === "danger"
        ? "bg-red-600 text-white hover:bg-red-700"
        : "border border-line bg-white hover:bg-gray-50";
  return (
    <button
      type="submit"
      disabled={pending}
      onClick={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
      className={`inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 text-sm font-medium transition disabled:opacity-60 ${cls}`}
    >
      {pending ? "ခဏစောင့်ပါ…" : children}
    </button>
  );
}
