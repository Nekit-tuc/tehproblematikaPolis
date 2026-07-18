import { AlertTriangle, BriefcaseBusiness, CheckCircle2, Clock, ShieldCheck } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ReportKpiCard } from "@/components/reports/report-kpi-card";
import { ReportPageHeader, ReportBackButton, ReportExportButton } from "@/components/reports/report-page-header";
import { ReportPeriodTabs } from "@/components/reports/report-period-tabs";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsExportHref, type WorkerReportRow } from "@/lib/supabase/report-queries";

export default async function WorkersReportPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const top = data.workerRows.filter((row) => row.assigned > 0).slice(0, 3);
  return (
    <div className="page-shell mx-auto max-w-7xl space-y-4 pb-28 md:pb-8">
      {result.error ? <Alert title="Дані звіту завантажено частково">{result.error}</Alert> : null}
      <ReportPageHeader title="Звіт по виконавцях" subtitle="Навантаження, виконання, SLA та заявки на підтвердженні." action={<> <ReportExportButton href={reportsExportHref("workers", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)} /> <ReportBackButton /> </>} />
      <ReportPeriodTabs basePath="/reports/workers" active={data.periodRange.period} from={data.periodRange.from} to={data.periodRange.to} label={data.periodRange.label} periodId={params.periodId} />
      <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4"><ReportKpiCard title="Виконавців" value={data.workerCount} subtitle="у довіднику" icon={BriefcaseBusiness} /><ReportKpiCard title="Призначено" value={data.workerRows.reduce((sum, row) => sum + row.assigned, 0)} subtitle="заявок" icon={Clock} /><ReportKpiCard title="Виконано" value={data.completedTickets} subtitle={`${data.completionRate}%`} icon={CheckCircle2} tone="text-emerald-300" /><ReportKpiCard title="На підтвердженні" value={data.waitingConfirmationTickets} subtitle="очікує адміна" icon={ShieldCheck} tone="text-amber-300" /></section>
      <section className="grid gap-3 md:grid-cols-3">{top.length ? top.map((row, index) => <WorkerCard key={row.id} row={row} rank={index + 1} featured />) : <Empty text="Немає виконавців із призначеннями за період." />}</section>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{data.workerRows.map((row, index) => <WorkerCard key={row.id} row={row} rank={index + 1} />)}</section>
    </div>
  );
}

function WorkerCard({ row, rank, featured = false }: { row: WorkerReportRow; rank: number; featured?: boolean }) {
  return <article className={`rounded-[18px] border ${featured ? "border-orange-400/25 bg-orange-500/[0.06]" : "border-white/[0.08] bg-white/[0.035]"} p-3`}><div className="flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-orange-500/15 text-[12px] font-bold text-orange-200">{row.initials}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><h2 className="truncate text-[13px] font-semibold text-stone-100">{row.name}</h2>{featured ? <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-bold text-black">TOP {rank}</span> : null}</div><p className="text-[10px] text-stone-500">Ефективність {row.efficiency}% · SLA {row.slaRate ?? "-"}%</p></div></div><div className="mt-3 grid grid-cols-4 gap-2"><Mini label="Признач." value={row.assigned} /><Mini label="Викон." value={row.completed} /><Mini label="Актив." value={row.unresolved} /><Mini label="Підтв." value={row.waitingConfirmation} /></div><div className="mt-3 flex flex-wrap gap-2 text-[10px]"><span className="rounded-full bg-white/[0.07] px-2 py-1 text-stone-300">Середній час: {row.averageCompletionDays ?? "-"} днів</span></div></article>;
}
function Mini({ label, value }: { label: string; value: number | string }) { return <div className="rounded-2xl bg-black/20 p-2 text-center"><p className="text-base font-semibold leading-none text-stone-50">{value}</p><p className="mt-1 text-[8px] text-stone-500">{label}</p></div>; }
function Empty({ text }: { text: string }) { return <p className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[11px] text-stone-500 md:col-span-3">{text}</p>; }