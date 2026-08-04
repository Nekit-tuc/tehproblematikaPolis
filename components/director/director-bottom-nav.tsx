"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ElementType } from "react";
import { ClipboardList, FileCheck2, Home, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const items = [
  { href: "/director", label: "Головна", icon: Home },
  { href: "/director/tickets", label: "Заявки", icon: ClipboardList },
  { href: "/director/acts", label: "Акти", icon: FileCheck2 },
  { href: "/director/profile", label: "Профіль", icon: UserRound },
];

export function DirectorBottomNav({ activeCount = 0 }: { activeCount?: number }) {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || (href !== "/director" && pathname.startsWith(href));

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden">
      <div className="mx-auto grid h-[60px] max-w-[480px] grid-cols-5 items-center rounded-t-[24px] border border-white/10 bg-zinc-950/90 px-2 shadow-[0_-14px_38px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
        <NavItem href={items[0].href} label={items[0].label} icon={items[0].icon} active={active(items[0].href)} />
        <NavItem href={items[1].href} label={items[1].label} icon={items[1].icon} active={active(items[1].href)} count={activeCount} />
        <Link href="/director/tickets/new" className="-mt-6 flex flex-col items-center justify-center rounded-full text-[9px] font-medium text-orange-100" aria-label="Створити заявку">
          <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-amber-200/40 bg-gradient-to-br from-amber-300 to-orange-500 text-black shadow-[0_10px_26px_rgba(249,115,22,0.38)]">
            <Plus className="h-6 w-6 stroke-[2.5]" />
          </span>
        </Link>
        <NavItem href={items[2].href} label={items[2].label} icon={items[2].icon} active={active(items[2].href)} />
        <NavItem href={items[3].href} label={items[3].label} icon={items[3].icon} active={active(items[3].href)} />
      </div>
    </nav>
  );
}

function NavItem({
  href,
  label,
  icon: Icon,
  active,
  count,
}: {
  href: string;
  label: string;
  icon: ElementType;
  active: boolean;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[10px] font-semibold text-zinc-500 transition active:bg-white/5",
        active && "text-orange-400",
      )}
    >
      <Icon className={cn("h-5 w-5", active ? "text-orange-400" : "text-zinc-400")} />
      <span className="max-w-full truncate">{label}</span>
      {count ? (
        <span className="absolute right-1 top-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-black leading-none text-black">
          {Math.min(count, 99)}
        </span>
      ) : null}
    </Link>
  );
}
