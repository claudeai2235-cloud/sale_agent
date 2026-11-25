import Link from "next/link";
import type { ReactNode } from "react";

export function PageHeader({ title, desc, actions }: { title: string; desc?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {desc && <p className="mt-1 max-w-3xl text-sm text-muted">{desc}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, desc, children, className = "", actions }: { title?: string; desc?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={`rounded-xl border border-line bg-panel p-5 shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-semibold">{title}</h2>}
            {desc && <p className="mt-0.5 text-sm text-muted">{desc}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: ReactNode; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className ?? ""}`} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={`input ${props.className ?? ""}`} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`input ${props.className ?? ""}`} />;
}

export function Toggle({ name, label, defaultChecked, hint }: { name: string; label: string; defaultChecked?: boolean; hint?: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-line bg-white p-3 hover:border-brand/40">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="mt-1 h-4 w-4 accent-[var(--brand)]" />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-muted">{hint}</span>}
      </span>
    </label>
  );
}

const tones = {
  gray: "bg-gray-100 text-gray-700",
  green: "bg-emerald-50 text-emerald-700",
  red: "bg-red-50 text-red-700",
  amber: "bg-amber-50 text-amber-700",
  blue: "bg-sky-50 text-sky-700",
  purple: "bg-brand-soft text-brand",
} as const;
export function Badge({ children, tone = "gray" }: { children: ReactNode; tone?: keyof typeof tones }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "red" | "green" }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
      <div className="text-xs text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${tone === "red" ? "text-red-600" : tone === "green" ? "text-emerald-600" : ""}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">{children}</div>;
}

export function LinkButton({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" }) {
  return (
    <Link
      href={href}
      className={
        variant === "primary"
          ? "inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-brand-ink hover:opacity-90"
          : "inline-flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
      }
    >
      {children}
    </Link>
  );
}

export const STAGE_LABEL: Record<string, { label: string; tone: keyof typeof tones }> = {
  new: { label: "အသစ်", tone: "gray" },
  interested: { label: "စိတ်ဝင်စား", tone: "blue" },
  considering: { label: "စဉ်းစားဆဲ", tone: "amber" },
  ready: { label: "ဝယ်ရန်အသင့်", tone: "purple" },
  ordered: { label: "Order တင်ပြီး", tone: "purple" },
  paid: { label: "ငွေချေပြီး", tone: "green" },
  lost: { label: "မဝယ်တော့", tone: "red" },
};

export const ORDER_STATUS: Record<string, { label: string; tone: keyof typeof tones }> = {
  awaiting_payment: { label: "ငွေစောင့်ဆဲ", tone: "amber" },
  payment_submitted: { label: "Screenshot ရပြီ — စစ်ရန်", tone: "blue" },
  confirmed: { label: "အတည်ပြုပြီး", tone: "green" },
  cancelled: { label: "ပယ်ဖျက်", tone: "red" },
};
