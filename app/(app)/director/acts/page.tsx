import Link from "next/link";
import { Download, FileCheck2, Filter, MapPin, Printer, Tag, UserRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApprovedDirector } from "@/lib/auth/server";
import { actPeriodLabel, parseActFilters, queryStringFromFilters } from "@/lib/reports/director-export-filters";
import { getDirectorActFilterMeta, getDirectorActs } from "@/lib/supabase/work-completion-acts";
import { formatDate } from "@/lib/utils";

type Params = Record<string, string | string[] | undefined>;

function text(value?: string | null) {
  return value || "-";
}

function filterValue(params: Params, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-32 pt-4 md:px-6 md:pt-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Кабінет директора</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-50 md:text-3xl">Акти виконаних робіт</h1>
            <p className="mt-1 text-sm text-zinc-400">Перегляд і завантаження актів по ваших магазинах.</p>
            <p className="mt-2 text-xs text-zinc-500">Період: {actPeriodLabel(filters, "current_month")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs">
              <Link href={`/director/tickets`}>Заявки</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs">
              <Link href={`/director/acts/print${query}`}><Printer className="h-4 w-4" /> Друк</Link>
            </Button>
            <Button asChild className="h-10 rounded-2xl bg-orange-500 text-xs font-bold text-black hover:bg-orange-400">
              <Link href={`/director/acts/export${query}`}><Download className="h-4 w-4" /> Excel</Link>
            </Button>
          </div>
        </div>
      </section>

      {error ? <Alert title="Помилка">{error}</Alert> : null}

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Filter className="h-4 w-4 text-orange-300" />
            Фільтри
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4">
            <select name="period" defaultValue={filters.period ?? "current_month"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="current_month">Поточний місяць</option>
              <option value="this_week">Поточний тиждень</option>
              <option value="previous_week">Попередній тиждень</option>
              <option value="custom">Власний період</option>
            </select>
            <select name="object" defaultValue={filters.objectId ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі магазини</option>
              {meta.objects.map((object) => <option key={object.id} value={object.id}>{object.object_number} · {object.address || object.name}</option>)}
            </select>
            <select name="category" defaultValue={filters.categoryId ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі категорії</option>
              {meta.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select name="worker" defaultValue={filters.workerId ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі виконавці</option>
              {meta.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
            </select>
            <input name="completedFrom" type="date" defaultValue={filterValue(params, "completedFrom")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <input name="completedTo" type="date" defaultValue={filterValue(params, "completedTo")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <input name="createdFrom" type="date" defaultValue={filterValue(params, "createdFrom")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <input name="createdTo" type="date" defaultValue={filterValue(params, "createdTo")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <div className="flex gap-2 md:col-span-4">
              <Button className="h-10 rounded-2xl bg-orange-500 text-xs font-bold text-black hover:bg-orange-400">Застосувати</Button>
              <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs"><Link href="/director/acts">Скинути</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-zinc-50">Список актів</h2>
          <Badge tone="orange" className="rounded-full px-3 py-1 text-xs">{acts.length} актів</Badge>
        </div>
        {acts.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-sm text-zinc-400">Актів за вибраний період не знайдено.</div>
        ) : null}
        <div className="grid gap-3">
          {acts.map((act) => (
            <article key={act.id} className="rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="green" className="rounded-full">{act.act_number}</Badge>
                    <span className="text-xs font-bold text-orange-300">{act.ticket?.number}</span>
                  </div>
                  <h3 className="mt-2 line-clamp-2 text-base font-bold text-zinc-50">{act.work_description}</h3>
                </div>
                <Button asChild variant="outline" size="sm" className="h-9 shrink-0 rounded-2xl border-white/10 text-xs">
                  <Link href={`/director/tickets/${act.ticket_id}/act/export`}><Download className="h-3.5 w-3.5" /> Excel</Link>
                </Button>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs text-zinc-400 md:grid-cols-2">
                <span className="flex min-w-0 items-center gap-2"><MapPin className="h-3.5 w-3.5 shrink-0 text-orange-300" /><span className="truncate">{text(act.object?.address ?? act.object?.name)}</span></span>
                <span className="flex min-w-0 items-center gap-2"><Tag className="h-3.5 w-3.5 shrink-0 text-orange-300" /><span className="truncate">{text(act.ticket?.category?.name)}</span></span>
                <span className="flex min-w-0 items-center gap-2"><UserRound className="h-3.5 w-3.5 shrink-0 text-orange-300" /><span className="truncate">{text(act.worker?.name)}</span></span>
                <span className="flex min-w-0 items-center gap-2"><FileCheck2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" /><span className="truncate">Виконано: {formatDate(act.completed_at)}</span></span>
                <span className="text-zinc-500">Підтверджено: {formatDate(act.confirmed_at)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button asChild variant="ghost" size="sm" className="h-9 rounded-2xl px-2 text-xs text-zinc-300">
                  <Link href={`/director/tickets/${act.ticket_id}`}>Відкрити заявку</Link>
                </Button>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
