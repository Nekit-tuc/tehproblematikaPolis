import Link from "next/link";
import type React from "react";
import { AlertTriangle, ArrowRight, BarChart3, BriefcaseBusiness, Building2, CalendarDays, CheckCircle2, ClipboardList, Download, FileSpreadsheet, LineChart, PieChart, Users } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsExportHref, reportsPeriodHref, type ReportsDashboardData, type ReportsPeriod, type ReportsTopRow } from "@/lib/supabase/report-queries";
import { cn } from "@/lib/utils";

const periodTabs: Array<{ value: ReportsPeriod; label: string }> = [
  { value: "this_week", label: "Цей тиждень" },
  { value: "previous_week", label: "Минулий" },
  { value: "month", label: "Місяць" },
  { value: "custom", label: "Період" },
];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const updatedAt = new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  const reportHref = (path: string) => reportsPeriodHref(path, data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId);

  return (
    <div className="page-shell relative mx-auto max-w-7xl overflow-hidden pb-28 md:pb-8">
      <div className="pointer-events-none absolute left-1/2 top-0 h-56 w-56 -translate-x-1/2 rounded-full bg-orange-500/10 blur-3xl" />
      <div className="relative space-y-4 md:space-y-5">
        {result.error ? <Alert title="Не вдалося підготувати дані для звітів">{result.error}</Alert> : null}

        <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-sm shadow-black/20 backdrop-blur md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.30em] text-orange-300">POLISSYA</p>
              <h1 className="mt-1 text-[24px] font-semibold leading-tight text-stone-50 md:text-3xl">Звіти</h1>
              <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-stone-400 md:text-sm">Аналітика заявок, виконавців і магазинів</p>
              <p className="mt-2 text-[10px] text-stone-500">Оновлено сьогодні, {updatedAt}</p>
            </div>
            <Button asChild size="sm" className="h-9 rounded-2xl text-[11px]"><a href={reportsExportHref("weekly", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId)}><Download className="h-3.5 w-3.5" />{"\u0415\u043A\u0441\u043F\u043E\u0440\u0442 CSV"}</a></Button>
          </div>
        </section>

        <PeriodSelector active={data.periodRange.period} from={data.periodRange.from} to={data.periodRange.to} />

        <section className="grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3">
          <KpiCard title="Усього заявок" value={data.totalTickets} subtitle="за період" icon={ClipboardList} tone="text-orange-300" />
          <KpiCard title="Виконано" value={data.completedTickets} subtitle={`${data.completionRate}% від створених`} icon={CheckCircle2} tone="text-emerald-300" />
          <KpiCard title="Не виконано" value={data.unresolvedTickets} subtitle="активні в роботі" icon={AlertTriangle} tone="text-amber-300" />
          <KpiCard title="Проблемні" value={data.problematicTickets} subtitle="ризикові / старші 7 днів" icon={LineChart} tone="text-red-300" />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1.15fr_0.85fr]">
          <WeeklyReportCard data={data} periodId={params.periodId} />
          <DirectorSummaryCard data={data} />
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReportTypeCard title="По об'єктах" description="Аналіз заявок і виконання по магазинах" value={data.objectCount} meta={data.topProblemObjects[0] ? `Топ: ${data.topProblemObjects[0].name}` : "Проблем не знайдено"} icon={Building2} href={reportHref("/reports/objects")} />
          <ReportTypeCard title="По виконавцях" description="Ефективність і навантаження виконавців" value={data.workerCount} meta={data.topWorkers[0] ? `Лідер навантаження: ${data.topWorkers[0].name}` : "Призначень немає"} icon={BriefcaseBusiness} href={reportHref("/reports/workers")} />
          <ReportTypeCard title="По категоріях" description="Розподіл заявок по категоріях" value={data.categoryCount} meta={data.topCategories[0] ? `Топ: ${data.topCategories[0].name}` : "Заявок немає"} icon={PieChart} href={reportHref("/reports/categories")} />
          <ReportTypeCard title="Звіт для директора" description="Ключові показники для керівництва" value={data.completionRate} suffix="%" meta="Готовий до формування" icon={Users} href={reportHref("/reports/director")} />
        </section>

        <section className="grid gap-3 lg:grid-cols-[1fr_1fr]">
          <TopProblemObjectsCard rows={data.topProblemObjects} total={Math.max(1, data.problematicTickets)} />
          <div className="grid gap-3">
            <CompactRanking id="categories-summary" title="Категорії" rows={data.topCategories} empty="За період немає заявок по категоріях." />
            <CompactRanking id="workers-summary" title="Виконавці" rows={data.topWorkers} empty="За період немає призначених виконавців." />
          </div>
        </section>
      </div>
    </div>
  );
}

function PeriodSelector({ active, from, to }: { active: ReportsPeriod; from: string; to: string }) {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/[0.08] bg-black/20 p-1">
        {periodTabs.map((tab) => (
          <Link key={tab.value} href={tab.value === "custom" ? `/reports?period=custom&from=${from}&to=${to}` : `/reports?period=${tab.value}`} className={cn("shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold text-stone-400 transition", active === tab.value && "bg-orange-500 text-black")}>{tab.label}</Link>
        ))}
      </div>
      {active === "custom" ? (
        <form className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="period" value="custom" />
          <Field label="Від"><Input name="from" type="date" defaultValue={from} className="h-9 rounded-2xl text-[12px]" /></Field>
          <Field label="До"><Input name="to" type="date" defaultValue={to} className="h-9 rounded-2xl text-[12px]" /></Field>
          <div className="flex items-end"><Button type="submit" size="sm" className="h-9 rounded-2xl text-[11px]">Застосувати</Button></div>
        </form>
      ) : null}
    </section>
  );
}

function KpiCard({ title, value, subtitle, icon: Icon, tone }: { title: string; value: number; subtitle: string; icon: React.ElementType; tone: string }) {
  return (
    <article className="min-w-0 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20 backdrop-blur">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="min-w-0 text-[11px] font-medium leading-tight text-stone-300">{title}</p>
        <Icon className={cn("h-4 w-4 shrink-0", tone)} />
      </div>
      <p className="text-[24px] font-semibold leading-none text-stone-50 md:text-[28px]">{value}</p>
      <p className="mt-1 text-[10px] leading-snug text-stone-500">{subtitle}</p>
    </article>
  );
}

function WeeklyReportCard({ data, periodId }: { data: ReportsDashboardData; periodId?: string | null }) {
  const max = Math.max(1, ...data.weeklyTrend.map((point) => point.count));
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20" id="objects-summary">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-orange-300" /><h2 className="text-[14px] font-semibold text-stone-100">Тижневий звіт</h2></div>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">Підсумки роботи за обраний період: динаміка, ключові показники та тренди.</p>
          <p className="mt-2 text-[10px] text-orange-200">{data.periodRange.label}</p>
        </div>
        <FileSpreadsheet className="h-5 w-5 shrink-0 text-stone-400" />
      </div>
      <div className="mt-4 flex h-24 items-end gap-1.5 overflow-hidden rounded-2xl bg-black/20 p-2">
        {data.weeklyTrend.map((point) => <div key={point.iso} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1"><div className="w-full max-w-6 rounded-t-lg bg-orange-500/80" style={{ height: Math.max(6, Math.round((point.count / max) * 62)) }} /><span className="text-[8px] text-stone-600">{point.label}</span></div>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button asChild size="sm" className="h-9 rounded-2xl text-[11px]"><Link href="/weekly-control">Відкрити</Link></Button>
        <Button asChild variant="outline" size="sm" className="h-9 rounded-2xl text-[11px]"><a href={reportsExportHref("weekly", data.periodRange.period, data.periodRange.from, data.periodRange.to, periodId)}>{"\u0415\u043A\u0441\u043F\u043E\u0440\u0442"}</a></Button>
      </div>
    </section>
  );
}

function DirectorSummaryCard({ data }: { data: ReportsDashboardData }) {
  return (
    <section id="director-summary" className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
      <div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-orange-300" /><h2 className="text-[14px] font-semibold text-stone-100">Звіт для директора</h2></div>
      <p className="mt-3 rounded-2xl border border-white/[0.07] bg-black/20 p-3 text-[12px] leading-relaxed text-stone-300">{data.directorSummaryText}</p>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Mini label="Виконання" value={`${data.completionRate}%`} />
        <Mini label="Проблемні" value={String(data.problematicTickets)} />
        <Mini label="Об'єкти" value={String(data.objectCount)} />
      </div>
    </section>
  );
}

function ReportTypeCard({ title, description, value, meta, icon: Icon, href, suffix = "" }: { title: string; description: string; value: number; meta: string; icon: React.ElementType; href: string; suffix?: string }) {
  return (
    <Link href={href} className="block min-w-0 rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20 active:bg-white/[0.06]">
      <Icon className="h-4 w-4 text-orange-300" />
      <h3 className="mt-2 text-[13px] font-semibold text-stone-100">{title}</h3>
      <p className="mt-1 text-[10px] leading-relaxed text-stone-500">{description}</p>
      <div className="mt-3 flex items-end justify-between gap-3"><div><p className="text-xl font-semibold leading-none text-stone-50">{value}{suffix}</p><p className="mt-1 line-clamp-1 text-[10px] text-stone-500">{meta}</p></div><ArrowRight className="h-4 w-4 shrink-0 text-stone-500" /></div>
    </Link>
  );
}

function TopProblemObjectsCard({ rows, total }: { rows: ReportsTopRow[]; total: number }) {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-[14px] font-semibold text-stone-100">Топ проблемних магазинів</h2><Button asChild variant="ghost" size="sm" className="h-8 text-[10px]"><Link href="/objects">Всі магазини</Link></Button></div>
      <div className="space-y-2">
        {rows.length ? rows.map((row, index) => <ProblemObjectRow key={row.id} row={row} rank={index + 1} total={total} />) : <p className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[11px] text-stone-500">Проблемних магазинів за період не знайдено.</p>}
      </div>
    </section>
  );
}

function ProblemObjectRow({ row, rank, total }: { row: ReportsTopRow; rank: number; total: number }) {
  const width = Math.max(6, Math.round((row.count / total) * 100));
  return <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-2.5"><div className="flex items-start gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500/15 text-[10px] font-semibold text-orange-200">{rank}</span><div className="min-w-0 flex-1"><p className="truncate text-[12px] font-semibold text-stone-100">{row.name}</p><p className="truncate text-[10px] text-stone-500">{row.subtitle ?? "Адресу не вказано"}</p></div><span className="shrink-0 text-[11px] font-semibold text-orange-200">{row.count}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]"><div className="h-full rounded-full bg-orange-500" style={{ width: `${width}%` }} /></div></div>;
}

function CompactRanking({ id, title, rows, empty }: { id: string; title: string; rows: ReportsTopRow[]; empty: string }) {
  return <section id={id} className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20"><h2 className="text-[14px] font-semibold text-stone-100">{title}</h2><div className="mt-3 space-y-2">{rows.length ? rows.map((row) => <div key={row.id} className="flex items-center justify-between gap-3 rounded-2xl bg-black/20 px-2.5 py-2"><span className="min-w-0 truncate text-[11px] text-stone-300">{row.name}</span><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-stone-200">{row.count}</span></div>) : <p className="text-[11px] text-stone-500">{empty}</p>}</div></section>;
}

function Mini({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl bg-black/20 p-2 text-center"><p className="text-lg font-semibold leading-none text-stone-50">{value}</p><p className="mt-1 text-[9px] leading-tight text-stone-500">{label}</p></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] text-stone-400">{label}</Label>{children}</div>;
}