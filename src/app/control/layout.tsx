import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth";
import { logoutAction } from "@/app/auth-actions";

export default async function ControlLayout({ children }: LayoutProps<"/control">) {
  const s = await requireSuperAdmin();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-panel/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
          <Link href="/control" className="flex items-center gap-2 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-brand text-white">T</span>
            Bot Control Center
          </Link>
          <nav className="flex gap-3 text-sm">
            <Link href="/control" className="hover:text-brand">လုပ်ငန်းများ</Link>
            <Link href="/control/new" className="hover:text-brand">+ အသစ်</Link>
            <Link href="/control/settings" className="hover:text-brand">Platform Setting</Link>
          </nav>
          <form action={logoutAction} className="ml-auto text-sm text-muted">
            <span className="mr-3 hidden sm:inline">{s.name}</span>
            <button className="hover:text-brand">ထွက်မည်</button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 lg:p-8">{children}</main>
    </div>
  );
}
