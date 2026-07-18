import { AlertTriangle, BarChart3, Building2, CheckCircle2, ClipboardList, LineChart, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { ReportPageHeader, ReportBackButton, ReportExportButton, ReportPrintLink } from "@/components/reports/report-page-header";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsExportHref, reportsPeriodHref } from "@/lib/supabase/report-queries";

export default async function DirectorReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const maxTrend = Math.max(1, ...data.weeklyTrend.map((point) => point.count));

  return (
    <div className="page-shell mx-auto max-w-7xl space-y-4 pb-28 md:pb-8">
      {result.error ? <Alert title="Дані звіту завантажено частково">{result.error}</Alert> : null}
      <ReportPageHeader
        title="Звіт для директора"
        subtitle="Управлінський підсумок по заявках, об'єктах, виконавцях і ризиках."
        action={<> <ReportExportButton href={reportsExportHref("director", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)} /> <ReportPrintLink href={reportsPeriodHref("/reports/director/print", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)} /> <ReportBackButton /> </>}
      />
      <ReportPeriodTabs basePath="/reports/director" active={data.periodRange.period} from={data.periodRange.from} to={data.periodRange.to} label={data.periodRange.label} periodId={params.periodId} />

      <section className="rounded-[20px] border border-orange-400/20 bg-orange-500/[0.06] p-4 shadow-sm shadow-black/20 md:p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-orange-200">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-orange-200">Executive summary</p>
            <h2 className="mt-1 text-[18px] font-semibold leading-tight text-stone-50 md:text-2xl">Виконавче резюме</h2>
            <p className="mt-2 max-w-4xl text-[12px] leading-relaxed text-stone-300 md:text-sm">{data.directorSummaryText}</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <ReportKpiCard title="Усього заявок" value={data.totalTickets} subtitle="за період" icon={ClipboardList} />
        <ReportKpiCard title="Виконання" value={`${data.completionRate}%`} subtitle={`${data.completedTickets} виконано`} icon={CheckCircle2} tone="text-emerald-300" />
        <ReportKpiCard title="Невиконано" value={data.unresolvedTickets} subtitle="потребують контролю" icon={AlertTriangle} tone="text-amber-300" />
        <ReportKpiCard title="Проблемні" value={data.problematicTickets} subtitle="ризикові заявки" icon={LineChart} tone="text-red-300" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
        <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
          <div className="mb-3 flex items-center gap-2">
            <LineChart className="h-4 w-4 text-orange-300" />
            <h2 className="text-[14px] font-semibold text-stone-100">Динаміка звернень</h2>
          </div>
          <div className="flex h-32 items-end gap-1.5 overflow-hidden rounded-2xl bg-black/20 p-2">
            {data.weeklyTrend.map((point) => (
              <div key={point.iso} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="w-full max-w-7 rounded-t-lg bg-orange-500/80" style={{ height: Math.max(6, Math.round((point.count / maxTrend) * 84)) }} />
                <span className="text-[8px] text-stone-600">{point.label}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <h2 className="text-[14px] font-semibold text-stone-100">Висновки і рекомендації</h2>
          </div>
          <div className="space-y-2">
            {data.directorRecommendations.map((item) => (
              <p key={item} className="rounded-2xl border border-white/[0.07] bg-black/20 p-2.5 text-[12px] leading-relaxed text-stone-300">{item}</p>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-3 lg:grid-cols-2">
        <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
          <div className="mb-3 flex items-center gap-2"><Building2 className="h-4 w-4 text-orange-300" /><h2 className="text-[14px] font-semibold text-stone-100">Найпроблемніші магазини</h2></div>
          <div className="space-y-2">
            {data.topProblemObjects.length ? data.topProblemObjects.slice(0, 6).map((row, index) => (
              <div key={row.id} className="flex items-center gap-2 rounded-2xl bg-black/20 p-2.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[10px] font-semibold text-orange-200">{index + 1}</span>
                <div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-stone-100">{row.name}</p><p className="truncate text-[10px] text-stone-500">{row.subtitle ?? "Адресу не вказано"}</p></div>
                <span className="rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-stone-200">{row.count}</span>
              </div>
            )) : <p className="text-[11px] text-stone-500">Проблемних об'єктів за період не знайдено.</p>}
          </div>
        </article>

        <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
          <div className="mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-orange-300" /><h2 className="text-[14px] font-semibold text-stone-100">Робота виконавців</h2></div>
          <div className="space-y-2">
            {data.workerRows.filter((row) => row.assigned > 0).slice(0, 6).map((row) => (
              <div key={row.id} className="rounded-2xl bg-black/20 p-2.5">
                <div className="flex items-center justify-between gap-3"><p className="truncate text-[12px] font-semibold text-stone-100">{row.name}</p><span className="text-[10px] text-emerald-300">{row.efficiency}%</span></div>
                <p className="mt-1 text-[10px] text-stone-500">Призначено: {row.assigned} · Виконано: {row.completed} · Очікує: {row.waitingConfirmation}</p>
              </div>
            ))}
            {!data.workerRows.some((row) => row.assigned > 0) ? <p className="text-[11px] text-stone-500">Призначень виконавцям за період немає.</p> : null}
          </div>
        </article>
      </section>
    </div>
  );
}