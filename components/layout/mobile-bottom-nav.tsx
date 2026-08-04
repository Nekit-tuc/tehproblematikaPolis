"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, CalendarDays, ClipboardList, Home, Plus } from "lucide-react";
import type { Profile } from "@/types/domain";
import { cn } from "@/lib/utils";

export function MobileBottomNav({ profile, aiTicketsCount = 0 }: { profile: Profile; aiTicketsCount?: number }) {
  const canSeeObjects = ["admin", "management", "tech_manager"].includes(profile.role);
  void aiTicketsCount;

  if (profile.role === "store_director") {
    return (
      <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden">
        <div className="mx-auto grid h-[58px] max-w-md grid-cols-3 items-center rounded-t-[20px] border border-white/10 bg-[#090909]/90 px-1.5 shadow-[0_-14px_34px_rgba(0,0,0,0.68)] backdrop-blur-2xl">
          <MobileNavItem href="/director/tickets" icon={ClipboardList} label="Заявки" />
          <Link href="/director/tickets/new" className="-mt-6 flex flex-col items-center justify-center rounded-full text-[9px] font-medium text-orange-100" aria-label="Створити заявку">
            <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-orange-300/40 bg-gradient-to-br from-orange-400 to-orange-600 text-black shadow-[0_10px_26px_rgba(249,115,22,0.38)]">
              <Plus className="h-6 w-6 stroke-[2.4]" />
            </span>
          </Link>
          <MobileNavItem href="/director" icon={Home} label="Кабінет" />
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] md:hidden">
      <div className="mx-auto grid h-[58px] max-w-md grid-cols-5 items-center rounded-t-[20px] border border-white/10 bg-[#090909]/90 px-1.5 shadow-[0_-14px_34px_rgba(0,0,0,0.68)] backdrop-blur-2xl">
        <MobileNavItem href="/dashboard" icon={Home} label="Головна" />
        <MobileNavItem href="/tickets" icon={ClipboardList} label="Заявки" />
        <Link
          href="/tickets/new"
          className="-mt-6 flex flex-col items-center justify-center rounded-full text-[9px] font-medium text-orange-100"
          aria-label="Створити заявку"
        >
          <span className="flex h-[54px] w-[54px] items-center justify-center rounded-full border border-orange-300/40 bg-gradient-to-br from-orange-400 to-orange-600 text-black shadow-[0_10px_26px_rgba(249,115,22,0.38)]">
            <Plus className="h-6 w-6 stroke-[2.4]" />
          </span>
        </Link>
        <MobileNavItem href="/work-planning" icon={CalendarDays} label="Плани" />
        <MobileNavItem href={canSeeObjects ? "/objects" : "/dashboard"} icon={Building2} label="Об'єкти" />
      </div>
    </nav>
  );
}

function MobileNavItem({
  href,
  icon: Icon,
  label,
  count,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  count?: number;
}) {
  const pathname = usePathname();
  const isActive = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));

  return (
    <Link
      href={href}
      className={cn(
        "relative flex min-h-[48px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl px-0.5 text-[9px] font-medium text-zinc-500 transition active:bg-white/5",
        isActive && "text-orange-400",
      )}
    >
      <Icon className={cn("h-[19px] w-[19px]", isActive ? "text-orange-400" : "text-zinc-400")} />
      <span className="max-w-full truncate">{label}</span>
      {count ? (
        <span className="absolute right-1.5 top-0.5 rounded-full bg-orange-500 px-1 py-0.5 text-[9px] font-bold leading-none text-black shadow-[0_0_16px_rgba(249,115,22,0.7)]">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
