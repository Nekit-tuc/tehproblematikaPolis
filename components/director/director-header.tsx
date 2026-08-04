import { Bell, Sprout } from "lucide-react";
import type { Profile } from "@/types/domain";

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "Д";
}

export function DirectorHeader({ profile, activeCount = 0 }: { profile: Profile; activeCount?: number }) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-300 ring-1 ring-amber-300/25">
          <Sprout className="h-6 w-6" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-amber-300">Полісся</p>
          <h1 className="truncate text-xl font-black leading-tight text-zinc-50">Кабінет директора</h1>
          <p className="truncate text-xs text-zinc-400">Контроль заявок магазину</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-zinc-900/70 text-zinc-200">
          <Bell className="h-5 w-5" />
          {activeCount > 0 ? (
            <span className="absolute -right-1 -top-1 rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-black leading-none text-black">
              {Math.min(activeCount, 99)}
            </span>
          ) : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-700 to-zinc-950 text-sm font-black text-zinc-100">
          {initials(profile.full_name)}
        </div>
      </div>
    </header>
  );
}
