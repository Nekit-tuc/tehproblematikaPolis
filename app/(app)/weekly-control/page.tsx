import Link from "next/link";
import type React from "react";
import { AlertTriangle, Archive, CalendarDays, CheckCircle2, ClipboardList, Download, ExternalLink, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CloseWeekForm } from "@/components/weekly-control/close-week-form";
import { requireRole } from "@/lib/auth/server";
import { getOrCreateCurrentWeeklyPeriod, getWeeklyPeriods, type WeeklyPeriod, type WeeklySummary } from "@/lib/supabase/weekly-control";
import { getWeeklyDashboardCommandCenter } from "@/lib/supabase/queries";
import { closeWeeklyPeriodAction } from "./actions";

export default async function WeeklyControlPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [currentResult, periodsResult, dashboardResult] = await Promise.all([
    getOrCreateCurrentWeeklyPeriod(),
    getWeeklyPeriods(20),
    getWeeklyDashboardCommandCenter(),
  ]);
  const current = currentResult.data;
  const periods = periodsResult.data;
  const archived = periods.filter((period) => period.status === "archived" || period.status === "closed");
  const currentSummary = {
    totalCreated: dashboardResult.data.kpi.currentWeekTicketCount,
    totalCompleted: dashboardResult.data.kpi.completedThisWeekCount,
    totalUnresolved: dashboardResult.data.problemSummary.carriedOver + dashboardResult.data.problemSummary.overdue,
    totalWaitingAdminConfirmation: dashboardResult.data.kpi.waitingAdminConfirmationCount,
  };
  const error = currentResult.error ?? periodsResult.error ?? dashboardResult.error;

  return (
    <div className="page-shell mx-auto max-w-6xl space-y-4 pb-28 md:pb-8">
      {params.success === "closed" ? <Alert title="Тиждень закрито">Архівний snapshot створено. Невиконані заявки залишилися активними.</Alert> : null}
      {params.error ? <Alert title="Дію не виконано">Не вдалося виконати операцію. Перевірте доступ до Supabase або повторіть пізніше.</Alert> : null}
      {error ? <Alert title="Дані Supabase недоступні">{error}</Alert> : null}

      <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-sm shadow-black/20 md:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-orange-300">Service Desk AI</p>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight text-stone-50 md:text-3xl">Тижневий контроль</h1>
            <p className="mt-1 max-w-2xl text-[12px] leading-relaxed text-stone-400 md:text-sm">Періоди, архіви та контроль невиконаних заявок без зміни реальних заявок у базі.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link href="/dashboard">На dashboard</Link></Button>
        </div>
      </section>

      {current ? <CurrentWeekCard period={current} summary={currentSummary} /> : null}

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-stone-50">Архів тижнів</h2>
          <span className="text-[11px] text-stone-500">{archived.length} записів</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {archived.length ? archived.map((period) => <ArchiveCard key={period.id} period={period} />) : <EmptyCard text="Архівних тижнів ще немає. Закрийте поточний тиждень вручну, щоб створити перший snapshot." />}
        </div>
      </section>
    </div>
  );
}

function CurrentWeekCard({ period, summary }: { period: WeeklyPeriod; summary: { totalCreated: number; totalCompleted: number; totalUnresolved: number; totalWaitingAdminConfirmation: number } }) {
  const isOpen = period.status === "current";
  return (
    <section className="rounded-[20px] border border-orange-400/20 bg-orange-500/[0.06] p-4 shadow-sm shadow-black/20 md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="h-4 w-4 text-orange-300" />
            <h2 className="text-[16px] font-semibold text-stone-50">{period.title ?? "Поточний тиждень"}</h2>
            <Badge tone={isOpen ? "orange" : "gray"}>{isOpen ? "Поточний" : "Архів"}</Badge>
          </div>
          <p className="mt-1 text-[11px] text-stone-400">{formatDate(period.week_start)} - {formatDate(period.week_end)}</p>
        </div>
        {isOpen ? <CloseWeekForm periodId={period.id} action={closeWeeklyPeriodAction} /> : <Button asChild size="sm"><Link href={`/weekly-control/${period.id}`}>Відкрити архів</Link></Button>}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <MiniStat icon={ClipboardList} label="Створено" value={summary.totalCreated} />
        <MiniStat icon={CheckCircle2} label="Виконано" value={summary.totalCompleted} />
        <MiniStat icon={RotateCcw} label="Невиконано" value={summary.totalUnresolved} />
        <MiniStat icon={AlertTriangle} label="На підтвердженні" value={summary.totalWaitingAdminConfirmation} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="secondary" size="sm"><Link href="/tickets">Переглянути заявки</Link></Button>
        <Button asChild variant="ghost" size="sm"><Link href="/work-planning">Планування</Link></Button>
      </div>
    </section>
  );
}

function ArchiveCard({ period }: { period: WeeklyPeriod }) {
  const summary = normalizeSummary(period.summary_json);
  return (
    <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Archive className="h-4 w-4 text-stone-400" />
            <h3 className="truncate text-[13px] font-semibold text-stone-100">{period.title ?? "Архів тижня"}</h3>
          </div>
          <p className="mt-1 text-[10px] text-stone-500">{formatDate(period.week_start)} - {formatDate(period.week_end)}</p>
        </div>
        <Badge tone="gray">{period.status}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <SmallValue label="Створено" value={summary.totalCreated} />
        <SmallValue label="Виконано" value={summary.totalCompleted} />
        <SmallValue label="Невиконано" value={summary.totalUnresolved} />
        <SmallValue label="Перенесено" value={summary.totalCarriedOver} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm"><Link href={`/weekly-control/${period.id}`}><ExternalLink className="mr-1 h-3.5 w-3.5" />Відкрити</Link></Button>
        <Button asChild variant="outline" size="sm"><Link href={`/weekly-control/${period.id}/export`}><Download className="mr-1 h-3.5 w-3.5" />CSV</Link></Button>
      </div>
    </article>
  );
}

function MiniStat({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-3"><Icon className="mb-2 h-4 w-4 text-orange-300" /><p className="text-xl font-semibold leading-none text-stone-50">{value}</p><p className="mt-1 text-[10px] text-stone-500">{label}</p></div>;
}

function SmallValue({ label, value }: { label: string; value?: number }) {
  return <div className="rounded-2xl bg-black/20 p-2"><p className="text-lg font-semibold leading-none text-stone-100">{value ?? 0}</p><p className="mt-1 text-[9px] text-stone-500">{label}</p></div>;
}

function EmptyCard({ text }: { text: string }) {
  return <div className="rounded-[18px] border border-dashed border-white/[0.10] bg-white/[0.025] p-4 text-[12px] leading-relaxed text-stone-400 md:col-span-2 xl:col-span-3">{text}</div>;
}

function normalizeSummary(raw: unknown): WeeklySummary {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<WeeklySummary>;
  return {
    totalCreated: value.totalCreated ?? 0,
    totalCompleted: value.totalCompleted ?? 0,
    totalUnresolved: value.totalUnresolved ?? 0,
    totalCarriedOver: value.totalCarriedOver ?? 0,
    totalHot: value.totalHot ?? 0,
    totalPlanned: value.totalPlanned ?? 0,
    totalWaitingAdminConfirmation: value.totalWaitingAdminConfirmation ?? 0,
    byCategory: Array.isArray(value.byCategory) ? value.byCategory : [],
    byObjectTop: Array.isArray(value.byObjectTop) ? value.byObjectTop : [],
    byWorker: Array.isArray(value.byWorker) ? value.byWorker : [],
  };
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}