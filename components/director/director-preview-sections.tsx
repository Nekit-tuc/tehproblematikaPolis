import Link from "next/link";
import type { ReactNode } from "react";
import { Download, FileCheck2, MapPin } from "lucide-react";
import { DirectorGlassCard } from "@/components/director/director-shell";
import { DirectorSectionTitle } from "@/components/director/director-kpi-grid";
import { DirectorTicketCard } from "@/components/director/director-ticket-card";
import type { DirectorTicketReportRow } from "@/lib/supabase/director-ticket-reports";
import type { WorkCompletionActWithRelations } from "@/types/domain";
import { formatDate } from "@/lib/utils";

export function DirectorTicketsPreview({ tickets }: { tickets: DirectorTicketReportRow[] }) {
  return (
    <DirectorGlassCard className="p-2.5">
      <DirectorSectionTitle
        icon={<FileCheck2 className="h-4 w-4" />}
        title="Мої заявки"
        action={
          <Link href="/director/tickets" className="whitespace-nowrap text-[11px] font-semibold leading-4 text-zinc-300">
            Переглянути всі
          </Link>
        }
      />
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
        <PreviewChip href="/director/tickets" active>
          Усі
        </PreviewChip>
        <PreviewChip href="/director/tickets?status=pending_review">Нові</PreviewChip>
        <PreviewChip href="/director/tickets?tab=planned">У плані</PreviewChip>
        <PreviewChip href="/director/tickets?status=done">Виконані</PreviewChip>
      </div>
      <div className="mt-2 space-y-1.5">
        {tickets.length ? tickets.map((ticket) => <DirectorTicketCard key={ticket.id} ticket={ticket} compact />) : <EmptyLine text="Заявок поки немає." />}
      </div>
    </DirectorGlassCard>
  );
}

export function DirectorActsPreview({ acts }: { acts: WorkCompletionActWithRelations[] }) {
  return (
    <DirectorGlassCard className="p-2.5">
      <DirectorSectionTitle
        icon={<FileCheck2 className="h-4 w-4" />}
        title="Акти робіт"
        action={
          <Link href="/director/acts" className="whitespace-nowrap text-[11px] font-semibold leading-4 text-zinc-300">
            Переглянути всі
          </Link>
        }
      />
      <div className="mt-2 space-y-1.5">
        {acts.length ? (
          acts.map((act) => (
            <div key={act.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-black/18 px-2.5 py-2 text-[13px]">
              <div className="min-w-0">
                <div className="truncate font-semibold leading-5 text-zinc-100">{act.act_number}</div>
                <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] leading-4 text-zinc-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{act.object?.address ?? act.object?.name}</span>
                </div>
              </div>
              <Link
                href={`/director/tickets/${act.ticket_id}/act/export`}
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300"
                aria-label="Завантажити акт Excel"
              >
                <Download className="h-4 w-4" />
              </Link>
              <div className="col-span-2 text-[11px] leading-4 text-zinc-500">Підтверджено: {formatDate(act.confirmed_at)}</div>
            </div>
          ))
        ) : (
          <EmptyLine text="Актів поки немає." />
        )}
      </div>
    </DirectorGlassCard>
  );
}

function PreviewChip({ href, active = false, children }: { href: string; active?: boolean; children: ReactNode }) {
  return (
    <Link
      href={href}
      className={
        active
          ? "shrink-0 whitespace-nowrap rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-1 text-[12px] font-bold leading-4 text-orange-300"
          : "shrink-0 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1 text-[12px] leading-4 text-zinc-300"
      }
    >
      {children}
    </Link>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-xl border border-white/[0.08] bg-white/[0.035] p-2.5 text-[13px] leading-5 text-zinc-500">{text}</div>;
}
