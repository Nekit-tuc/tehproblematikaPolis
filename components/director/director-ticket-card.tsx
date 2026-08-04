import Link from "next/link";
import { ChevronRight, DoorOpen, Droplets, FileCheck2, Hammer, MapPin, Wrench, Zap } from "lucide-react";
import { DirectorStatusBadge } from "@/components/director/director-status-badge";
import type { DirectorDisplayTone } from "@/lib/director/director-ticket-status";
import type { DirectorTicketReportRow } from "@/lib/supabase/director-ticket-reports";
import { formatDate } from "@/lib/utils";

function categoryIcon(name?: string | null) {
  const value = (name ?? "").toLowerCase();
  if (value.includes("сант") || value.includes("канал")) return Droplets;
  if (value.includes("елект")) return Zap;
  if (value.includes("вік") || value.includes("двер")) return DoorOpen;
  if (value.includes("буд") || value.includes("ремонт")) return Hammer;
  return Wrench;
}

function statusTone(ticket: DirectorTicketReportRow): DirectorDisplayTone {
  if (ticket.status === "done") return "green";
  if (ticket.status === "rejected" || ticket.status === "cancelled") return "red";
  if (ticket.status === "waiting_admin_confirmation") return "amber";
  if (ticket.status === "in_progress") return "blue";
  if (ticket.isInPlan) return "amber";
  return "orange";
}

export function DirectorTicketCard({ ticket, compact = false }: { ticket: DirectorTicketReportRow; compact?: boolean }) {
  const Icon = categoryIcon(ticket.category?.name);
  const actionLabel = ticket.workCompletionAct ? "Акт" : compact ? "Деталі" : "Відкрити";

  return (
    <Link href={`/director/tickets/${ticket.id}`} className="block rounded-[22px] border border-white/[0.08] bg-white/[0.045] p-3 transition active:scale-[0.99]">
      <div className="flex gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/18 to-zinc-800 text-orange-300">
          <Icon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[13px] font-black text-zinc-50">{ticket.number}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-zinc-400">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{ticket.object?.address ?? ticket.object?.name ?? "Магазин"}</span>
              </p>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
          </div>
          <p className="mt-2 line-clamp-2 text-sm leading-5 text-zinc-200">{ticket.description || ticket.title}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-xl bg-white/[0.07] px-2 py-1 text-[11px] font-medium text-zinc-300">{ticket.category?.name ?? "Без категорії"}</span>
            <DirectorStatusBadge label={ticket.displayStatus} tone={statusTone(ticket)} />
          </div>
          <div className="mt-2 grid gap-1 text-[11px] text-zinc-500">
            {ticket.worker ? <span>Виконавець: {ticket.worker.name}</span> : null}
            <span>{ticket.completed_at ? `Виконано: ${formatDate(ticket.completed_at)}` : `Додано: ${formatDate(ticket.created_at)}`}</span>
          </div>
          <div className="mt-3 flex justify-end">
            <span className="rounded-xl border border-orange-400/30 px-3 py-1.5 text-xs font-bold text-orange-300">{actionLabel}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
