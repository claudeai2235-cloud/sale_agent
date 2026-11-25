"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function SideNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto lg:flex-col">
      {items.map((it) => {
        const active = it.href === path || (it.href.split("/").length > 3 && path.startsWith(it.href));
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${active ? "bg-brand-soft font-medium text-brand" : "text-gray-700 hover:bg-gray-100"}`}
          >
            <span aria-hidden>{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {!!it.badge && <span className="rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">{it.badge}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
