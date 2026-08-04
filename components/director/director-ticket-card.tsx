import Link from "next/link";
import { ChevronRight, DoorOpen, Droplets, Hammer, MapPin, Wrench, Zap } from "lucide-react";
import { DirectorStatusBadge } from "@/components/director/director-status-badge";
import type { DirectorDisplayTone } from "@/lib/director/director-ticket-status";
import type { DirectorTicketReportRow } from "@/lib/supabase/director-ticket-reports";
import { formatDate } from "@/lib/utils";

function categoryIcon(name?: string | null) {
  const value = (name ?? "").toLowerCase();
  if (value.includes("сант") || value.includes("канал")) return Droplets;
  if (value.includes("елект")) return Zap;
  if (value.includes("вік") || value.includes("двер")) return DoorOpen;
  if (value.includes("буд") || value.includes("ремонт") || value.includes("звар")) return Hammer;
  return Wrench;
}

export function getShortCategoryName(name?: string | null) {
  if (!name) return "Без категорії";

  const value = name.toLowerCase();
  if (value.includes("буд") && (value.includes("звар") || value.includes("ремонт"))) return "Буд-роботи / ремонт";
  if (value.includes("вік") && value.includes("двер")) return "Вікна/двері";
  if (value.length > 28) return `${name.slice(0, 26).trim()}...`;
  return name;
}

function getShortStatusLabel(label: string) {
  const map: Record<string, string> = {
    "Очікує перевірки": "На перевірці",
    "Підтверджена адміністратором": "Підтверджена",
    "Додана в план виконання": "У плані",
    "Передана виконавцю": "Передана",
    "Очікує підтвердження виконання": "На підтвердженні",
    "В роботі": "У роботі",
  };

  return map[label] ?? label;
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
  const location = ticket.object?.address ?? ticket.object?.name ?? "Магазин";

  return (
    <Link
      href={`/director/tickets/${ticket.id}`}
      className="block rounded-[20px] border border-white/[0.08] bg-white/[0.045] p-3 transition active:scale-[0.99]"
    >
      <div className="flex gap-2.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-orange-500/18 to-zinc-800 text-orange-300">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-black leading-5 text-zinc-50">{ticket.number}</p>
              <p className="mt-0.5 flex min-w-0 items-center gap-1 text-[12px] leading-4 text-zinc-400">
                <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
                <span className="truncate">{location}</span>
              </p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-500" />
          </div>

          <p className="mt-1.5 line-clamp-2 text-[13px] leading-5 text-zinc-200">{ticket.description || ticket.title}</p>

          <div className="mt-2 flex min-w-0 items-center gap-1.5">
            <span className="max-w-[142px] truncate rounded-lg bg-white/[0.07] px-2 py-0.5 text-[11px] font-medium leading-4 text-zinc-300">
              {getShortCategoryName(ticket.category?.name)}
            </span>
            <DirectorStatusBadge
              label={getShortStatusLabel(ticket.displayStatus)}
              tone={statusTone(ticket)}
              className="max-w-[150px] shrink"
            />
          </div>

          <div className="mt-2 flex items-end justify-between gap-2 text-[11px] leading-4 text-zinc-500">
            <div className="min-w-0 flex-1">
              {ticket.worker ? <div className="truncate">Виконавець: {ticket.worker.name}</div> : null}
              <div className="truncate">
                {ticket.completed_at ? `Виконано: ${formatDate(ticket.completed_at)}` : `Додано: ${formatDate(ticket.created_at)}`}
              </div>
            </div>
            <span className="shrink-0 rounded-lg border border-orange-400/30 px-2.5 py-1 text-[11px] font-bold leading-4 text-orange-300">
              {actionLabel}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
