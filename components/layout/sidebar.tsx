import Link from "next/link";
import type React from "react";
import { BarChart3, Building2, ClipboardList, FileSpreadsheet, LayoutDashboard, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Profile, UserRole } from "@/types/domain";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "management", "tech_manager", "worker", "store_manager"] },
  { href: "/tickets", label: "Заявки", icon: ClipboardList, roles: ["admin", "management", "tech_manager", "worker", "store_manager"] },
  { href: "/objects", label: "Об'єкти", icon: Building2, roles: ["admin", "management", "tech_manager"] },
  { href: "/users", label: "Користувачі", icon: Users, roles: ["admin", "management"] },
  { href: "/reports", label: "Excel-звіти", icon: FileSpreadsheet, roles: ["admin", "management", "tech_manager"] },
  { href: "/settings", label: "Налаштування", icon: Settings, roles: ["admin"] },
] satisfies Array<{ href: string; label: string; icon: React.ElementType; roles: UserRole[] }>;

export function Sidebar({ profile }: { profile: Profile }) {
  const visibleNav = nav.filter((item) => item.roles.includes(profile.role));

  return (
    <aside className="hidden min-h-screen w-72 border-r border-border bg-stone-950/80 px-4 py-5 lg:block">
      <Link href="/dashboard" className="mb-8 flex items-center gap-3 px-2">
        <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-lg font-black text-primary-foreground">P</div>
        <div>
          <div className="font-semibold text-stone-100">Polissya</div>
          <div className="text-xs uppercase tracking-[0.18em] text-orange-300">Service Desk</div>
        </div>
      </Link>
      <nav className="space-y-1">
        {visibleNav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn("flex items-center gap-3 rounded-md px-3 py-2.5 text-sm text-stone-300 hover:bg-stone-900 hover:text-orange-200")}
          >
            <item.icon className="h-4 w-4" />
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="mt-8 rounded-lg border border-orange-900/50 bg-orange-950/20 p-4">
        <BarChart3 className="mb-3 h-5 w-5 text-orange-300" />
        <p className="text-sm font-medium">Рольовий доступ</p>
        <p className="mt-1 text-xs text-muted-foreground">Меню та дані фільтруються відповідно до профілю користувача.</p>
      </div>
    </aside>
  );
}
