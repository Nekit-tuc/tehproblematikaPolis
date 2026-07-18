import type React from "react";
import { cn } from "@/lib/utils";

export function ReportKpiCard({ title, value, subtitle, icon: Icon, tone = "text-orange-300" }: { title: string; value: string | number; subtitle: string; icon: React.ElementType; tone?: string }) {
  return (
    <article className="min-w-0 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] font-medium leading-tight text-stone-300">{title}</p>
        <Icon className={cn("h-4 w-4 shrink-0", tone)} />
      </div>
      <p className="text-[24px] font-semibold leading-none text-stone-50 md:text-[28px]">{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-stone-500">{subtitle}</p>
    </article>
  );
}