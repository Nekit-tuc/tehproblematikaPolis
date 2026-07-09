import Link from "next/link";
import { cn } from "@/lib/utils";

export function MobileTicketSwitch({ active }: { active: "tickets" | "ai" }) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-white/[0.04] p-1 md:hidden">
      <Link
        href="/tickets"
        className={cn(
          "min-h-10 rounded-xl px-3 py-2 text-center text-sm font-semibold text-stone-300",
          active === "tickets" && "bg-orange-500 text-stone-950",
        )}
      >
        Основні заявки
      </Link>
      <Link
        href="/ai-tickets"
        className={cn(
          "min-h-10 rounded-xl px-3 py-2 text-center text-sm font-semibold text-stone-300",
          active === "ai" && "bg-orange-500 text-stone-950",
        )}
      >
        AI-заявки
      </Link>
    </div>
  );
}
