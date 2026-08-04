import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DirectorPageShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className="min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_50%_-8%,rgba(245,158,11,0.2),transparent_30%),linear-gradient(180deg,#020617_0%,#050505_38%,#111827_100%)] text-zinc-50">
      <div
        className={cn(
          "mx-auto w-full max-w-[480px] space-y-2.5 px-3 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pt-3",
          "md:max-w-5xl md:px-6 md:pb-10 md:pt-6",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

export function DirectorGlassCard({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={cn(
        "rounded-[22px] border border-white/[0.08] bg-zinc-900/75 shadow-[0_14px_36px_rgba(0,0,0,0.36)] backdrop-blur-xl",
        className,
      )}
    >
      {children}
    </section>
  );
}
