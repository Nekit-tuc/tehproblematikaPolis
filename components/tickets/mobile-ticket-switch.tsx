import Link from "next/link";
import { cn } from "@/lib/utils";

export function MobileTicketSwitch({
  active,
  aiCount,
}: {
  active: "tickets" | "ai";
  aiCount?: number;
}) {
  return (
    <div className="grid grid-cols-2 gap-0.5 rounded-[14px] border border-white/10 bg-white/[0.035] p-0.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] md:hidden">
      <Link
        href="/tickets"
        className={cn(
          "flex min-h-10 items-center justify-center rounded-xl px-2 text-center text-[11px] font-semibold text-zinc-400 transition",
          active === "tickets" &&
            "bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-[0_10px_26px_rgba(249,115,22,0.32)]",
        )}
      >
        Основні заявки
      </Link>
      <Link
        href="/ai-tickets"
        className={cn(
          "flex min-h-10 items-center justify-center gap-1 rounded-xl px-2 text-center text-[11px] font-semibold text-zinc-400 transition",
          active === "ai" &&
            "bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-[0_10px_26px_rgba(249,115,22,0.32)]",
        )}
      >
        <span>AI-заявки</span>
        {typeof aiCount === "number" && aiCount > 0 ? (
          <span
            className={cn(
              "min-w-4 rounded-full px-1 py-0.5 text-[9px] font-bold leading-none",
              active === "ai" ? "bg-white/20 text-white" : "bg-white/12 text-zinc-200",
            )}
          >
            {aiCount}
          </span>
        ) : null}
      </Link>
    </div>
  );
}
