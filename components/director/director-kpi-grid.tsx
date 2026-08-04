import type { ReactNode } from "react";
import { CalendarCheck2, CheckCircle2, FileCheck2, FileText } from "lucide-react";

export type DirectorKpis = {
  newTickets: number;
  planned: number;
  done: number;
  acts: number;
};

const items = [
  { key: "newTickets", label: "Нові заявки", note: "на перевірці", icon: FileText, color: "text-orange-300 bg-orange-500/14" },
  { key: "planned", label: "У плані", note: "на цей тиждень", icon: CalendarCheck2, color: "text-amber-300 bg-amber-500/14" },
  { key: "done", label: "Виконано", note: "за період", icon: CheckCircle2, color: "text-emerald-300 bg-emerald-500/14" },
  { key: "acts", label: "Акти", note: "створено", icon: FileCheck2, color: "text-blue-300 bg-blue-500/14" },
] as const;

export function DirectorKpiGrid({ kpis }: { kpis: DirectorKpis }) {
  return (
    <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <div key={item.key} className="rounded-[22px] border border-white/[0.08] bg-zinc-900/70 p-3 shadow-[0_12px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${item.color}`}>
                <Icon className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <div className="text-2xl font-black leading-none text-zinc-50">{kpis[item.key]}</div>
                <div className="mt-1 text-xs font-medium text-zinc-200">{item.label}</div>
                <div className="mt-1 text-[11px] text-zinc-500">{item.note}</div>
              </div>
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function DirectorSectionTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-orange-300">{icon}</span>
        <h2 className="truncate text-lg font-black tracking-tight text-zinc-50">{title}</h2>
      </div>
      {action}
    </div>
  );
}
