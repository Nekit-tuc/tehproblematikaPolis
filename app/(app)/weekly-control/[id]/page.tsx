import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/lib/auth/server";
import { getWeeklyPeriodDetails, type WeeklyPeriodTicket, type WeeklySummary, type WeeklyTicketRole } from "@/lib/supabase/weekly-control";

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

export default async function WeeklyPeriodDetailsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ success?: string }> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const result = await getWeeklyPeriodDetails(id);
  if (!result.data.period) notFound();
  const { period, tickets, summary } = result.data;
  const grouped = groupByRole(tickets);

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-4 pb-28 md:pb-8">
      {query.success === "closed" ? <Alert title="Тиждень закрито">Snapshot створено. Архів доступний для перегляду та експорту.</Alert> : null}
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
            <Button asChild size="sm"><Link href={`/weekly-control/${period.id}/export`}><Download className="mr-1 h-3.5 w-3.5" />Експорт CSV</Link></Button>
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
          <TicketSection key={role} title={roleLabels[role]} tickets={grouped[role] ?? []} />
        ))}
      </section>
    </div>
  );
}

function ReportsForWeek({ periodId }: { periodId: string }) {
  const reports = [
    { title: "\u0422\u0438\u0436\u043D\u0435\u0432\u0438\u0439 \u0437\u0432\u0456\u0442", href: `/reports/weekly?periodId=${periodId}` },
    { title: "\u041F\u043E \u043E\u0431\u0027\u0454\u043A\u0442\u0430\u0445", href: `/reports/objects?periodId=${periodId}` },
    { title: "\u041F\u043E \u0432\u0438\u043A\u043E\u043D\u0430\u0432\u0446\u044F\u0445", href: `/reports/workers?periodId=${periodId}` },
    { title: "\u041F\u043E \u043A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F\u0445", href: `/reports/categories?periodId=${periodId}` },
    { title: "\u0417\u0432\u0456\u0442 \u0434\u043B\u044F \u0434\u0438\u0440\u0435\u043A\u0442\u043E\u0440\u0430", href: `/reports/director?periodId=${periodId}` },
  ];
  const exports = [
    { title: "Weekly CSV", href: `/reports/export?type=weekly&periodId=${periodId}` },
    { title: "Director CSV", href: `/reports/export?type=director&periodId=${periodId}` },
  ];
  return (
    <section className="rounded-[18px] border border-orange-400/15 bg-orange-500/[0.04] p-3 shadow-sm shadow-black/20">
      <div className="flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-[14px] font-semibold text-stone-100">{"\u0417\u0432\u0456\u0442\u0438 \u0437\u0430 \u0446\u0435\u0439 \u0442\u0438\u0436\u0434\u0435\u043D\u044C"}</h2>
          <p className="mt-1 text-[11px] text-stone-500">{"\u0426\u0456 \u043F\u043E\u0441\u0438\u043B\u0430\u043D\u043D\u044F \u0432\u0438\u043A\u043E\u0440\u0438\u0441\u0442\u043E\u0432\u0443\u044E\u0442\u044C \u0430\u0440\u0445\u0456\u0432\u043D\u0438\u0439 snapshot weekly_period_tickets, \u0430 \u043D\u0435 live-\u0437\u0430\u044F\u0432\u043A\u0438."}</p>
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

function TicketSection({ title, tickets }: { title: string; tickets: WeeklyPeriodTicket[] }) {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.025] p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-stone-100">{title}</h2>
        <span className="rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-stone-300">{tickets.length}</span>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {tickets.length ? tickets.map((ticket) => <TicketSnapshotCard key={`${ticket.ticket_id}-${ticket.role}`} ticket={ticket} />) : <p className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[11px] text-stone-500">Немає заявок у цій групі.</p>}
      </div>
    </section>
  );
}

function TicketSnapshotCard({ ticket }: { ticket: WeeklyPeriodTicket }) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.07] bg-black/20 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold text-orange-300">{ticket.ticket_number ?? "Без номера"}</p>
          <h3 className="mt-0.5 line-clamp-2 text-[13px] font-semibold leading-snug text-stone-100">{ticket.ticket_title ?? "Без назви"}</h3>
        </div>
        <Button asChild variant="ghost" size="sm"><Link href={`/tickets/${ticket.ticket_id}`}><ExternalLink className="h-3.5 w-3.5" /></Link></Button>
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
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}