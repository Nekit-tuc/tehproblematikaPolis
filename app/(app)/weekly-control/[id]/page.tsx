import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, RotateCcw } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/server";
import { getWeeklyPeriodDetails, type WeeklyPeriodTicket, type WeeklySummary, type WeeklyTicketRole } from "@/lib/supabase/weekly-control";
import { rebuildWeeklyArchiveAction } from "../actions";

const roleLabels: Record<WeeklyTicketRole, string> = {
  created: "Створені",
  planned: "У планах",
  completed: "Виконані",
  carried_over: "Перенесені",
  hot: "Гарячі",
  unresolved: "Невиконані",
};

const statusLabels: Record<string, string> = {
  pending_review: "Очікує підтвердження",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На підтвердженні",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

function ticketDetailHref(ticketId: string, returnTo: string) {
  return `/tickets/${ticketId}?returnTo=${encodeURIComponent(returnTo)}`;
}

export default async function WeeklyPeriodDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getWeeklyPeriodDetails(id);
  if (!result.data.period) notFound();
  const { period, tickets, summary } = result.data;
  const grouped = groupByRole(tickets);
  const returnTo = `/weekly-control/${period.id}`;

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-4 pb-28 md:pb-8">
      {query.success === "closed" ? <Alert title="Тиждень закрито">Snapshot створено. Архів доступний для перегляду та експорту.</Alert> : null}
      {query.success === "recalculated" ? <Alert title="Архів перераховано">Snapshot та статистику оновлено за поточною логікою тижня.</Alert> : null}
      {query.error === "rebuild-failed" ? <Alert title="Не вдалося перерахувати архів">Перевірте доступ до Supabase або повторіть пізніше.</Alert> : null}
      {result.error ? <Alert title="Дані архіву завантажено частково">{result.error}</Alert> : null}

      <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-sm shadow-black/20 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <Button asChild variant="ghost" size="sm"><Link href="/weekly-control"><ArrowLeft className="mr-1 h-3.5 w-3.5" />Назад</Link></Button>
            <h1 className="mt-2 text-[22px] font-semibold leading-tight text-stone-50 md:text-3xl">{period.title ?? "Архів тижня"}</h1>
            <p className="mt-1 text-[12px] text-stone-400">{formatDate(period.week_start)} - {formatDate(period.week_end)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="gray">{period.status}</Badge>
            <Button asChild size="sm"><Link href={`/weekly-control/${period.id}/export`}><Download className="mr-1 h-3.5 w-3.5" />Експорт Excel</Link></Button>
            {period.status === "archived" || period.status === "closed" ? (
              <form action={rebuildWeeklyArchiveAction}>
                <input type="hidden" name="periodId" value={period.id} />
                <ConfirmSubmitButton
                  type="submit"
                  variant="outline"
                  size="sm"
                  message="Перерахувати snapshot цього архіву за новою логікою? Заявки та плани не зміняться."
                  pendingText="Перераховується..."
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />Перерахувати
                </ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        </div>
      </section>

      <SummaryGrid summary={summary} />


      <ReportsForWeek periodId={period.id} />

      <section className="grid gap-3 lg:grid-cols-3">
        <TopList title="По категоріях" rows={summary.byCategory} />
        <TopList title="По об'єктах" rows={summary.byObjectTop} />
        <TopList title="По виконавцях" rows={summary.byWorker} />
      </section>

      <section className="space-y-3">
        {(["created", "planned", "completed", "unresolved", "carried_over", "hot"] as WeeklyTicketRole[]).map((role) => (
          <TicketSection key={role} title={roleLabels[role]} tickets={grouped[role] ?? []} returnTo={returnTo} />
        ))}
      </section>
    </div>
  );
}

function ReportsForWeek({ periodId }: { periodId: string }) {
  const reports = [
    { title: "Тижневий звіт", href: `/reports/weekly?periodId=${periodId}` },
    { title: "По об'єктах", href: `/reports/objects?periodId=${periodId}` },
    { title: "По виконавцях", href: `/reports/workers?periodId=${periodId}` },
    { title: "По категоріях", href: `/reports/categories?periodId=${periodId}` },
    { title: "Звіт для директора", href: `/reports/director?periodId=${periodId}` },
  ];
  const exports = [
    { title: "Weekly Excel", href: `/reports/export?type=weekly&periodId=${periodId}` },
    { title: "Director Excel", href: `/reports/export?type=director&periodId=${periodId}` },
  ];
  return (
    <section className="rounded-[18px] border border-orange-400/15 bg-orange-500/[0.04] p-3 shadow-sm shadow-black/20">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-stone-100">Звіти за цей тиждень</h2>
          <p className="mt-1 text-[11px] text-stone-500">Ці посилання використовують архівний snapshot weekly_period_tickets, а не live-заявки.</p>
        </div>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-3 xl:grid-cols-5">
        {reports.map((report) => (
          <Button key={report.href} asChild variant="outline" size="sm" className="h-9 justify-start rounded-2xl text-[11px]">
            <Link href={report.href}><ExternalLink className="mr-1 h-3.5 w-3.5" />{report.title}</Link>
          </Button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {exports.map((item) => (
          <Button key={item.href} asChild size="sm" className="h-9 rounded-2xl text-[11px]">
            <Link href={item.href}><Download className="mr-1 h-3.5 w-3.5" />{item.title}</Link>
          </Button>
        ))}
      </div>
    </section>
  );
}

function SummaryGrid({ summary }: { summary: WeeklySummary }) {
  const stats = [
    ["Створено", summary.totalCreated],
    ["Виконано", summary.totalCompleted],
    ["Невиконано", summary.totalUnresolved],
    ["Перенесено", summary.totalCarriedOver],
    ["Гарячі", summary.totalHot],
    ["У планах", summary.totalPlanned],
    ["На підтвердженні", summary.totalWaitingAdminConfirmation],
  ];
  return <section className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-7">{stats.map(([label, value]) => <div key={String(label)} className="rounded-[17px] border border-white/[0.08] bg-white/[0.035] p-3"><p className="text-xl font-semibold leading-none text-stone-50">{value}</p><p className="mt-1 text-[10px] text-stone-500">{label}</p></div>)}</section>;
}

function TopList({ title, rows }: { title: string; rows: Array<{ name: string; count: number }> }) {
  return (
    <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3">
      <h2 className="text-[13px] font-semibold text-stone-100">{title}</h2>
      <div className="mt-3 space-y-2">
        {rows.length ? rows.slice(0, 6).map((row) => <div key={row.name} className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-2.5 py-2 text-[11px]"><span className="min-w-0 truncate text-stone-300">{row.name}</span><span className="shrink-0 font-semibold text-orange-200">{row.count}</span></div>) : <p className="text-[11px] text-stone-500">Даних немає.</p>}
      </div>
    </article>
  );
}

function TicketSection({ title, tickets, returnTo }: { title: string; tickets: WeeklyPeriodTicket[]; returnTo: string }) {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-stone-100">{title}</h2>
        <span className="rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-stone-300">{tickets.length}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {tickets.length ? tickets.map((ticket) => <TicketSnapshotCard key={`${ticket.ticket_id}-${ticket.role}`} ticket={ticket} returnTo={returnTo} />) : <p className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[11px] text-stone-500">Немає заявок у цій групі.</p>}
      </div>
    </section>
  );
}

function TicketSnapshotCard({ ticket, returnTo }: { ticket: WeeklyPeriodTicket; returnTo: string }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-orange-300">{ticket.ticket_number ?? "Без номера"}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-stone-100">{ticket.ticket_title ?? "Без назви"}</h3>
        </div>
        <Button asChild variant="ghost" size="sm"><Link href={ticketDetailHref(ticket.ticket_id, returnTo)}><ExternalLink className="h-3.5 w-3.5" /></Link></Button>
      </div>
      <div className="mt-2 grid gap-1 text-[10px] text-stone-500">
        <p className="truncate">{ticket.object_name ?? "Об'єкт не вказано"}</p>
        <p className="truncate">{ticket.category_name ?? "Без категорії"} · {ticket.assignee_worker_name ?? "Без виконавця"}</p>
        <p>{statusLabels[String(ticket.status_at_close ?? "")] ?? ticket.status_at_close ?? "Без статусу"}</p>
      </div>
    </article>
  );
}

function groupByRole(tickets: WeeklyPeriodTicket[]) {
  return tickets.reduce<Record<string, WeeklyPeriodTicket[]>>((acc, ticket) => {
    acc[ticket.role] = acc[ticket.role] ?? [];
    acc[ticket.role].push(ticket);
    return acc;
  }, {});
}

function formatDate(iso: string) {
  const value = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(value);
}
