import Link from "next/link";
import type React from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  Hourglass,
  MapPin,
  MoreVertical,
  Plus,
  Printer,
  Search,
  Tag,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { MobileTicketSwitch } from "@/components/tickets/mobile-ticket-switch";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { canHardDeleteTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { getPreviousWorkWeekRange, getWorkWeekRange } from "@/lib/date/work-week";
import { getCategories, getTicketsCount, getTicketsPage } from "@/lib/supabase/queries";
import { formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, TicketWithRelations } from "@/types/domain";
import { hardDeleteTicketAction } from "./[id]/actions";

const PAGE_SIZE = 20;

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function isDateParam(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

const uaStatusLabels: Record<TicketStatus, string> = {
  pending_review: "AI Review",
  new: "Нова",
  assigned: "Призначено",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "Очікує підтвердження",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const uaPriorityLabels: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

const statusFilters: Array<{ value: "all" | TicketStatus; label: string }> = [
  { value: "all", label: "Всі" },
  { value: "pending_review", label: "Очікує підтвердження" },
  { value: "new", label: "Нові" },
  { value: "assigned", label: "Призначені" },
  { value: "in_progress", label: "В роботі" },
  { value: "waiting", label: "Очікують" },
  { value: "waiting_admin_confirmation", label: "Підтвердження" },
  { value: "done", label: "Виконані" },
  { value: "cancelled", label: "Скасовані" },
  { value: "rejected", label: "Відхилені" },
];

const priorityFilters: Array<{ value: "all" | TicketPriority; label: string }> = [
  { value: "all", label: "Всі" },
  { value: "critical", label: "Критичний" },
  { value: "high", label: "Високий" },
  { value: "medium", label: "Середній" },
  { value: "low", label: "Низький" },
];

function statusTone(status: TicketStatus) {
  if (status === "done") return "green";
  if (status === "rejected" || status === "cancelled") return "red";
  if (status === "pending_review") return "gray";
  return "orange";
}

function statusAccent(status: TicketStatus) {
  if (status === "done") return "from-emerald-500 to-emerald-400";
  if (status === "rejected" || status === "cancelled") return "from-red-500 to-red-400";
  if (status === "pending_review") return "from-sky-500 to-sky-400";
  if (status === "waiting_admin_confirmation") return "from-amber-500 to-orange-400";
  return "from-orange-500 to-orange-400";
}

function statusBadgeClass(status: TicketStatus) {
  if (status === "done") return "border-emerald-400/20 bg-emerald-500/15 text-emerald-300";
  if (status === "rejected" || status === "cancelled") return "border-red-400/20 bg-red-500/15 text-red-300";
  if (status === "pending_review") return "border-sky-400/20 bg-sky-500/15 text-sky-300";
  if (status === "waiting_admin_confirmation") return "border-amber-400/20 bg-amber-500/15 text-amber-300";
  return "border-orange-400/20 bg-orange-500/15 text-orange-300";
}

function priorityBadgeClass(priority: TicketPriority) {
  if (priority === "critical" || priority === "high") return "border-red-400/20 bg-red-500/15 text-red-300";
  if (priority === "medium") return "border-orange-400/20 bg-orange-500/15 text-orange-300";
  return "border-amber-400/20 bg-amber-500/15 text-amber-300";
}

function statusIcon(status: TicketStatus) {
  if (status === "done") return CheckCircle2;
  if (status === "cancelled" || status === "rejected") return XCircle;
  if (status === "waiting_admin_confirmation") return Hourglass;
  return Clock3;
}

function getWorkerName(ticket: TicketWithRelations) {
  return ticket.worker?.name ?? ticket.assignee?.full_name ?? "Не призначено";
}

function formatShortDate(date: string | null | undefined) {
  if (!date) return "-";
  return new Intl.DateTimeFormat("uk-UA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function sourceLabel(source?: string | null) {
  if (source === "telegram_group") return "Telegram";
  if (source === "telegram_private_test") return "Telegram test";
  if (source === "viber") return "Viber";
  return "Manual";
}

function paginationPages(page: number, totalPages: number) {
  const set = new Set([1, totalPages, page - 1, page, page + 1].filter((item) => item >= 1 && item <= totalPages));
  return Array.from(set).sort((a, b) => a - b);
}

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    priority?: string;
    sort?: string;
    q?: string;
    page?: string;
    success?: string;
    error?: string;
    deleted?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const { profile } = await requireAuth();
  const query = await searchParams;
  const canDeleteTickets = canHardDeleteTicket(profile);

  const activeStatus: "all" | TicketStatus = statusFilters.some((filter) => filter.value === query.status)
    ? (query.status as "all" | TicketStatus)
    : "all";
  const activeCategory = query.category ?? "all";
  const activePriority: "all" | TicketPriority = priorityFilters.some((filter) => filter.value === query.priority)
    ? (query.priority as "all" | TicketPriority)
    : "all";
  const activeSort = query.sort === "priority_asc" ? "priority_asc" : query.sort === "priority_desc" ? "priority_desc" : "newest";
  const searchQuery = (query.q ?? "").trim();
  const activeFrom = isDateParam(query.from) ? query.from ?? "" : "";
  const activeTo = isDateParam(query.to) ? query.to ?? "" : "";
  const currentPage = Math.max(Number(query.page ?? 1) || 1, 1);

  const [ticketsPageResult, categoriesResult, aiTicketsCountResult] = await Promise.all([
    getTicketsPage({ status: activeStatus, category: activeCategory, priority: activePriority, sort: activeSort, q: searchQuery, from: activeFrom, to: activeTo, page: currentPage, limit: PAGE_SIZE }),
    getCategories(),
    getTicketsCount({ status: "pending_review", source: ["telegram_group", "telegram_private_test"] }),
  ]);

  const tickets = ticketsPageResult.data.tickets;
  const totalTickets = ticketsPageResult.data.total;
  const totalPages = Math.max(Math.ceil(totalTickets / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const shownFrom = totalTickets === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const shownTo = Math.min(safePage * PAGE_SIZE, totalTickets);
  const aiTicketsCount = aiTicketsCountResult.data;
  const error = ticketsPageResult.error ?? categoriesResult.error ?? aiTicketsCountResult.error;

  const ticketHref = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (activeStatus !== "all") params.set("status", activeStatus);
    if (activeCategory !== "all") params.set("category", activeCategory);
    if (activePriority !== "all") params.set("priority", activePriority);
    if (activeSort !== "newest") params.set("sort", activeSort);
    if (searchQuery) params.set("q", searchQuery);
    if (activeFrom) params.set("from", activeFrom);
    if (activeTo) params.set("to", activeTo);
    if (safePage > 1) params.set("page", String(safePage));

    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "sort" && value === "newest") || (key === "q" && !value.trim()) || ((key === "from" || key === "to") && !isDateParam(value))) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }
    if (Object.keys(updates).some((key) => key !== "page")) params.delete("page");

    const search = params.toString();
    return search ? `/tickets?${search}` : "/tickets";
  };

  const returnTo = ticketHref({ page: String(safePage) });
  const printHref = ticketHref({ page: undefined }).replace(/^\/tickets/, "/tickets/print");
  const exportHref = ticketHref({ page: undefined }).replace(/^\/tickets/, "/tickets/export");
  const currentWorkWeek = getWorkWeekRange();
  const previousWorkWeek = getPreviousWorkWeekRange();
  const periodLinks = {
    thisWeek: ticketHref({ from: currentWorkWeek.startDate, to: currentWorkWeek.endDate }),
    previousWeek: ticketHref({ from: previousWorkWeek.startDate, to: previousWorkWeek.endDate }),
    thisMonth: ticketHref({ from: toInputDate(startOfMonth()), to: toInputDate(endOfMonth()) }),
    clear: ticketHref({ from: undefined, to: undefined }),
  };

  return (
    <div className="page-shell max-w-full overflow-x-hidden pb-28 md:space-y-6 md:pb-0">
      <section className="space-y-2.5 md:hidden">
        <div className="space-y-1">
          <h1 className="text-[23px] font-semibold leading-none tracking-[-0.03em] text-zinc-100">Заявки</h1>
          <p className="text-[11px] leading-4 text-zinc-400">Фільтрація, контроль SLA та розподіл виконавців.</p>
        </div>

        <form action="/tickets" className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            name="q"
            defaultValue={query.q ?? ""}
            placeholder="Пошук заявок..."
            className="h-10 w-full rounded-[14px] border border-white/10 bg-white/[0.055] pl-9 pr-3 text-[11px] text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-orange-400/50"
          />
          {activeStatus !== "all" ? <input type="hidden" name="status" value={activeStatus} /> : null}
          {activeCategory !== "all" ? <input type="hidden" name="category" value={activeCategory} /> : null}
          {activePriority !== "all" ? <input type="hidden" name="priority" value={activePriority} /> : null}
          {activeSort !== "newest" ? <input type="hidden" name="sort" value={activeSort} /> : null}
          {activeFrom ? <input type="hidden" name="from" value={activeFrom} /> : null}
          {activeTo ? <input type="hidden" name="to" value={activeTo} /> : null}
        </form>

        <MobileTicketSwitch active="tickets" aiCount={aiTicketsCount} />

        <details className="rounded-[14px] border border-white/10 bg-white/[0.035] p-0.5">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-[12px] font-semibold text-zinc-100">
            <span className="flex min-w-0 items-center gap-2"><Filter className="h-4 w-4 shrink-0 text-zinc-400" />Фільтри</span>
            <span className="text-[10px] text-zinc-400">{statusFilters.find((filter) => filter.value === activeStatus)?.label ?? "Всі"}</span>
          </summary>
          <div className="space-y-2 px-2 pb-2.5 pt-2">
            <FilterGroup title="Статус">{statusFilters.map((filter) => <FilterButton key={filter.value} href={ticketHref({ status: filter.value })} active={activeStatus === filter.value}>{filter.label}</FilterButton>)}</FilterGroup>
            <FilterGroup title="Категорія">
              <FilterButton href={ticketHref({ category: "all" })} active={activeCategory === "all"}>Всі</FilterButton>
              {categoriesResult.data.map((category) => <FilterButton key={category.id} href={ticketHref({ category: category.id })} active={activeCategory === category.id}>{category.name}</FilterButton>)}
            </FilterGroup>
            <FilterGroup title="Категорія">{priorityFilters.map((filter) => <FilterButton key={filter.value} href={ticketHref({ priority: filter.value })} active={activePriority === filter.value}>{filter.label}</FilterButton>)}</FilterGroup>
            <FilterGroup title="Сортування">
              <FilterButton href={ticketHref({ sort: "newest" })} active={activeSort === "newest"}>Нові спочатку</FilterButton>
              <FilterButton href={ticketHref({ sort: "priority_desc" })} active={activeSort === "priority_desc"}>Вищий пріоритет</FilterButton>
            </FilterGroup>
            <PeriodFilterForm activeFrom={activeFrom} activeTo={activeTo} searchQuery={searchQuery} activeStatus={activeStatus} activeCategory={activeCategory} activePriority={activePriority} activeSort={activeSort} />
            <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
              <FilterButton href={periodLinks.thisWeek} active={false}>Цей тиждень</FilterButton>
              <FilterButton href={periodLinks.previousWeek} active={false}>Минулий тиждень</FilterButton>
              <FilterButton href={periodLinks.thisMonth} active={false}>Цей місяць</FilterButton>
              <FilterButton href={periodLinks.clear} active={!activeFrom && !activeTo}>Очистити</FilterButton>
            </div>
            <Button asChild variant="secondary" className="min-h-8 w-full rounded-lg text-[10px]"><Link href={printHref}><Printer className="h-3.5 w-3.5" />Друк звіту</Link></Button>
            <Button asChild variant="outline" className="min-h-8 w-full rounded-lg text-[10px]"><Link href={exportHref}>Excel</Link></Button>
            <Button asChild variant="outline" className="min-h-8 w-full rounded-lg text-[10px]"><Link href="/tickets">Скинути фільтри</Link></Button>
          </div>
        </details>

        <TicketsMessages error={error} queryError={query.error} deleted={query.deleted === "1" || query.success === "deleted"} />
        <PaginationBar page={safePage} total={totalTickets} totalPages={totalPages} shownFrom={shownFrom} shownTo={shownTo} hrefForPage={(page) => ticketHref({ page: String(page) })} />

        <div className="space-y-2">
          {tickets.map((ticket) => <MobileTicketCard key={ticket.id} ticket={ticket} canDeleteTickets={canDeleteTickets} returnTo={returnTo} />)}
          {tickets.length === 0 ? <EmptyTickets /> : null}
        </div>
      </section>

      <section className="hidden space-y-6 md:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><h1 className="text-2xl font-semibold">Заявки</h1><p className="subtle">Фільтрація, контроль SLA та розподіл виконавців.</p></div>
          <Button asChild><Link href="/tickets/new"><Plus className="h-4 w-4" />Нова заявка</Link></Button>
        </div>
        <TicketsMessages error={error} queryError={query.error} deleted={query.deleted === "1" || query.success === "deleted"} />
        <Card>
          <CardHeader><CardTitle>Список заявок</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">{statusFilters.map((filter) => <Button key={filter.value} asChild variant={activeStatus === filter.value ? "default" : "outline"} size="sm"><Link href={ticketHref({ status: filter.value })}>{filter.label}</Link></Button>)}</div>
            <div className="rounded-2xl border border-white/[0.08] bg-black/20 p-3">
              <div className="flex flex-wrap items-end gap-2">
                <PeriodFilterForm activeFrom={activeFrom} activeTo={activeTo} searchQuery={searchQuery} activeStatus={activeStatus} activeCategory={activeCategory} activePriority={activePriority} activeSort={activeSort} />
                <Button asChild variant="outline" size="sm"><Link href={periodLinks.thisWeek}>Цей тиждень</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href={periodLinks.previousWeek}>Минулий тиждень</Link></Button>
                <Button asChild variant="outline" size="sm"><Link href={periodLinks.thisMonth}>Цей місяць</Link></Button>
                <Button asChild variant="ghost" size="sm"><Link href={periodLinks.clear}>Очистити</Link></Button>
                <Button asChild size="sm"><Link href={printHref}><Printer className="h-4 w-4" />Друк звіту</Link></Button>
                <Button asChild variant="secondary" size="sm"><Link href={exportHref}>Excel</Link></Button>
              </div>
            </div>
            <PaginationBar page={safePage} total={totalTickets} totalPages={totalPages} shownFrom={shownFrom} shownTo={shownTo} hrefForPage={(page) => ticketHref({ page: String(page) })} />
            {tickets.length === 0 ? <p className="text-sm text-muted-foreground">Заявок поки немає. Спробуйте змінити фільтри.</p> : (
              <Table>
                <THead><TR><TH>Номер</TH><TH>Заявка</TH><TH>Об'єкт</TH><TH>Виконавець</TH><TH>Статус</TH><TH>Дедлайн</TH><TH>Дії</TH></TR></THead>
                <TBody>{tickets.map((ticket) => <DesktopTicketRow key={ticket.id} ticket={ticket} canDeleteTickets={canDeleteTickets} returnTo={returnTo} />)}</TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function TicketsMessages({ error, queryError, deleted }: { error?: string | null; queryError?: string; deleted: boolean }) {
  return <>
    {error ? <Alert title="Не вдалося виконати дію">{error}</Alert> : null}
    {deleted ? <Alert title="Заявку повністю видалено">Заявку та пов'язані записи видалено з бази.</Alert> : null}
    {queryError ? <Alert title="Не вдалося завантажити дані">{queryError}</Alert> : null}
  </>;
}

function PeriodFilterForm({ activeFrom, activeTo, searchQuery, activeStatus, activeCategory, activePriority, activeSort }: { activeFrom: string; activeTo: string; searchQuery: string; activeStatus: "all" | TicketStatus; activeCategory: string; activePriority: "all" | TicketPriority; activeSort: string }) {
  return (
    <form action="/tickets" className="flex w-full flex-wrap items-end gap-2 md:w-auto">
      {searchQuery ? <input type="hidden" name="q" value={searchQuery} /> : null}
      {activeStatus !== "all" ? <input type="hidden" name="status" value={activeStatus} /> : null}
      {activeCategory !== "all" ? <input type="hidden" name="category" value={activeCategory} /> : null}
      {activePriority !== "all" ? <input type="hidden" name="priority" value={activePriority} /> : null}
      {activeSort !== "newest" ? <input type="hidden" name="sort" value={activeSort} /> : null}
      <label className="min-w-[130px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:flex-none">
        Від
        <input type="date" name="from" defaultValue={activeFrom} className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-white/[0.055] px-2 text-[11px] text-zinc-100 outline-none focus:border-orange-400/50" />
      </label>
      <label className="min-w-[130px] flex-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 md:flex-none">
        До
        <input type="date" name="to" defaultValue={activeTo} className="mt-1 h-9 w-full rounded-xl border border-white/10 bg-white/[0.055] px-2 text-[11px] text-zinc-100 outline-none focus:border-orange-400/50" />
      </label>
      <Button type="submit" size="sm" className="h-9 rounded-xl text-[11px]">Застосувати</Button>
    </form>
  );
}

function PaginationBar({ page, total, totalPages, shownFrom, shownTo, hrefForPage }: { page: number; total: number; totalPages: number; shownFrom: number; shownTo: number; hrefForPage: (page: number) => string }) {
  if (totalPages <= 1 && total === 0) return null;
  const pages = paginationPages(page, totalPages);
  return (
    <div className="max-w-full rounded-[14px] border border-white/10 bg-white/[0.035] p-2">
      <div className="mb-2 text-[10px] text-zinc-400">Показано {shownFrom}-{shownTo} із {total}</div>
      <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
        {pages.map((item, index) => (
          <div key={item} className="flex items-center gap-1.5">
            {index > 0 && item - pages[index - 1] > 1 ? <span className="text-[10px] text-zinc-500">...</span> : null}
            <Button asChild variant={item === page ? "default" : "outline"} className="h-8 min-w-8 rounded-[10px] px-2 text-[10px]"><Link href={hrefForPage(item)}>{item}</Link></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatRepeatDate(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function RepeatBadge({ ticket }: { ticket: TicketWithRelations }) {
  const repeatCount = ticket.repeat_count ?? 0;
  if (repeatCount <= 0) return null;
  const lastRepeat = formatRepeatDate(ticket.last_repeat_at);
  return (
    <span className="inline-flex min-h-5 items-center gap-1 rounded-lg border border-orange-400/25 bg-orange-500/10 px-2 py-0.5 text-[9px] font-semibold text-orange-200 md:text-xs">
      {"Повторна · "}{repeatCount}{lastRepeat ? <span className="font-normal text-orange-200/70">{"Ост. "}{lastRepeat}</span> : null}
    </span>
  );
}

function DesktopTicketRow({ ticket, canDeleteTickets, returnTo }: { ticket: TicketWithRelations; canDeleteTickets: boolean; returnTo: string }) {
  return (
    <TR>
      <TD><Link className="font-medium text-orange-200 hover:underline" href={"/tickets/" + ticket.id}>{ticket.number}</Link></TD>
      <TD>
        <div>{ticket.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{uaPriorityLabels[ticket.priority]} {"·"} {ticket.category?.name ?? "Без категорії"}</span>
          {ticket.telegram_source_group_id ? <Badge tone="gray">{"Групове повідомлення"}</Badge> : null}
          <RepeatBadge ticket={ticket} />
        </div>
      </TD>
      <TD>{ticket.object?.name ?? "-"}</TD>
      <TD>{getWorkerName(ticket)}</TD>
      <TD><Badge tone={statusTone(ticket.status)}>{uaStatusLabels[ticket.status]}</Badge></TD>
      <TD>{formatDate(ticket.due_at)}</TD>
      <TD><TicketActionsMenu ticket={ticket} canDeleteTickets={canDeleteTickets} returnTo={returnTo} /></TD>
    </TR>
  );
}

function MobileTicketCard({ ticket, canDeleteTickets, returnTo }: { ticket: TicketWithRelations; canDeleteTickets: boolean; returnTo: string }) {
  const StatusIcon = statusIcon(ticket.status);
  return (
    <article className="relative overflow-visible rounded-[17px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] shadow-[0_10px_26px_rgba(0,0,0,0.3)]">
      <div className={`absolute inset-y-0 left-0 w-[3px] rounded-l-[17px] bg-gradient-to-b ${statusAccent(ticket.status)}`} />
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <Link href={`/tickets/${ticket.id}`} className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-4 tracking-tight text-zinc-100">{ticket.number}</div>
            <h2 className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-4 text-zinc-100">{ticket.title}</h2>
          </Link>
          <div className="flex shrink-0 items-start gap-2">
            <span className={`inline-flex min-h-5 items-center gap-1 rounded-lg border px-2 py-0.5 text-[9px] font-semibold ${priorityBadgeClass(ticket.priority)}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{uaPriorityLabels[ticket.priority]}</span>
            <TicketActionsMenu ticket={ticket} canDeleteTickets={canDeleteTickets} returnTo={returnTo} />
          </div>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-zinc-400">
          <MetaItem icon={MapPin} label={ticket.object?.address || ticket.object?.name || "Без об'єкта"} />
          <MetaItem icon={Tag} label={ticket.category?.name ?? "Без категорії"} />
          <MetaItem icon={UserRound} label={getWorkerName(ticket)} />
          <MetaItem icon={CalendarDays} label={formatShortDate(ticket.created_at)} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className={`inline-flex min-h-5 items-center gap-1 rounded-lg border px-2 py-0.5 text-[9px] font-semibold ${statusBadgeClass(ticket.status)}`}><StatusIcon className="h-3 w-3" />{uaStatusLabels[ticket.status]}</span>
          <span className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-semibold text-zinc-300">{sourceLabel(ticket.source)} ? {getWorkerName(ticket)}</span>
          <RepeatBadge ticket={ticket} />
          {ticket.source === "telegram_private_test" ? <span className="rounded-lg border border-blue-400/20 bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-300">Приватний тест</span> : ticket.telegram_source_group_id ? <span className="rounded-lg border border-blue-400/20 bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-300">AI Review</span> : null}
        </div>
      </div>
    </article>
  );
}

function TicketActionsMenu({ ticket, canDeleteTickets, returnTo }: { ticket: TicketWithRelations; canDeleteTickets: boolean; returnTo: string }) {
  return (
    <details className="group relative">
      <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-[10px] border border-white/10 bg-white/[0.04] text-zinc-300"><MoreVertical className="h-4 w-4" /></summary>
      <div className="absolute right-0 top-9 z-30 w-40 rounded-[12px] border border-white/[0.10] bg-[#111]/95 p-1.5 shadow-2xl shadow-black/40">
        <Button asChild variant="ghost" className="h-8 w-full justify-start rounded-[10px] px-2 text-[11px]"><Link href={`/tickets/${ticket.id}`}><Eye className="h-3.5 w-3.5" />Відкрити</Link></Button>
        {canDeleteTickets ? (
          <form action={hardDeleteTicketAction.bind(null, ticket.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <ConfirmSubmitButton type="submit" variant="ghost" className="h-8 w-full justify-start rounded-[10px] px-2 text-[11px] text-red-300 hover:bg-red-500/10" message="Ви точно хочете повністю видалити заявку? Цю дію не можна скасувати." pendingText="Видаляємо...">
              <Trash2 className="h-3.5 w-3.5" />Видалити
            </ConfirmSubmitButton>
          </form>
        ) : null}
      </div>
    </details>
  );
}

function EmptyTickets() {
  return <div className="rounded-[16px] border border-white/10 bg-white/[0.035] p-3 text-[11px] text-zinc-400">Заявок за поточними фільтрами немає.</div>;
}

function MetaItem({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <div className="flex min-w-0 items-center gap-2"><Icon className="h-3 w-3 shrink-0 text-zinc-500" /><span className="min-w-0 truncate">{label}</span></div>;
}

function FilterButton({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Button asChild variant={active ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]"><Link href={href}>{children}</Link></Button>;
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="space-y-2"><div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}
