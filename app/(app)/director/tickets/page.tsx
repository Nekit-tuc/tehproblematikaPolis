import Link from "next/link";
import { ClipboardList, Download, FileCheck2, Filter, MapPin, Plus, Printer, Store, Tag, UserRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApprovedDirector } from "@/lib/auth/server";
import { directorStatusToneForBadge } from "@/lib/director/director-ticket-status";
import { parseDirectorTicketFilters, queryStringFromFilters, ticketPeriodLabel } from "@/lib/reports/director-export-filters";
import { getDirectorTicketReportMeta, getDirectorTicketsReport } from "@/lib/supabase/director-ticket-reports";
import { formatDate } from "@/lib/utils";

type Params = Record<string, string | string[] | undefined>;

function param(params: Params, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function DirectorTicketsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { profile } = await requireApprovedDirector();
  const params = await searchParams;
  const filters = parseDirectorTicketFilters(params);
  const query = queryStringFromFilters({
    object: filters.objectId,
    category: filters.categoryId,
    worker: filters.workerId,
    status: filters.status,
    createdFrom: filters.createdFrom,
    createdTo: filters.createdTo,
    completedFrom: filters.completedFrom,
    completedTo: filters.completedTo,
  });
  const [metaResult, ticketsResult] = await Promise.all([
    getDirectorTicketReportMeta(profile.id),
    getDirectorTicketsReport(profile.id, filters),
  ]);
  const meta = metaResult.data;
  const tickets = ticketsResult.data;
  const error = metaResult.error ?? ticketsResult.error;
  const hasObjects = meta.objects.length > 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 px-4 pb-32 pt-4 md:px-6 md:pt-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Кабінет директора</p>
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-50 md:text-3xl">Мої заявки</h1>
            <p className="mt-1 text-sm text-zinc-400">Заявки по магазинах, прив'язаних до вашого профілю.</p>
            <p className="mt-2 text-xs text-zinc-500">Період: {ticketPeriodLabel(filters)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs">
              <Link href="/director/acts"><FileCheck2 className="h-4 w-4" /> Акти</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs">
              <Link href={`/director/tickets/print${query}`}><Printer className="h-4 w-4" /> Друк</Link>
            </Button>
            <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs">
              <Link href={`/director/tickets/export${query}`}><Download className="h-4 w-4" /> Excel заявок</Link>
            </Button>
            <Button asChild disabled={!hasObjects} className="h-10 rounded-2xl bg-orange-500 px-3 text-xs font-bold text-black hover:bg-orange-400">
              <Link href="/director/tickets/new"><Plus className="h-4 w-4" /> Нова</Link>
            </Button>
          </div>
        </div>
      </section>

      {param(params, "success") === "created" ? <Alert title="Заявку створено">Заявку передано адміністратору на перевірку.</Alert> : null}
      {error ? <Alert title="Помилка">{error}</Alert> : null}
      {!hasObjects ? <Alert title="Магазини ще не підтверджені">Ваші магазини ще не підтверджені адміністратором.</Alert> : null}

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Filter className="h-4 w-4 text-orange-300" />
            Фільтри заявок
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 md:grid-cols-4">
            <select name="object" defaultValue={filters.objectId ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі магазини</option>
              {meta.objects.map((object) => <option key={object.id} value={object.id}>{object.object_number} · {object.address || object.name}</option>)}
            </select>
            <select name="category" defaultValue={filters.categoryId ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі категорії</option>
              {meta.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select name="status" defaultValue={filters.status ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі статуси</option>
              <option value="pending_review">Очікує перевірки</option>
              <option value="new">Підтверджена</option>
              <option value="assigned">Призначена</option>
              <option value="in_progress">В роботі</option>
              <option value="waiting_admin_confirmation">Очікує підтвердження</option>
              <option value="done">Виконана</option>
              <option value="rejected">Відхилена</option>
            </select>
            <select name="worker" defaultValue={filters.workerId ?? "all"} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
              <option value="all">Всі виконавці</option>
              {meta.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
            </select>
            <input name="createdFrom" type="date" defaultValue={param(params, "createdFrom")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <input name="createdTo" type="date" defaultValue={param(params, "createdTo")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <input name="completedFrom" type="date" defaultValue={param(params, "completedFrom")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <input name="completedTo" type="date" defaultValue={param(params, "completedTo")} className="h-10 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
            <div className="flex gap-2 md:col-span-4">
              <Button className="h-10 rounded-2xl bg-orange-500 text-xs font-bold text-black hover:bg-orange-400">Застосувати</Button>
              <Button asChild variant="outline" className="h-10 rounded-2xl border-white/10 text-xs"><Link href="/director/tickets">Скинути</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Store className="h-4 w-4 text-orange-300" />
            Ваші магазини
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {meta.objects.length === 0 ? <p className="text-sm text-zinc-400">До вашого профілю ще не прив'язано підтверджені магазини.</p> : null}
          {meta.objects.map((object) => (
            <div key={object.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-semibold text-zinc-100">{object.name ?? "Магазин"}</div>
              <div className="mt-1 flex items-start gap-2 text-xs text-zinc-400">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-300" />
                {object.address ?? "Адресу не вказано"}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-zinc-50">Заявки</h2>
          <Badge tone="orange" className="rounded-full px-3 py-1 text-xs">{tickets.length} заявок</Badge>
        </div>
        {tickets.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-sm text-zinc-400">
            Заявок за вибраними фільтрами не знайдено.
          </div>
        ) : null}
        <div className="grid gap-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/director/tickets/${ticket.id}`} className="block rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4 transition active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-orange-300">{ticket.number}</div>
                  <h3 className="mt-1 line-clamp-2 text-base font-bold text-zinc-50">{ticket.title}</h3>
                </div>
                <Badge tone={directorStatusToneForBadge(ticket.status === "done" ? "green" : ticket.status === "rejected" ? "red" : "orange")} className="shrink-0 rounded-full px-2 py-1 text-[10px]">
                  {ticket.displayStatus}
                </Badge>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs text-zinc-400">
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-300" />
                  <span className="truncate">{ticket.object?.address ?? ticket.object?.name ?? "Магазин"}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-orange-300" />
                  <span className="truncate">{ticket.category?.name ?? "Без категорії"}</span>
                </span>
                {ticket.worker ? (
                  <span className="flex min-w-0 items-center gap-2">
                    <UserRound className="h-3.5 w-3.5 shrink-0 text-orange-300" />
                    <span className="truncate">{ticket.worker.name}</span>
                  </span>
                ) : null}
                {ticket.isInPlan ? (
                  <span className="flex min-w-0 items-center gap-2 text-orange-200">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Додана в план виконання</span>
                  </span>
                ) : null}
                {ticket.workCompletionAct ? (
                  <span className="flex min-w-0 items-center gap-2 text-emerald-200">
                    <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Акт створено: {ticket.workCompletionAct.act_number}</span>
                  </span>
                ) : ticket.status === "waiting_admin_confirmation" ? (
                  <span className="flex min-w-0 items-center gap-2 text-amber-200">
                    <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Очікує вашого підтвердження виконання</span>
                  </span>
                ) : null}
                <span className="text-zinc-500">Створено: {formatDate(ticket.created_at)}</span>
                {ticket.workCompletionAct ? (
                  <span className="inline-flex w-fit items-center gap-1 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                    <Download className="h-3 w-3" />
                    Акт Excel доступний у заявці
                  </span>
                ) : null}
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
