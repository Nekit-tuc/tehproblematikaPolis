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
    <DirectorGlassCard className="relative overflow-hidden p-3.5">
      <div className="absolute inset-x-8 -bottom-12 h-24 rounded-full bg-orange-500/20 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-amber-300/20 bg-amber-400/15 text-amber-300 shadow-[0_0_28px_rgba(245,158,11,0.22)]">
          <Crown className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[20px] font-black leading-6 tracking-tight text-zinc-50">
            Вітаю, {firstName(profile.full_name)}
          </h2>
          <p className="mt-0.5 text-sm leading-5 text-zinc-300">
            {objects.length} {shopWord(objects.length)}
          </p>
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            {objects.slice(0, 4).map((object) => (
              <span
                key={object.id}
                className="inline-flex max-w-[178px] shrink-0 items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[12px] leading-4 text-zinc-200"
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                <span className="truncate">{object.address || object.name}</span>
              </span>
            ))}
            {objects.length > 4 ? (
              <span className="rounded-2xl border border-white/10 bg-white/[0.06] px-2.5 py-1.5 text-[12px] leading-4 text-zinc-300">
                +{objects.length - 4}
              </span>
            ) : null}
          </div>
        </div>
      </div>
      <Link
        href="/director/tickets/new"
        className="relative mt-3 flex h-12 items-center justify-center gap-2.5 rounded-2xl bg-gradient-to-r from-amber-300 to-orange-500 text-[15px] font-black text-black shadow-[0_12px_28px_rgba(249,115,22,0.24)] transition active:scale-[0.99]"
      >
        <Plus className="h-5 w-5" />
        Створити заявку
      </Link>
    </DirectorGlassCard>
  );
}
