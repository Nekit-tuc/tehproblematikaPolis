import { AlertTriangle, CheckCircle2, ClipboardList, Clock } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { ReportPageHeader, ReportBackButton, ReportExportButton } from "@/components/reports/report-page-header";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { ReportTicketTable } from "@/components/reports/report-table";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsExportHref } from "@/lib/supabase/report-queries";

export default async function WeeklyReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const returnParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) returnParams.set(key, value);
  }
  const returnTo = returnParams.toString() ? `/reports/weekly?${returnParams.toString()}` : "/reports/weekly";
  return (
    <div className="page-shell mx-auto max-w-7xl space-y-4 pb-28 md:pb-8">
      {result.error ? <Alert title="Дані звіту завантажено частково">{result.error}</Alert> : null}
      <ReportPageHeader title="Тижневий звіт" subtitle="Контроль виконаних, невиконаних і заявок на підтвердженні." action={<> <ReportExportButton href={reportsExportHref("weekly", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)} /> <ReportBackButton /> </>} />
      <ReportPeriodTabs basePath="/reports/weekly" active={data.periodRange.period} from={data.periodRange.from} to={data.periodRange.to} label={data.periodRange.label} periodId={params.periodId} />
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
        <ReportKpiCard title="Усього" value={data.totalTickets} subtitle="створено за період" icon={ClipboardList} />
        <ReportKpiCard title="Виконано" value={data.completedTickets} subtitle={`${data.completionRate}% виконання`} icon={CheckCircle2} tone="text-emerald-300" />
        <ReportKpiCard title="Не виконано" value={data.unresolvedTickets} subtitle="активні заявки" icon={AlertTriangle} tone="text-amber-300" />
        <ReportKpiCard title="Проблемні" value={data.problematicTickets} subtitle="перенесені / ризикові" icon={Clock} tone="text-red-300" />
      </section>
      <ReportTicketTable title="Виконані заявки" rows={data.tickets.completed} empty="Виконаних заявок за період немає." returnTo={returnTo} />
      <ReportTicketTable title="Невиконані заявки" rows={data.tickets.unresolved} empty="Невиконаних заявок за період немає." returnTo={returnTo} />
      <ReportTicketTable title="Очікують підтвердження" rows={data.tickets.waitingConfirmation} empty="Заявок на підтвердженні немає." returnTo={returnTo} />
      <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 text-[12px] leading-relaxed text-stone-300">{data.directorSummaryText}</section>
    </div>
  );
}
