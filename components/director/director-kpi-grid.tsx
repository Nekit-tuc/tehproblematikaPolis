import type { ReactNode } from "react";

export function DirectorSectionTitle({ icon, title, action }: { icon: ReactNode; title: string; action?: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-orange-300">{icon}</span>
        <h2 className="min-w-0 truncate text-[17px] font-black leading-5 tracking-tight text-zinc-50">{title}</h2>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
