import { AlertTriangle, CheckCircle2, ClipboardList, PieChart } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { ReportPageHeader, ReportBackButton, ReportExportButton } from "@/components/reports/report-page-header";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsExportHref, type CategoryReportRow } from "@/lib/supabase/report-queries";

export default async function CategoriesReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const max = Math.max(1, ...data.categoryRows.map((row) => row.total));
  return (
    <div className="page-shell mx-auto max-w-7xl space-y-4 pb-28 md:pb-8">
      {result.error ? <Alert title="Дані звіту завантажено частково">{result.error}</Alert> : null}
      <ReportPageHeader title="Звіт по категоріях" subtitle="Розподіл заявок, виконання і топ об'єкти для кожної категорії." action={<> <ReportExportButton href={reportsExportHref("categories", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)} /> <ReportBackButton /> </>} />
      <ReportPeriodTabs basePath="/reports/categories" active={data.periodRange.period} from={data.periodRange.from} to={data.periodRange.to} label={data.periodRange.label} periodId={params.periodId} />
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4"><ReportKpiCard title="Категорій" value={data.categoryCount} subtitle="активних" icon={PieChart} /><ReportKpiCard title="Заявок" value={data.totalTickets} subtitle="за період" icon={ClipboardList} /><ReportKpiCard title="Виконано" value={data.completedTickets} subtitle={`${data.completionRate}%`} icon={CheckCircle2} tone="text-emerald-300" /><ReportKpiCard title="Не виконано" value={data.unresolvedTickets} subtitle="активних" icon={AlertTriangle} tone="text-amber-300" /></section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.categoryRows.map((row) => <CategoryCard key={row.id} row={row} max={max} />)}</section>
    </div>
  );
}

function CategoryCard({ row, max }: { row: CategoryReportRow; max: number }) {
  const width = Math.max(4, Math.round((row.total / max) * 100));
  return <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-[13px] font-semibold text-stone-100">{row.name}</h2><p className="mt-1 text-[10px] text-stone-500">{row.completionRate}% виконання</p></div><span className="shrink-0 rounded-full bg-orange-500/15 px-2 py-1 text-[10px] text-orange-200">{row.total}</span></div><div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-orange-500" style={{ width: `${width}%` }} /></div><div className="mt-3 grid grid-cols-3 gap-2"><Mini label="Викон." value={row.completed} /><Mini label="Актив." value={row.unresolved} /><Mini label="%" value={`${row.completionRate}`} /></div><div className="mt-3 space-y-1">{row.topObjects.length ? row.topObjects.map((item) => <div key={item.id} className="flex justify-between gap-2 rounded-xl bg-black/20 px-2 py-1.5 text-[10px]"><span className="truncate text-stone-400">{item.name}</span><span className="text-stone-300">{item.count}</span></div>) : <p className="text-[10px] text-stone-500">Топ об'єктів немає.</p>}</div></article>;
}
function Mini({ label, value }: { label: string; value: number | string }) { return <div className="rounded-2xl bg-black/20 p-2 text-center"><p className="text-base font-semibold leading-none text-stone-50">{value}</p><p className="mt-1 text-[8px] text-stone-500">{label}</p></div>; }