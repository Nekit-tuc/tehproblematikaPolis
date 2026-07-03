import Link from "next/link";
import { Bot, Building2, ClipboardList, Home, Plus } from "lucide-react";
import type { Profile } from "@/types/domain";

export function MobileBottomNav({ profile, aiTicketsCount = 0 }: { profile: Profile; aiTicketsCount?: number }) {
  const canSeeAi = ["admin", "management", "tech_manager"].includes(profile.role);
  const canSeeObjects = ["admin", "management", "tech_manager"].includes(profile.role);

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#090909]/85 px-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-2 shadow-2xl shadow-black/60 backdrop-blur-xl md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5 items-end gap-1">
        <MobileNavItem href="/dashboard" icon={Home} label="Головна" />
        <MobileNavItem href="/tickets" icon={ClipboardList} label="Заявки" />
        <Link
          href="/tickets/new"
          className="-mt-7 flex flex-col items-center gap-1 rounded-full text-xs font-medium text-orange-100"
          aria-label="Створити заявку"
        >
          <span className="flex h-16 w-16 items-center justify-center rounded-full border border-orange-300/40 bg-orange-500 text-stone-950 shadow-lg shadow-orange-950/50">
            <Plus className="h-8 w-8" />
          </span>
        </Link>
        <MobileNavItem href={canSeeAi ? "/ai-tickets" : "/tickets"} icon={Bot} label="AI" count={canSeeAi ? aiTicketsCount : 0} />
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
  return (
    <Link href={href} className="relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] font-medium text-stone-400 active:bg-white/5">
      <Icon className="h-5 w-5 text-orange-300" />
      <span className="truncate">{label}</span>
      {count ? (
        <span className="absolute right-2 top-1 rounded-full bg-orange-500 px-1.5 text-[10px] font-bold text-stone-950">
          {count}
        </span>
      ) : null}
    </Link>
  );
}
