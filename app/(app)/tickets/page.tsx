import Link from "next/link";
import type React from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  Hourglass,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Tag,
  Trash2,
  UserRound,
  XCircle,
} from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { MobileTicketSwitch } from "@/components/tickets/mobile-ticket-switch";
import { canHardDeleteTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { getCategories, getTickets } from "@/lib/supabase/queries";
import { formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, TicketWithRelations } from "@/types/domain";
import { hardDeleteTicketAction } from "./[id]/actions";

const uaStatusLabels: Record<TicketStatus, string> = {
  pending_review: "AI Review",
  new: "Нова",
  assigned: "Призначена",
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
  { value: "waiting_admin_confirmation", label: "Очікують адміна" },
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

const priorityRank: Record<TicketPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

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
  if (priority === "critical") return "border-red-400/20 bg-red-500/15 text-red-300";
  if (priority === "high") return "border-red-400/20 bg-red-500/15 text-red-300";
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

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    category?: string;
    priority?: string;
    sort?: string;
    q?: string;
    success?: string;
    error?: string;
    deleted?: string;
  }>;
}) {
  const { profile } = await requireAuth();
  const query = await searchParams;
  const [{ data: tickets, error }, categoriesResult] = await Promise.all([getTickets(), getCategories()]);
  const canDeleteTickets = canHardDeleteTicket(profile);

  const activeStatus: "all" | TicketStatus = statusFilters.some((filter) => filter.value === query.status)
    ? (query.status as "all" | TicketStatus)
    : "all";
  const activeCategory = query.category ?? "all";
  const activePriority: "all" | TicketPriority = priorityFilters.some((filter) => filter.value === query.priority)
    ? (query.priority as "all" | TicketPriority)
    : "all";
  const activeSort = query.sort === "priority_asc" ? "priority_asc" : query.sort === "priority_desc" ? "priority_desc" : "newest";
  const searchQuery = (query.q ?? "").trim().toLowerCase();

  const visibleTickets = [...tickets]
    .filter((ticket) => activeStatus === "all" || ticket.status === activeStatus)
    .filter((ticket) => activeCategory === "all" || ticket.category_id === activeCategory)
    .filter((ticket) => activePriority === "all" || ticket.priority === activePriority)
    .filter((ticket) => {
      if (!searchQuery) return true;
      const haystack = [
        ticket.number,
        ticket.title,
        ticket.description,
        ticket.object?.name,
        ticket.object?.address,
        ticket.category?.name,
        getWorkerName(ticket),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(searchQuery);
    })
    .sort((left, right) => {
      if (activeSort === "priority_desc") return priorityRank[right.priority] - priorityRank[left.priority];
      if (activeSort === "priority_asc") return priorityRank[left.priority] - priorityRank[right.priority];
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });

  const aiTicketsCount = tickets.filter(
    (ticket) =>
      ticket.status === "pending_review" &&
      (ticket.source === "telegram_group" || ticket.source === "telegram_private_test"),
  ).length;

  const ticketHref = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (activeStatus !== "all") params.set("status", activeStatus);
    if (activeCategory !== "all") params.set("category", activeCategory);
    if (activePriority !== "all") params.set("priority", activePriority);
    if (activeSort !== "newest") params.set("sort", activeSort);
    if (searchQuery) params.set("q", searchQuery);

    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "sort" && value === "newest") || (key === "q" && !value.trim())) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    }

    const search = params.toString();
    return search ? `/tickets?${search}` : "/tickets";
  };

  const returnTo = ticketHref({});

  return (
    <div className="page-shell max-w-full overflow-x-hidden pb-20 md:space-y-6 md:pb-0">
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
        </form>

        <MobileTicketSwitch active="tickets" aiCount={aiTicketsCount} />

        <details className="rounded-[14px] border border-white/10 bg-white/[0.035] p-0.5">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-[12px] font-semibold text-zinc-100">
            <span className="flex min-w-0 items-center gap-2">
              <Filter className="h-4 w-4 shrink-0 text-zinc-400" />
              <span>Фільтри</span>
            </span>
            <span className="flex items-center gap-1 text-[10px] text-zinc-400">
              {statusFilters.find((filter) => filter.value === activeStatus)?.label ?? "Всі"}
            </span>
          </summary>
          <div className="space-y-2 px-2 pb-2.5 pt-2">
            <FilterGroup title="Статус">
              {statusFilters.map((filter) => (
                <Button key={filter.value} asChild variant={activeStatus === filter.value ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]">
                  <Link href={ticketHref({ status: filter.value })}>{filter.label}</Link>
                </Button>
              ))}
            </FilterGroup>

            <FilterGroup title="Категорія">
              <Button asChild variant={activeCategory === "all" ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]">
                <Link href={ticketHref({ category: "all" })}>Всі</Link>
              </Button>
              {categoriesResult.data.map((category) => (
                <Button key={category.id} asChild variant={activeCategory === category.id ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]">
                  <Link href={ticketHref({ category: category.id })}>{category.name}</Link>
                </Button>
              ))}
            </FilterGroup>

            <FilterGroup title="Пріоритет">
              {priorityFilters.map((filter) => (
                <Button key={filter.value} asChild variant={activePriority === filter.value ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]">
                  <Link href={ticketHref({ priority: filter.value })}>{filter.label}</Link>
                </Button>
              ))}
            </FilterGroup>

            <FilterGroup title="Сортування">
              <Button asChild variant={activeSort === "newest" ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]">
                <Link href={ticketHref({ sort: "newest" })}>Нові спочатку</Link>
              </Button>
              <Button asChild variant={activeSort === "priority_desc" ? "default" : "outline"} size="sm" className="min-h-7 rounded-full px-2 text-[9px]">
                <Link href={ticketHref({ sort: "priority_desc" })}>Вищий пріоритет</Link>
              </Button>
            </FilterGroup>

            <Button asChild variant="outline" className="min-h-8 w-full rounded-lg text-[10px]">
              <Link href="/tickets">Скинути фільтри</Link>
            </Button>
          </div>
        </details>

        {error ? <Alert title="Не вдалося завантажити заявки">{error}</Alert> : null}
        {query.deleted === "1" || query.success === "deleted" ? (
          <Alert title="Заявку повністю видалено">Заявку та пов'язані записи прибрано з бази.</Alert>
        ) : null}
        {query.error ? <Alert title="Не вдалося видалити заявку">{query.error}</Alert> : null}

        <div className="space-y-2">
          {visibleTickets.map((ticket) => (
            <MobileTicketCard
              key={ticket.id}
              ticket={ticket}
              canDeleteTickets={canDeleteTickets}
              returnTo={returnTo}
            />
          ))}
          {visibleTickets.length === 0 ? (
            <div className="rounded-[16px] border border-white/10 bg-white/[0.035] p-3 text-[11px] text-zinc-400">
              Заявок за вибраними фільтрами немає.
            </div>
          ) : null}
        </div>
      </section>

      <section className="hidden space-y-6 md:block">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Заявки</h1>
            <p className="subtle">Фільтрація, контроль SLA та розподіл виконавців.</p>
          </div>
          <Button asChild>
            <Link href="/tickets/new">
              <Plus className="h-4 w-4" />
              Нова заявка
            </Link>
          </Button>
        </div>

        {error ? <Alert title="Не вдалося завантажити заявки">{error}</Alert> : null}
        {query.deleted === "1" || query.success === "deleted" ? (
          <Alert title="Заявку повністю видалено">Заявку та пов'язані записи прибрано з бази.</Alert>
        ) : null}
        {query.error ? <Alert title="Не вдалося видалити заявку">{query.error}</Alert> : null}

        <Card>
          <CardHeader>
            <CardTitle>Реєстр заявок</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {statusFilters.map((filter) => (
                <Button key={filter.value} asChild variant={activeStatus === filter.value ? "default" : "outline"} size="sm">
                  <Link href={ticketHref({ status: filter.value })}>{filter.label}</Link>
                </Button>
              ))}
            </div>
            {visibleTickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Заявок поки немає. Створіть першу заявку.</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Номер</TH>
                    <TH>Заявка</TH>
                    <TH>Об'єкт</TH>
                    <TH>Виконавець</TH>
                    <TH>Статус</TH>
                    <TH>Термін</TH>
                    {canDeleteTickets ? <TH>Дії</TH> : null}
                  </TR>
                </THead>
                <TBody>
                  {visibleTickets.map((ticket) => (
                    <TR key={ticket.id}>
                      <TD>
                        <Link className="font-medium text-orange-200 hover:underline" href={`/tickets/${ticket.id}`}>
                          {ticket.number}
                        </Link>
                      </TD>
                      <TD>
                        <div>{ticket.title}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>
                            {uaPriorityLabels[ticket.priority]} · {ticket.category?.name ?? "Без категорії"}
                          </span>
                          {ticket.telegram_source_group_id ? <Badge tone="gray">Групове повідомлення</Badge> : null}
                        </div>
                      </TD>
                      <TD>{ticket.object?.name ?? "-"}</TD>
                      <TD>{getWorkerName(ticket)}</TD>
                      <TD>
                        <Badge tone={statusTone(ticket.status)}>{uaStatusLabels[ticket.status]}</Badge>
                      </TD>
                      <TD>{formatDate(ticket.due_at)}</TD>
                      {canDeleteTickets ? (
                        <TD>
                          <form action={hardDeleteTicketAction.bind(null, ticket.id)}>
                            <input type="hidden" name="returnTo" value={returnTo} />
                            <ConfirmSubmitButton
                              type="submit"
                              variant="destructive"
                              size="sm"
                              message="Ви точно хочете повністю видалити заявку? Цю дію не можна скасувати."
                            >
                              <Trash2 className="h-4 w-4" />
                              Видалити
                            </ConfirmSubmitButton>
                          </form>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function MobileTicketCard({
  ticket,
  canDeleteTickets,
  returnTo,
}: {
  ticket: TicketWithRelations;
  canDeleteTickets: boolean;
  returnTo: string;
}) {
  const StatusIcon = statusIcon(ticket.status);

  return (
    <article className="relative overflow-hidden rounded-[17px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] shadow-[0_10px_26px_rgba(0,0,0,0.3)]">
      <div className={`absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b ${statusAccent(ticket.status)}`} />
      <Link href={`/tickets/${ticket.id}`} className="block px-3 py-2.5 active:bg-white/[0.04]">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[13px] font-bold leading-4 tracking-tight text-zinc-100">{ticket.number}</div>
            <h2 className="mt-1.5 line-clamp-2 text-[12px] font-semibold leading-4 text-zinc-100">{ticket.title}</h2>
          </div>
          <div className="flex shrink-0 items-start gap-2">
            <span className={`inline-flex min-h-5 items-center gap-1 rounded-lg border px-2 py-0.5 text-[9px] font-semibold ${priorityBadgeClass(ticket.priority)}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {uaPriorityLabels[ticket.priority]}
            </span>
            <MoreVertical className="mt-0.5 h-4 w-4 text-zinc-400" />
          </div>
        </div>

        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[10px] text-zinc-400">
          <MetaItem icon={MapPin} label={ticket.object?.address || ticket.object?.name || "Без об'єкта"} />
          <MetaItem icon={Tag} label={ticket.category?.name ?? "Без категорії"} />
          <MetaItem icon={UserRound} label={getWorkerName(ticket)} />
          <MetaItem icon={CalendarDays} label={formatShortDate(ticket.created_at)} />
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1">
          <span className={`inline-flex min-h-5 items-center gap-1 rounded-lg border px-2 py-0.5 text-[9px] font-semibold ${statusBadgeClass(ticket.status)}`}>
            <StatusIcon className="h-3 w-3" />
            {uaStatusLabels[ticket.status]}
          </span>
          {ticket.source === "telegram_private_test" ? (
            <span className="rounded-lg border border-blue-400/20 bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-300">
              Приватний тест
            </span>
          ) : ticket.telegram_source_group_id ? (
            <span className="rounded-lg border border-blue-400/20 bg-blue-500/15 px-2 py-0.5 text-[9px] font-semibold text-blue-300">
              AI Review
            </span>
          ) : null}
        </div>
      </Link>

      {canDeleteTickets ? (
        <form action={hardDeleteTicketAction.bind(null, ticket.id)} className="border-t border-white/10 p-2">
          <input type="hidden" name="returnTo" value={returnTo} />
          <ConfirmSubmitButton
            type="submit"
            variant="destructive"
            className="min-h-8 w-full rounded-lg text-[10px]"
            message="Ви точно хочете повністю видалити заявку? Цю дію не можна скасувати."
          >
            <Trash2 className="h-4 w-4" />
            Видалити
          </ConfirmSubmitButton>
        </form>
      ) : null}
    </article>
  );
}

function MetaItem({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Icon className="h-3 w-3 shrink-0 text-zinc-500" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
