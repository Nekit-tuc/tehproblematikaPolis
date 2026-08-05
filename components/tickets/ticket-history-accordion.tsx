"use client";

import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { useState } from "react";
import { formatDate } from "@/lib/utils";
import type { TicketHistory } from "@/types/domain";

type TicketHistoryAccordionProps = {
  history: TicketHistory[];
};

export function TicketHistoryAccordion({ history }: TicketHistoryAccordionProps) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.045]">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <Clock className="h-4 w-4 shrink-0 text-orange-300" />
          <span className="text-sm font-semibold text-zinc-100">Історія</span>
          <span className="text-xs text-zinc-500">{history.length} подій</span>
        </span>
        {open ? <ChevronUp className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronDown className="h-4 w-4 shrink-0 text-zinc-400" />}
      </button>

      {open ? (
        <div className="space-y-3 border-t border-white/10 px-4 py-3">
          {history.length === 0 ? (
            <p className="text-xs text-zinc-500">Історії по заявці ще немає.</p>
          ) : (
            history.map((item) => (
              <div key={item.id} className="relative border-l border-orange-500/25 pl-3">
                <span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-orange-400" />
                <div className="break-words text-xs font-medium text-zinc-200">{item.action}</div>
                <div className="mt-0.5 text-[11px] text-zinc-500">
                  {item.actor?.full_name ?? "Система"} · {formatDate(item.created_at)}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  );
}
