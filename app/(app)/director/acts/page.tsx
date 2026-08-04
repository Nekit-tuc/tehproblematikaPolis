import Link from "next/link";
import { Download, FileCheck2, Filter, MapPin, Printer, Tag, UserRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DirectorHeader } from "@/components/director/director-header";
import { DirectorGlassCard, DirectorPageShell } from "@/components/director/director-shell";
import { actPeriodLabel, parseActFilters, queryStringFromFilters } from "@/lib/reports/director-export-filters";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorActFilterMeta, getDirectorActs } from "@/lib/supabase/work-completion-acts";
import { formatDate } from "@/lib/utils";

type Params = Record<string, string | string[] | undefined>;

function value(params: Params, key: string) {
  const raw = params[key];
  return Array.isArray(raw) ? raw[0] ?? "" : raw ?? "";
}

function text(value?: string | null) {
  return value || "-";
}

export default async function DirectorActsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { profile } = await requireApprovedDirector();
  const params = await searchParams;
  const filters = parseActFilters(params, "current_month");
  const query = queryStringFromFilters({
    period: filters.period,
    object: filters.objectId,
    category: filters.categoryId,
    worker: filters.workerId,
    completedFrom: filters.completedFrom,
    completedTo: filters.completedTo,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
  });
  const [actsResult, metaResult] = await Promise.all([getDirectorActs(profile.id, filters), getDirectorActFilterMeta(profile.id)]);
  const acts = actsResult.data;
  const meta = metaResult.data;
  const error = actsResult.error ?? metaResult.error;

  return (
    <DirectorPageShell>
      <DirectorHeader profile={profile} activeCount={0} />

      <DirectorGlassCard className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Акти</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-50">Акти виконаних робіт</h1>
            <p className="mt-1 text-sm text-zinc-400">Період: {actPeriodLabel(filters, "current_month")}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="h-10 rounded-2xl border-white/10 px-2 text-xs">
              <Link href={`/director/acts/print${query}`}><Printer className="h-4 w-4" /></Link>
            </Button>
            <Button asChild size="sm" className="h-10 rounded-2xl bg-orange-500 px-3 text-xs font-black text-black hover:bg-orange-400">
              <Link href={`/director/acts/export${query}`}><Download className="h-4 w-4" /> Excel</Link>
            </Button>
          </div>
        </div>
      </DirectorGlassCard>

      {error ? <Alert title="Помилка">{error}</Alert> : null}

      <DirectorGlassCard className="p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-100">
          <Filter className="h-4 w-4 text-orange-300" />
          Фільтри актів
        </div>
        <form className="grid gap-2 md:grid-cols-4">
          <select name="period" defaultValue={filters.period ?? "current_month"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="current_month">Поточний місяць</option>
            <option value="this_week">Поточний тиждень</option>
            <option value="previous_week">Попередній тиждень</option>
            <option value="custom">Власний період</option>
          </select>
          <select name="object" defaultValue={filters.objectId ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі магазини</option>
            {meta.objects.map((object) => <option key={object.id} value={object.id}>{object.object_number} · {object.address || object.name}</option>)}
          </select>
          <select name="category" defaultValue={filters.categoryId ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі категорії</option>
            {meta.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select name="worker" defaultValue={filters.workerId ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі виконавці</option>
            {meta.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
          </select>
          <input name="completedFrom" type="date" defaultValue={value(params, "completedFrom")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <input name="completedTo" type="date" defaultValue={value(params, "completedTo")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <input name="createdFrom" type="date" defaultValue={value(params, "createdFrom")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <input name="createdTo" type="date" defaultValue={value(params, "createdTo")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <div className="flex gap-2 md:col-span-4">
            <Button className="h-11 rounded-2xl bg-orange-500 text-xs font-black text-black hover:bg-orange-400">Застосувати</Button>
            <Button asChild variant="outline" className="h-11 rounded-2xl border-white/10 text-xs"><Link href="/director/acts">Скинути</Link></Button>
          </div>
        </form>
      </DirectorGlassCard>

      <section className="space-y-2.5">
        {acts.length ? acts.map((act) => (
          <article key={act.id} className="rounded-[24px] border border-white/[0.08] bg-zinc-900/75 p-4 shadow-[0_14px_34px_rgba(0,0,0,0.32)] backdrop-blur-xl">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-emerald-400/20 bg-emerald-500/12 px-2.5 py-1 text-xs font-black text-emerald-300">{act.act_number}</span>
                  <span className="text-xs font-bold text-orange-300">{act.ticket?.number}</span>
                </div>
                <h2 className="mt-2 line-clamp-2 text-base font-black text-zinc-50">{act.work_description}</h2>
              </div>
              <Link href={`/director/tickets/${act.ticket_id}/act/export`} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-300">
                <Download className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-3 grid gap-1.5 text-xs text-zinc-400">
              <span className="flex min-w-0 items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-orange-300" /><span className="truncate">{text(act.object?.address ?? act.object?.name)}</span></span>
              <span className="flex min-w-0 items-center gap-2"><Tag className="h-3.5 w-3.5 shrink-0 text-orange-300" /><span className="truncate">{text(act.ticket?.category?.name)}</span></span>
              <span className="flex min-w-0 items-center gap-2"><UserRound className="h-3.5 w-3.5 shrink-0 text-orange-300" /><span className="truncate">{text(act.worker?.name)}</span></span>
              <span>Виконано: {formatDate(act.completed_at)}</span>
              <span>Підтверджено: {formatDate(act.confirmed_at)}</span>
            </div>
            <div className="mt-3 flex justify-end">
              <Link href={`/director/tickets/${act.ticket_id}`} className="rounded-xl border border-orange-400/30 px-3 py-1.5 text-xs font-bold text-orange-300">Відкрити заявку</Link>
            </div>
          </article>
        )) : (
          <div className="rounded-[24px] border border-white/[0.08] bg-zinc-900/75 p-5 text-sm text-zinc-400">Актів за вибраний період не знайдено.</div>
        )}
      </section>
    </DirectorPageShell>
  );
}
