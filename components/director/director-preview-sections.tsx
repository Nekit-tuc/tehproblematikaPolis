import Link from "next/link";
import { BarChart3, CalendarCheck2, Download, FileCheck2, MapPin } from "lucide-react";
import { DirectorGlassCard } from "@/components/director/director-shell";
import { DirectorSectionTitle } from "@/components/director/director-kpi-grid";
import { DirectorTicketCard } from "@/components/director/director-ticket-card";
import type { DirectorTicketReportRow } from "@/lib/supabase/director-ticket-reports";
import type { WorkCompletionActWithRelations } from "@/types/domain";
import { formatDate } from "@/lib/utils";

export type DirectorAnalyticsCategory = {
  id: string;
  name: string;
  count: number;
  percent: number;
};

export function DirectorTicketsPreview({ tickets }: { tickets: DirectorTicketReportRow[] }) {
  return (
    <DirectorGlassCard className="p-3">
      <DirectorSectionTitle
        icon={<FileCheck2 className="h-4 w-4" />}
        title="Мої заявки"
        action={<Link href="/director/tickets" className="text-xs font-semibold text-zinc-300">Всі</Link>}
      />
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
        <Link href="/director/tickets" className="rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300">Усі</Link>
        <Link href="/director/tickets?status=pending_review" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300">Нові</Link>
        <Link href="/director/tickets" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300">У плані</Link>
        <Link href="/director/tickets?status=done" className="rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300">Виконані</Link>
      </div>
      <div className="mt-3 space-y-2.5">
        {tickets.length ? tickets.map((ticket) => <DirectorTicketCard key={ticket.id} ticket={ticket} compact />) : <EmptyLine text="Заявок поки немає." />}
      </div>
    </DirectorGlassCard>
  );
}

export function DirectorPlanPreview({ tickets }: { tickets: DirectorTicketReportRow[] }) {
  const planned = tickets.filter((ticket) => ticket.isInPlan);
  const done = planned.filter((ticket) => ticket.status === "done").length;
  const progress = planned.length ? Math.round((done / planned.length) * 100) : 0;

  return (
    <DirectorGlassCard className="p-4">
      <DirectorSectionTitle icon={<CalendarCheck2 className="h-4 w-4" />} title="План тижня" />
      <div className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-400">
        <span>План виконання: <span className="font-bold text-orange-300">цей тиждень</span></span>
        <span className="text-zinc-200">{done} / {planned.length} виконано</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/[0.08]">
        <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 space-y-2">
        {planned.slice(0, 5).map((ticket) => (
          <Link key={ticket.id} href={`/director/tickets/${ticket.id}`} className="grid grid-cols-[1fr_auto] gap-2 rounded-2xl bg-black/18 px-3 py-2 text-sm">
            <span className="min-w-0">
              <span className="block truncate text-zinc-200">{ticket.description || ticket.title}</span>
              <span className="mt-1 flex min-w-0 items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{ticket.object?.address ?? ticket.object?.name}</span>
              </span>
            </span>
            <span className="self-center rounded-xl bg-orange-500/10 px-2 py-1 text-xs font-semibold text-orange-300">{ticket.status === "done" ? "Виконано" : ticket.status === "in_progress" ? "У роботі" : "Заплановано"}</span>
          </Link>
        ))}
        {planned.length === 0 ? <EmptyLine text="На цей тиждень планових заявок немає." /> : null}
      </div>
    </DirectorGlassCard>
  );
}

export function DirectorActsPreview({ acts }: { acts: WorkCompletionActWithRelations[] }) {
  return (
    <DirectorGlassCard className="p-4">
      <DirectorSectionTitle
        icon={<FileCheck2 className="h-4 w-4" />}
        title="Акти виконаних робіт"
        action={<Link href="/director/acts" className="text-xs font-semibold text-zinc-300">Переглянути всі</Link>}
      />
      <div className="mt-3 space-y-2">
        {acts.length ? acts.map((act) => (
          <div key={act.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-2xl bg-black/18 px-3 py-2 text-sm">
            <div className="min-w-0">
              <div className="truncate font-semibold text-zinc-100">{act.act_number}</div>
              <div className="mt-1 flex min-w-0 items-center gap-1 text-xs text-zinc-500">
                <MapPin className="h-3 w-3 shrink-0" />
                <span className="truncate">{act.object?.address ?? act.object?.name}</span>
              </div>
            </div>
            <Link href={`/director/tickets/${act.ticket_id}/act/export`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-300">
              <Download className="h-4 w-4" />
            </Link>
            <div className="col-span-2 text-xs text-zinc-500">Підтверджено: {formatDate(act.confirmed_at)}</div>
          </div>
        )) : <EmptyLine text="Актів поки немає." />}
      </div>
    </DirectorGlassCard>
  );
}

export function DirectorAnalyticsPreview({ total, categories }: { total: number; categories: DirectorAnalyticsCategory[] }) {
  const points = [12, 22, 16, 28, 20, 32, 24, 30].map((value, index) => `${index * 18},${42 - value}`);
  return (
    <DirectorGlassCard className="p-4">
      <DirectorSectionTitle icon={<BarChart3 className="h-4 w-4" />} title="Аналітика магазину" action={<span className="text-xs text-zinc-400">За 30 днів</span>} />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="text-sm font-semibold text-zinc-200">Динаміка заявок</p>
          <svg viewBox="0 0 126 44" className="mt-3 h-12 w-full overflow-visible">
            <polyline points={points.join(" ")} fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="mt-1 text-2xl font-black text-zinc-50">{total} <span className="text-sm font-medium text-zinc-400">усього</span></div>
        </div>
        <div className="rounded-2xl bg-black/18 p-3">
          <p className="text-sm font-semibold text-zinc-200">Найчастіші категорії</p>
          <div className="mt-3 space-y-2">
            {categories.length ? categories.map((category) => (
              <div key={category.id} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
                <span className="truncate text-zinc-300">{category.name}</span>
                <span className="text-zinc-400">{category.count}</span>
                <span className="col-span-2 h-1.5 rounded-full bg-white/[0.08]">
                  <span className="block h-full rounded-full bg-gradient-to-r from-amber-300 to-orange-500" style={{ width: `${category.percent}%` }} />
                </span>
              </div>
            )) : <p className="text-xs text-zinc-500">Даних для аналітики поки немає.</p>}
          </div>
        </div>
      </div>
    </DirectorGlassCard>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div className="rounded-2xl border border-white/[0.08] bg-white/[0.035] p-4 text-sm text-zinc-500">{text}</div>;
}
