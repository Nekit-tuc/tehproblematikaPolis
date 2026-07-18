import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  Building2,
  CalendarCheck,
  CheckCircle2,
  ClipboardList,
  FileText,
  HardHat,
  PlusCircle,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { getWeeklyDashboardCommandCenter, type WeeklyDashboardHotTicket, type WeeklyDashboardPlanCategory } from "@/lib/supabase/queries";
import type { TicketPriority, TicketStatus } from "@/types/domain";

const statusLabels: Record<TicketStatus, string> = {
  pending_review: "AI Review",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На підтвердженні",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const priorityLabels: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const commandCenterResult = await getWeeklyDashboardCommandCenter();
  const data = commandCenterResult.data;
  const todayIso = new Date().toISOString().slice(0, 10);
  const maxDailyCount = Math.max(1, ...data.dailyCounts.map((day) => day.count));

  return (
    <div className="page-shell relative mx-auto max-w-7xl overflow-hidden pb-28 md:pb-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative space-y-4 md:space-y-5">
        {params.error === "forbidden" ? (
          <Alert title="Недостатньо прав">Вашій ролі не відкрито доступ до цього розділу. Якщо доступ потрібен, адміністратор має змінити роль у профілі.</Alert>
        ) : null}
        {commandCenterResult.error ? <Alert title="Дані Supabase недоступні">{commandCenterResult.error}</Alert> : null}

        <section className="rounded-[17px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20 backdrop-blur md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-[0.32em] text-orange-300/80">Service Desk AI</p>
              <h1 className="mt-1 text-[17px] font-bold leading-tight text-zinc-100">Контроль магазинів Полісся</h1>
              <p className="mt-1 text-[11px] leading-snug text-zinc-400">Вітаю, Administrator</p>
              <p className="mt-0.5 text-[10px] leading-snug text-zinc-500">Огляд заявок і виконання на сьогодні</p>
            </div>
            <div className="flex h-9 shrink-0 items-center gap-1.5 rounded-[11px] border border-orange-400/20 bg-orange-500/10 px-2.5 text-[10px] font-medium text-orange-200">
              <CalendarCheck className="h-3.5 w-3.5" />
              <span>Тиждень {data.period.weekNumber}</span>
            </div>
          </div>
        </section>

        <section className="hidden rounded-[22px] border border-white/[0.08] bg-gradient-to-br from-white/[0.055] via-white/[0.025] to-black/20 p-5 shadow-black/20 backdrop-blur md:block">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300">Polissya</p>
              <h1 className="mt-1 text-3xl font-semibold leading-tight text-stone-50">Тижневий контроль</h1>
              <p className="mt-1 max-w-2xl text-sm leading-relaxed text-stone-400">Контроль заявок, планів і виконання в одному операційному центрі.</p>
            </div>
            <div className="shrink-0 rounded-2xl border border-orange-400/20 bg-orange-500/10 px-3 py-2 text-right">
              <p className="text-[10px] text-orange-200">Тиждень</p>
              <p className="text-lg font-semibold text-orange-100">{data.period.weekNumber}</p>
            </div>
          </div>
        </section>

        <WeeklyCalendar monthLabel={data.period.monthLabel} weekNumber={data.period.weekNumber} todayIso={todayIso} days={data.calendarDays} />

        <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
          <KpiCard title="Поточний тиждень" value={data.kpi.currentWeekTicketCount} subtitle="всього заявок" icon={Ticket} tone="text-orange-300" />
          <KpiCard title="В роботі" value={data.kpi.inWorkCount} subtitle="на виконанні" icon={HardHat} tone="text-blue-300" />
          <KpiCard title="Виконано" value={data.kpi.completedThisWeekCount} subtitle="цього тижня" icon={CheckCircle2} tone="text-emerald-300" />
          <KpiCard title="Проблемні" value={data.kpi.problematicCount} subtitle="прострочені / на підтвердженні" icon={AlertTriangle} tone="text-red-300" />
        </section>

        <QuickAccess pendingAiCount={data.kpi.pendingAiCount} />

        <section className="space-y-3">
          <SectionHeader title="Контроль тижня" href="/tickets" linkLabel="Переглянути все" />
          <div className="grid gap-3 lg:grid-cols-3">
            <HotTicketsCard tickets={data.highPriorityTickets} total={data.highPriorityTotal} />
            <NextPlanCard categories={data.nextPlanSummary.categories} totalTickets={data.nextPlanSummary.totalTickets} totalWorkers={data.nextPlanSummary.totalWorkers} hasPlan={data.nextPlanSummary.hasPlan} />
            <PreviousWeekCard startIso={data.period.previousStartIso} endIso={data.period.previousEndIso} created={data.previousWeekSummary.created} completed={data.previousWeekSummary.completed} carriedOver={data.previousWeekSummary.carriedOver} periodId={data.previousWeekSummary.periodId} />
          </div>
        </section>

        <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <ProblemSummaryCard carriedOver={data.problemSummary.carriedOver} overdue={data.problemSummary.overdue} repeated={data.problemSummary.repeated} waitingConfirmation={data.problemSummary.waitingConfirmation} />
          <WeeklyAnalyticsCard days={data.dailyCounts} todayIso={todayIso} maxDailyCount={maxDailyCount} />
        </section>

        <RemindersCard pendingAiCount={data.kpi.pendingAiCount} waitingAdminCount={data.kpi.waitingAdminConfirmationCount} />
      </div>
    </div>
  );
}

function glassCardClass(extra = "") {
  return `min-w-0 rounded-[18px] border border-white/[0.08] bg-white/[0.035] shadow-sm shadow-black/20 backdrop-blur ${extra}`;
}

function WeeklyCalendar({ monthLabel, weekNumber, todayIso, days }: { monthLabel: string; weekNumber: number; todayIso: string; days: Array<{ iso: string; dayLabel: string; dateLabel: string; count: number; hasProblematic: boolean }> }) {
  return (
    <section className={glassCardClass("p-3 md:p-4")}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-semibold capitalize text-stone-100">{monthLabel}</h2>
          <p className="text-[10px] text-stone-500">Міні календар тижня</p>
        </div>
        <span className="rounded-full border border-orange-400/20 bg-orange-500/10 px-2.5 py-1 text-[10px] font-medium text-orange-200">Тиждень {weekNumber}</span>
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => {
          const active = day.iso === todayIso;
          return (
            <div key={day.iso} className="min-w-0 text-center">
              <p className="mb-1 text-[9px] font-medium text-stone-500">{day.dayLabel}</p>
              <div className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-[12px] font-semibold ${active ? "bg-orange-500 text-black shadow-lg shadow-orange-500/25" : "bg-white/[0.045] text-stone-200"}`}>{day.dateLabel}</div>
              <div className="mt-1 flex h-2 items-center justify-center gap-0.5">
                {day.count > 0 ? <span className="h-1.5 w-1.5 rounded-full bg-orange-400" /> : null}
                {day.hasProblematic ? <span className="h-1.5 w-1.5 rounded-full bg-red-400" /> : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function KpiCard({ title, value, subtitle, icon: Icon, tone }: { title: string; value: number; subtitle: string; icon: React.ElementType; tone: string }) {
  return (
    <div className={glassCardClass("p-3 md:p-4")}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] font-medium leading-tight text-stone-300">{title}</p>
        <Icon className={`h-4 w-4 shrink-0 ${tone}`} />
      </div>
      <p className="text-[24px] font-semibold leading-none text-stone-50 md:text-[28px]">{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-stone-500">{subtitle}</p>
    </div>
  );
}

function QuickAccess({ pendingAiCount }: { pendingAiCount: number }) {
  const actions = [
    { href: "/tickets/new", label: "Створити", icon: PlusCircle },
    { href: "/ai-tickets", label: "AI-перевірка", icon: Bot, badge: pendingAiCount },
    { href: "/work-planning", label: "План", icon: CalendarCheck },
    { href: "/workers", label: "Виконавці", icon: Users },
    { href: "/objects", label: "Об'єкти", icon: Building2 },
    { href: "/reports", label: "Звіти", icon: FileText },
  ];
  return (
    <section className={glassCardClass("p-3 md:p-4")}>
      <h2 className="mb-3 text-[14px] font-semibold text-stone-100">Швидкий доступ</h2>
      <div className="grid grid-cols-3 gap-2 md:grid-cols-6">
        {actions.map((item) => (
          <Link key={item.href} href={item.href} className="relative flex min-h-[76px] min-w-0 flex-col justify-between rounded-[15px] border border-white/[0.08] bg-black/20 p-2.5 active:bg-white/[0.06] md:min-h-[84px]">
            <item.icon className="h-4 w-4 text-orange-300" />
            <span className="break-words text-[10px] font-medium leading-tight text-stone-100 md:text-[11px]">{item.label}</span>
            {item.badge ? <span className="absolute right-2 top-2 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-semibold text-black">{item.badge}</span> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

function SectionHeader({ title, href, linkLabel }: { title: string; href: string; linkLabel: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="text-[15px] font-semibold text-stone-50">{title}</h2>
      <Link href={href} className="text-[11px] font-medium text-orange-300">{linkLabel}</Link>
    </div>
  );
}

function HotTicketsCard({ tickets, total }: { tickets: WeeklyDashboardHotTicket[]; total: number }) {
  return (
    <Link href="/tickets?priority=high" className={glassCardClass("block p-3 active:bg-white/[0.05]")}>
      <CardTitleLine icon={AlertTriangle} title="Гарячі заявки" tone="text-red-300" />
      <div className="mt-3 space-y-2">
        {tickets.length ? tickets.map((ticket) => <HotTicketRow key={ticket.id} ticket={ticket} />) : <EmptyText>Критичних або високих заявок немає.</EmptyText>}
      </div>
      <CardFooterText>Всього: {total}</CardFooterText>
    </Link>
  );
}

function HotTicketRow({ ticket }: { ticket: WeeklyDashboardHotTicket }) {
  return (
    <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] text-orange-300">{ticket.number}</p>
          <p className="truncate text-[12px] font-semibold text-stone-100">{ticket.title}</p>
        </div>
        <span className={`shrink-0 rounded-full px-2 py-1 text-[9px] font-semibold ${priorityClass(ticket.priority)}`}>{priorityLabels[ticket.priority]}</span>
      </div>
      <p className="mt-1 truncate text-[10px] text-stone-500">{ticket.object?.name ?? "Об'єкт не вказано"} · {ticket.category?.name ?? "Без категорії"}</p>
    </div>
  );
}

function NextPlanCard({ categories, totalTickets, totalWorkers, hasPlan }: { categories: WeeklyDashboardPlanCategory[]; totalTickets: number; totalWorkers: number; hasPlan: boolean }) {
  return (
    <Link href="/work-planning" className={glassCardClass("block p-3 active:bg-white/[0.05]")}>
      <CardTitleLine icon={CalendarCheck} title="План наступного тижня" tone="text-blue-300" />
      <div className="mt-3 space-y-2">
        {hasPlan && categories.length ? categories.map((item) => (
          <div key={item.category} className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-2.5 py-2 text-[11px]">
            <span className="min-w-0 truncate text-stone-200">{item.category}</span>
            <span className="shrink-0 text-stone-400">{item.tickets} заявок · {item.workers} вик.</span>
          </div>
        )) : <EmptyText>План ще не створено або немає заявок із виконавцями.</EmptyText>}
      </div>
      <CardFooterText>Всього: {totalTickets} заявок · {totalWorkers} виконавців</CardFooterText>
    </Link>
  );
}

function PreviousWeekCard({ startIso, endIso, created, completed, carriedOver, periodId }: { startIso: string; endIso: string; created: number; completed: number; carriedOver: number; periodId: string | null }) {
  const archiveHref = periodId ? `/weekly-control/${periodId}` : "/weekly-control";
  const weeklyReportHref = periodId ? `/reports/weekly?periodId=${periodId}` : "/reports/weekly?period=previous_week";
  const directorReportHref = periodId ? `/reports/director?periodId=${periodId}` : "/reports/director?period=previous_week";
  return (
    <article className={glassCardClass("p-3") }>
      <CardTitleLine icon={ClipboardList} title="\u0410\u0440\u0445\u0456\u0432 \u043F\u043E\u043F\u0435\u0440\u0435\u0434\u043D\u044C\u043E\u0433\u043E \u0442\u0438\u0436\u043D\u044F" tone="text-stone-300" />
      <p className="mt-1 text-[10px] text-stone-500">{formatDate(startIso)} - {formatDate(endIso)}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MiniStat label="\u0421\u0442\u0432\u043E\u0440\u0435\u043D\u043E" value={created} />
        <MiniStat label="\u0412\u0438\u043A\u043E\u043D\u0430\u043D\u043E" value={completed} />
        <MiniStat label="\u041F\u0435\u0440\u0435\u043D\u0435\u0441\u0435\u043D\u043E" value={carriedOver} />
      </div>
      <div className="mt-3 grid gap-2">
        <Link href={archiveHref} className="flex items-center justify-between rounded-2xl bg-black/20 px-2.5 py-2 text-[11px] font-medium text-stone-200 active:bg-white/[0.05]">
          <span>{"\u0412\u0456\u0434\u043A\u0440\u0438\u0442\u0438 \u0430\u0440\u0445\u0456\u0432"}</span><ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Link href={weeklyReportHref} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-center text-[10px] font-medium text-orange-200 active:bg-white/[0.06]">{"\u0422\u0438\u0436\u043D\u0435\u0432\u0438\u0439 \u0437\u0432\u0456\u0442"}</Link>
          <Link href={directorReportHref} className="rounded-2xl border border-white/[0.08] bg-white/[0.035] px-2.5 py-2 text-center text-[10px] font-medium text-orange-200 active:bg-white/[0.06]">{"\u0414\u043B\u044F \u0434\u0438\u0440\u0435\u043A\u0442\u043E\u0440\u0430"}</Link>
        </div>
      </div>
    </article>
  );
}

function ProblemSummaryCard({ repeated, carriedOver, overdue, waitingConfirmation }: { repeated: number; carriedOver: number; overdue: number; waitingConfirmation: number }) {
  return (
    <section className={glassCardClass("p-3 md:p-4")}>
      <CardTitleLine icon={AlertTriangle} title="Проблемні / повторні" tone="text-red-300" />
      <div className="mt-3 space-y-2">
        <ProblemRow label="Повторні звернення" value={`${repeated} звернень`} />
        <ProblemRow label="Перенесені на цей тиждень" value={`${carriedOver} заявок`} />
        <ProblemRow label="Прострочені заявки" value={`${overdue} заявок`} />
        <ProblemRow label="Очікують підтвердження" value={`${waitingConfirmation} заявок`} />
      </div>
      <Link href="/tickets" className="mt-3 inline-flex text-[11px] font-medium text-orange-300">Відкрити список</Link>
    </section>
  );
}

function WeeklyAnalyticsCard({ days, todayIso, maxDailyCount }: { days: Array<{ iso: string; dayLabel: string; count: number }>; todayIso: string; maxDailyCount: number }) {
  return (
    <section className={glassCardClass("p-3 md:p-4")}>
      <CardTitleLine icon={BarChart3} title="Аналітика тижня" tone="text-orange-300" />
      <div className="mt-4 flex h-24 items-end gap-2 overflow-hidden">
        {days.map((day) => {
          const height = Math.max(10, Math.round((day.count / maxDailyCount) * 72));
          const active = day.iso === todayIso;
          return (
            <div key={day.iso} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <div className="text-[9px] text-stone-500">{day.count}</div>
              <div className={`w-full max-w-7 rounded-t-lg ${active ? "bg-orange-500" : "bg-white/15"}`} style={{ height }} />
              <div className="text-[9px] text-stone-500">{day.dayLabel}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[10px] text-stone-500">Кількість заявок за днями поточного тижня</p>
    </section>
  );
}

function RemindersCard({ pendingAiCount, waitingAdminCount }: { pendingAiCount: number; waitingAdminCount: number }) {
  const rows = [
    { title: "У п'ятницю сформувати план", subtitle: "План робіт на наступний тиждень", href: "/work-planning", show: true },
    { title: "Заявки очікують підтвердження", subtitle: `Потрібна перевірка адміністратора: ${waitingAdminCount}`, href: "/tickets?status=waiting_admin_confirmation", show: waitingAdminCount > 0 },
    { title: "AI-заявки на перевірці", subtitle: `Перевірити нові заявки від бота: ${pendingAiCount}`, href: "/ai-tickets", show: pendingAiCount > 0 },
  ].filter((item) => item.show);

  return (
    <section className={glassCardClass("p-3 md:p-4")}>
      <CardTitleLine icon={Sparkles} title="Нагадування / фокус дня" tone="text-orange-300" />
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <Link key={row.href + row.title} href={row.href} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.07] bg-black/20 p-2.5 active:bg-white/[0.05]">
            <div className="min-w-0">
              <p className="truncate text-[12px] font-semibold text-stone-100">{row.title}</p>
              <p className="truncate text-[10px] text-stone-500">{row.subtitle}</p>
            </div>
            <span className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-[10px] font-semibold text-black">Виконати</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CardTitleLine({ icon: Icon, title, tone }: { icon: React.ElementType; title: string; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className={`h-4 w-4 ${tone}`} />
      <h3 className="min-w-0 text-[13px] font-semibold text-stone-100">{title}</h3>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-black/20 p-2 text-center">
      <p className="text-lg font-semibold leading-none text-stone-50">{value}</p>
      <p className="mt-1 text-[9px] leading-tight text-stone-500">{label}</p>
    </div>
  );
}

function ProblemRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-2.5 py-2 text-[11px]">
      <span className="min-w-0 text-stone-300">{label}</span>
      <span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-stone-200">{value}</span>
    </div>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-white/[0.08] bg-black/10 p-3 text-[11px] leading-relaxed text-stone-500">{children}</p>;
}

function CardFooterText({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex items-center justify-between text-[10px] font-medium text-stone-500"><span>{children}</span><ArrowRight className="h-3.5 w-3.5" /></div>;
}

function priorityClass(priority: TicketPriority) {
  if (priority === "critical") return "bg-red-500/20 text-red-200";
  if (priority === "high") return "bg-orange-500/20 text-orange-200";
  if (priority === "medium") return "bg-amber-500/20 text-amber-200";
  return "bg-white/[0.08] text-stone-300";
}

function formatDate(iso: string) {
  const date = new Date(iso);
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(date);
}