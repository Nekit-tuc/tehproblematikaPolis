import Link from "next/link";
import { Crown, MapPin, Plus } from "lucide-react";
import { DirectorGlassCard } from "@/components/director/director-shell";
import type { CompanyObject, Profile } from "@/types/domain";

function firstName(name: string) {
  return name.split(/\s+/).filter(Boolean)[0] ?? "директоре";
}

function shopWord(count: number) {
  if (count === 1) return "магазин під контролем";
  if (count > 1 && count < 5) return "магазини під контролем";
  return "магазинів під контролем";
}

export function DirectorHeroCard({ profile, objects }: { profile: Profile; objects: CompanyObject[] }) {
  return (
    <DirectorGlassCard className="relative overflow-hidden p-4">
      <div className="absolute inset-x-8 -bottom-12 h-24 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="relative flex items-start gap-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/15 text-amber-300 shadow-[0_0_34px_rgba(245,158,11,0.26)]">
          <Crown className="h-8 w-8" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black tracking-tight text-zinc-50">Вітаю, {firstName(profile.full_name)}</h2>
          <p className="mt-1 text-sm text-zinc-300">{objects.length} {shopWord(objects.length)}</p>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {objects.slice(0, 4).map((object) => (
              <span key={object.id} className="inline-flex shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-zinc-200">
                <MapPin className="h-3.5 w-3.5 text-zinc-400" />
                {object.address || object.name}
              </span>
            ))}
            {objects.length > 4 ? <span className="rounded-2xl border border-white/10 bg-white/[0.06] px-3 py-2 text-xs text-zinc-300">+{objects.length - 4}</span> : null}
          </div>
        </div>
      </div>
      <Link
        href="/director/tickets/new"
        className="relative mt-4 flex h-14 items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-amber-300 to-orange-500 text-base font-black text-black shadow-[0_14px_34px_rgba(249,115,22,0.28)] transition active:scale-[0.99]"
      >
        <Plus className="h-6 w-6" />
        Створити заявку
      </Link>
    </DirectorGlassCard>
  );
}
