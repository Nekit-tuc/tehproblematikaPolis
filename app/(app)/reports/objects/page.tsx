import Link from "next/link";
import { AlertTriangle, Building2, CheckCircle2, ClipboardList, Search } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { ReportPageHeader, ReportBackButton, ReportExportButton } from "@/components/reports/report-page-header";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsExportHref, type ObjectReportRow } from "@/lib/supabase/report-queries";

export default async function ObjectsReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const q = (params.q ?? "").trim().toLowerCase();
  const rows = q ? data.objectRows.filter((row) => `${row.name} ${row.address}`.toLowerCase().includes(q)) : data.objectRows;
  const top = data.objectRows.slice(0, 3);
  return (
    <div className="page-shell mx-auto max-w-7xl space-y-4 pb-28 md:pb-8">
      {result.error ? <Alert title="Дані звіту завантажено частково">{result.error}</Alert> : null}
      <ReportPageHeader title="Звіт по об'єктах" subtitle="Проблемні магазини, виконання, категорії і середній час роботи." action={<> <ReportExportButton href={reportsExportHref("objects", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)} /> <ReportBackButton /> </>} />
      <ReportPeriodTabs basePath="/reports/objects" active={data.periodRange.period} from={data.periodRange.from} to={data.periodRange.to} label={data.periodRange.label} periodId={params.periodId} />
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4"><ReportKpiCard title="Об'єктів" value={data.objectCount} subtitle="у довіднику" icon={Building2} /><ReportKpiCard title="Заявок" value={data.totalTickets} subtitle="за період" icon={ClipboardList} /><ReportKpiCard title="Виконано" value={data.completedTickets} subtitle={`${data.completionRate}%`} icon={CheckCircle2} tone="text-emerald-300" /><ReportKpiCard title="Проблемні" value={data.problematicTickets} subtitle="по об'єктах" icon={AlertTriangle} tone="text-red-300" /></section>
      <section className="grid gap-3 md:grid-cols-3">{top.map((row) => <ObjectCard key={row.id} row={row} compact />)}</section>
      <form className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3"><input type="hidden" name="period" value={data.periodRange.period} /><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-stone-500" /><Input name="q" defaultValue={params.q ?? ""} placeholder="Пошук по об'єкту або адресі" className="h-9 rounded-2xl pl-9 text-[12px]" /></div></form>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.length ? rows.map((row) => <ObjectCard key={row.id} row={row} />) : <p className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[11px] text-stone-500">Об'єкти не знайдено.</p>}</section>
    </div>
  );
}

function ObjectCard({ row, compact = false }: { row: ObjectReportRow; compact?: boolean }) {
  return <article className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3"><div className="flex items-start gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[11px] font-semibold text-orange-200">{row.rank}</span><div className="min-w-0 flex-1"><h2 className="truncate text-[13px] font-semibold text-stone-100">{row.name}</h2><p className="truncate text-[10px] text-stone-500">{row.address}</p></div></div><div className="mt-3 grid grid-cols-3 gap-2"><Mini label="Всього" value={row.total} /><Mini label="Виконано" value={row.completed} /><Mini label="Проблем" value={row.problematic} /></div>{!compact ? <div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-emerald-500/10 px-2 py-1 text-emerald-200">{row.completionRate}% виконання</span><span className="rounded-full bg-white/[0.07] px-2 py-1 text-stone-300">{row.topCategory ?? "Без категорії"}</span><span className="rounded-full bg-white/[0.07] px-2 py-1 text-stone-300">{row.averageCompletionDays ?? "-"} днів</span></div> : null}</article>;
}
function Mini({ label, value }: { label: string; value: number | string }) { return <div className="rounded-2xl bg-black/20 p-2 text-center"><p className="text-lg font-semibold leading-none text-stone-50">{value}</p><p className="mt-1 text-[9px] text-stone-500">{label}</p></div>; }