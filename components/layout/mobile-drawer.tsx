"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { Bot, BriefcaseBusiness, Building2, CalendarDays, ClipboardList, FileSpreadsheet, Home, LogOut, Settings, Users, X } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Profile, UserRole } from "@/types/domain";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: Home, roles: ["admin", "management", "tech_manager", "worker", "store_manager"] },
  { href: "/tickets", label: "Заявки", icon: ClipboardList, roles: ["admin", "management", "tech_manager", "worker", "store_manager"] },
  { href: "/ai-tickets", label: "AI-заявки", icon: Bot, roles: ["admin", "management", "tech_manager"] },
  { href: "/objects", label: "Об'єкти", icon: Building2, roles: ["admin", "management", "tech_manager"] },
  { href: "/workers", label: "Виконавці", icon: BriefcaseBusiness, roles: ["admin", "management", "tech_manager"] },
  { href: "/work-planning", label: "Планування", icon: CalendarDays, roles: ["admin", "management", "tech_manager"] },
  { href: "/users", label: "Користувачі", icon: Users, roles: ["admin", "management"] },
  { href: "/reports", label: "Excel-звіти", icon: FileSpreadsheet, roles: ["admin", "management", "tech_manager"] },
  { href: "/ai-test", label: "AI-тест", icon: Bot, roles: ["admin", "management", "tech_manager"] },
  { href: "/settings", label: "Налаштування", icon: Settings, roles: ["admin"] },
] satisfies Array<{ href: string; label: string; icon: React.ElementType; roles: UserRole[] }>;

export function MobileDrawer({
  profile,
  open,
  onClose,
  aiTicketsCount = 0,
}: {
  profile: Profile;
  open: boolean;
  onClose: () => void;
  aiTicketsCount?: number;
}) {
  const pathname = usePathname();
  const visibleNav = nav.filter((item) => item.roles.includes(profile.role));

  return (
    <div className={`fixed inset-0 z-50 md:hidden ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity ${open ? "opacity-100" : "opacity-0"}`} onClick={onClose} />
      <aside className={`absolute inset-y-0 left-0 w-[86vw] max-w-sm border-r border-white/10 bg-[#0b0c0f] p-4 shadow-2xl transition-transform duration-200 ${open ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-5 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-lg font-black text-stone-950">P</div>
            <div className="min-w-0">
              <div className="truncate font-semibold text-stone-100">Polissya</div>
              <div className="truncate text-xs uppercase tracking-[0.18em] text-orange-300">Service Desk</div>
            </div>
          </div>
          <Button variant="outline" size="icon" onClick={onClose} className="h-10 w-10 shrink-0 rounded-2xl border-white/10 bg-white/[0.03]" aria-label="Закрити меню">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="mb-5 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
          <div className="break-words text-sm font-semibold text-stone-100">{profile.full_name}</div>
          <div className="mt-1 text-xs text-muted-foreground">{roleLabels[profile.role]}</div>
        </div>

        <nav className="space-y-1">
          {visibleNav.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className={cn(
                  "flex min-h-12 max-w-full items-center gap-3 rounded-2xl px-3 text-sm text-stone-200 active:bg-white/5",
                  isActive && "border border-orange-500/30 bg-orange-500/10 text-orange-100",
                )}
              >
                <item.icon className={cn("h-5 w-5 shrink-0 text-orange-300", isActive && "text-orange-200")} />
                <span className="min-w-0 flex-1 break-words">{item.label}</span>
                {item.href === "/ai-tickets" && aiTicketsCount > 0 ? <span className="shrink-0 rounded-full bg-orange-500 px-2 py-0.5 text-xs font-bold text-stone-950">{aiTicketsCount}</span> : null}
              </Link>
            );
          })}
        </nav>

        <form action={logoutAction} className="absolute inset-x-4 bottom-5">
          <Button variant="outline" className="h-12 w-full rounded-2xl border-white/10 bg-white/[0.03]">
            <LogOut className="h-4 w-4" />
            Вийти
          </Button>
        </form>
      </aside>
    </div>
  );
}
