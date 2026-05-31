"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, ListChecks, FolderKanban, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Přehled", icon: LayoutDashboard },
  { href: "/cases", label: "Test cases", icon: ListChecks },
  { href: "/plans", label: "Plány", icon: FolderKanban },
  { href: "/runs", label: "Běhy", icon: PlayCircle },
];

export function Nav() {
  const pathname = usePathname();
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] p-4">
      <Link href="/" className="mb-8 flex items-center gap-2 px-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-sm font-bold text-white">
          W
        </span>
        <div className="leading-tight">
          <div className="text-sm font-semibold">Theridion</div>
          <div className="text-xs text-[var(--accent)]">Weave</div>
        </div>
      </Link>
      <nav className="flex flex-col gap-1">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-[var(--accent-soft)] text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]",
              )}
            >
              <Icon size={16} />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto px-2 pt-6 text-xs text-[var(--muted)]">
        Test management nad manuálními testy + Eyes &amp; Net.
      </div>
    </aside>
  );
}
