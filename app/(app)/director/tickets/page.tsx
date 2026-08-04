import Link from "next/link";
import type { ReactNode } from "react";
import { Download, FileCheck2, Filter, Plus, Printer } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DirectorHeader } from "@/components/director/director-header";
import { DirectorHeroCard } from "@/components/director/director-hero-card";
import { DirectorTicketCard } from "@/components/director/director-ticket-card";
import { DirectorGlassCard, DirectorPageShell } from "@/components/director/director-shell";
import { parseDirectorTicketFilters, queryStringFromFilters, ticketPeriodLabel } from "@/lib/reports/director-export-filters";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorTicketReportMeta, getDirectorTicketsReport } from "@/lib/supabase/director-ticket-reports";

type Params = Record<string, string | string[] | undefined>;

function param(params: Params, key: string) {
  const value = params[key];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function DirectorTicketsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { profile } = await requireApprovedDirector();
  const params = await searchParams;
  const filters = parseDirectorTicketFilters(params);
  const tab = param(params, "tab") || "all";
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
  const rawTickets = ticketsResult.data;
  const tickets = rawTickets.filter((ticket) => {
    if (tab === "planned") return ticket.isInPlan;
    if (tab === "done") return ticket.status === "done";
    if (tab === "new") return ticket.status === "pending_review";
    return true;
  });
  const activeCount = rawTickets.filter((ticket) => !["done", "rejected", "cancelled"].includes(ticket.status)).length;
  const error = metaResult.error ?? ticketsResult.error;

  return (
    <DirectorPageShell>
      <DirectorHeader profile={profile} activeCount={activeCount} />
      <DirectorHeroCard profile={profile} objects={meta.objects} />

      {param(params, "success") === "created" ? <Alert title="Заявку створено">Заявку передано адміністратору на перевірку.</Alert> : null}
      {error ? <Alert title="Помилка">{error}</Alert> : null}
      {meta.objects.length === 0 ? <Alert title="Магазини ще не підтверджені">Ваші магазини ще не підтверджені адміністратором.</Alert> : null}

      <DirectorGlassCard className="p-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-black text-zinc-50">Мої заявки</h1>
            <p className="mt-1 text-xs text-zinc-500">Період: {ticketPeriodLabel(filters)}</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="h-9 rounded-2xl border-white/10 px-2 text-xs">
              <Link href={`/director/tickets/print${query}`}><Printer className="h-3.5 w-3.5" /></Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-9 rounded-2xl border-white/10 px-2 text-xs">
              <Link href={`/director/tickets/export${query}`}><Download className="h-3.5 w-3.5" /></Link>
            </Button>
            <Button asChild size="sm" className="h-9 rounded-2xl bg-orange-500 px-3 text-xs font-black text-black hover:bg-orange-400">
              <Link href="/director/tickets/new"><Plus className="h-3.5 w-3.5" /> Нова</Link>
            </Button>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          <Chip href="/director/tickets" active={tab === "all"}>Усі</Chip>
          <Chip href="/director/tickets?tab=new" active={tab === "new"}>Нові</Chip>
          <Chip href="/director/tickets?tab=planned" active={tab === "planned"}>У плані</Chip>
          <Chip href="/director/tickets?tab=done" active={tab === "done"}>Виконані</Chip>
        </div>
      </DirectorGlassCard>

      <DirectorGlassCard className="p-3">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold text-zinc-100">
          <Filter className="h-4 w-4 text-orange-300" />
          Фільтри
        </div>
        <form className="grid gap-2 md:grid-cols-4">
          <select name="object" defaultValue={filters.objectId ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі магазини</option>
            {meta.objects.map((object) => <option key={object.id} value={object.id}>{object.object_number} · {object.address || object.name}</option>)}
          </select>
          <select name="category" defaultValue={filters.categoryId ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі категорії</option>
            {meta.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <select name="status" defaultValue={filters.status ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі статуси</option>
            <option value="pending_review">Очікує перевірки</option>
            <option value="new">Підтверджена</option>
            <option value="assigned">Призначена</option>
            <option value="in_progress">В роботі</option>
            <option value="waiting_admin_confirmation">Очікує підтвердження</option>
            <option value="done">Виконана</option>
            <option value="rejected">Відхилена</option>
          </select>
          <select name="worker" defaultValue={filters.workerId ?? "all"} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100">
            <option value="all">Всі виконавці</option>
            {meta.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
          </select>
          <input name="createdFrom" type="date" defaultValue={param(params, "createdFrom")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <input name="createdTo" type="date" defaultValue={param(params, "createdTo")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <input name="completedFrom" type="date" defaultValue={param(params, "completedFrom")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <input name="completedTo" type="date" defaultValue={param(params, "completedTo")} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100" />
          <div className="flex gap-2 md:col-span-4">
            <Button className="h-11 rounded-2xl bg-orange-500 text-xs font-black text-black hover:bg-orange-400">Застосувати</Button>
            <Button asChild variant="outline" className="h-11 rounded-2xl border-white/10 text-xs"><Link href="/director/tickets">Скинути</Link></Button>
          </div>
        </form>
      </DirectorGlassCard>

      <section className="space-y-2.5">
        {tickets.length ? tickets.map((ticket) => <DirectorTicketCard key={ticket.id} ticket={ticket} />) : (
          <div className="rounded-[24px] border border-white/[0.08] bg-zinc-900/75 p-5 text-sm text-zinc-400">Заявок за вибраними фільтрами не знайдено.</div>
        )}
      </section>
    </DirectorPageShell>
  );
}

function Chip({ href, active, children }: { href: string; active: boolean; children: ReactNode }) {
  return (
    <Link href={href} className={active ? "rounded-xl border border-orange-400/40 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-300" : "rounded-xl border border-white/10 bg-white/[0.05] px-3 py-1.5 text-xs text-zinc-300"}>
      {children}
    </Link>
  );
}
