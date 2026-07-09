import Link from "next/link";
import type React from "react";
import { ArrowRight, Filter, Plus, Trash2 } from "lucide-react";
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
import { priorityLabels, statusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/types/domain";
import { hardDeleteTicketAction } from "./[id]/actions";

const statusFilters: Array<{ value: "all" | TicketStatus; label: string }> = [
  { value: "all", label: "Всі" },
  { value: "pending_review", label: "Очікує підтвердження" },
  { value: "new", label: "Нова" },
  { value: "assigned", label: "Призначена" },
  { value: "in_progress", label: "В роботі" },
  { value: "waiting", label: "Очікує" },
  { value: "waiting_admin_confirmation", label: "Очікує підтвердження виконання" },
  { value: "done", label: "Виконана" },
  { value: "cancelled", label: "Скасована" },
  { value: "rejected", label: "Відхилена" },
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

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string; priority?: string; sort?: string; success?: string; error?: string; deleted?: string; view?: string }>;
}) {
  const { profile } = await requireAuth();
  const query = await searchParams;
  const [{ data: tickets, error }, categoriesResult] = await Promise.all([getTickets(), getCategories()]);
  const canDeleteTickets = canHardDeleteTicket(profile);
  const activeStatus: "all" | TicketStatus = statusFilters.some((filter) => filter.value === query.status) ? (query.status as "all" | TicketStatus) : "all";
  const activeCategory = query.category ?? "all";
  const activePriority: "all" | TicketPriority = priorityFilters.some((filter) => filter.value === query.priority) ? (query.priority as "all" | TicketPriority) : "all";
  const activeSort = query.sort === "priority_asc" ? "priority_asc" : query.sort === "priority_desc" ? "priority_desc" : "newest";
  const mobileView = query.view === "table" ? "table" : "cards";
  const priorityRank: Record<TicketPriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const visibleTickets = [...tickets]
    .filter((ticket) => activeStatus === "all" || ticket.status === activeStatus)
    .filter((ticket) => activeCategory === "all" || ticket.category_id === activeCategory)
    .filter((ticket) => activePriority === "all" || ticket.priority === activePriority)
    .sort((left, right) => {
      if (activeSort === "priority_desc") return priorityRank[right.priority] - priorityRank[left.priority];
      if (activeSort === "priority_asc") return priorityRank[left.priority] - priorityRank[right.priority];
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  const ticketHref = (updates: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    if (activeStatus !== "all") params.set("status", activeStatus);
    if (activeCategory !== "all") params.set("category", activeCategory);
    if (activePriority !== "all") params.set("priority", activePriority);
    if (activeSort !== "newest") params.set("sort", activeSort);
    if (mobileView === "table") params.set("view", "table");
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "sort" && value === "newest") || (key === "view" && value === "cards")) params.delete(key);
      else params.set(key, value);
    }
    const search = params.toString();
    return search ? `/tickets?${search}` : "/tickets";
  };
  const returnTo = ticketHref({});
  const viewHref = (view: "cards" | "table") => ticketHref({ view });

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Заявки</h1>
          <p className="subtle">Фільтрація, контроль SLA та розподіл виконавців.</p>
        </div>
        <Button asChild className="hidden md:inline-flex"><Link href="/tickets/new"><Plus className="h-4 w-4" />Нова заявка</Link></Button>
      </div>
      {error ? <Alert title="Не вдалося завантажити заявки">{error}</Alert> : null}
      {query.deleted === "1" ? <Alert title="Заявку повністю видалено">Заявку та пов'язані записи прибрано з бази.</Alert> : null}
      {query.error ? <Alert title="Не вдалося видалити заявку">{query.error}</Alert> : null}
      {query.success === "deleted" ? <Alert title="Заявку повністю видалено">Заявку та пов'язані записи прибрано з бази.</Alert> : null}
      <MobileTicketSwitch active="tickets" />
      <details className="mobile-card p-3 md:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-orange-200">
          Вигляд
          <span className="text-xs text-stone-500">{mobileView === "table" ? "Таблиця" : "Картки"}</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild variant={mobileView === "cards" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
            <Link href={viewHref("cards")}>Картки</Link>
          </Button>
          <Button asChild variant={mobileView === "table" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
            <Link href={viewHref("table")}>Таблиця</Link>
          </Button>
        </div>
      </details>
      <div className="space-y-4 md:hidden">
        <details className="mobile-card p-4">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-medium">
            <span className="flex items-center gap-2"><Filter className="h-4 w-4 text-orange-300" />Фільтри</span>
            <span className="text-xs text-stone-500">{statusFilters.find((filter) => filter.value === activeStatus)?.label}</span>
          </summary>
          <div className="mt-4 space-y-4">
            <FilterGroup title="Статус">
              {statusFilters.map((filter) => (
                <Button key={filter.value} asChild variant={activeStatus === filter.value ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                  <Link href={ticketHref({ status: filter.value })}>{filter.label}</Link>
                </Button>
              ))}
            </FilterGroup>
            <FilterGroup title="Категорії">
              <Button asChild variant={activeCategory === "all" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                <Link href={ticketHref({ category: "all" })}>Всі</Link>
              </Button>
              {categoriesResult.data.map((category) => (
                <Button key={category.id} asChild variant={activeCategory === category.id ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                  <Link href={ticketHref({ category: category.id })}>{category.name}</Link>
                </Button>
              ))}
            </FilterGroup>
            <FilterGroup title="Пріоритет">
              {priorityFilters.map((filter) => (
                <Button key={filter.value} asChild variant={activePriority === filter.value ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                  <Link href={ticketHref({ priority: filter.value })}>{filter.label}</Link>
                </Button>
              ))}
            </FilterGroup>
            <FilterGroup title="Сортування">
              <Button asChild variant={activeSort === "newest" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                <Link href={ticketHref({ sort: "newest" })}>Нові спочатку</Link>
              </Button>
              <Button asChild variant={activeSort === "priority_desc" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                <Link href={ticketHref({ sort: "priority_desc" })}>Спочатку високі</Link>
              </Button>
              <Button asChild variant={activeSort === "priority_asc" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
                <Link href={ticketHref({ sort: "priority_asc" })}>Спочатку низькі</Link>
              </Button>
            </FilterGroup>
            <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl">
              <Link href={mobileView === "table" ? "/tickets?view=table" : "/tickets"}>Скинути</Link>
            </Button>
          </div>
        </details>

        {mobileView === "table" ? (
          <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
            <table className="w-full min-w-[920px] text-left text-xs">
              <thead className="bg-white/[0.04] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">№</th>
                  <th className="px-3 py-3">Об'єкт</th>
                  <th className="px-3 py-3">Опис заявки</th>
                  <th className="px-3 py-3">Категорія</th>
                  <th className="px-3 py-3">Статус</th>
                  <th className="px-3 py-3">Пріоритет</th>
                  <th className="px-3 py-3">Виконавець</th>
                  <th className="px-3 py-3 text-right">Дії</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {visibleTickets.map((ticket) => (
                  <tr key={ticket.id}>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-orange-200">{ticket.number}</td>
                    <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.object?.name ?? "-"}</div></td>
                    <td className="max-w-[220px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.description}</div></td>
                    <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.category?.name ?? "-"}</div></td>
                    <td className="px-3 py-3"><Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge></td>
                    <td className="px-3 py-3"><Badge tone={ticket.priority === "critical" || ticket.priority === "high" ? "orange" : "gray"}>{priorityLabels[ticket.priority]}</Badge></td>
                    <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.assignee?.full_name ?? "-"}</div></td>
                    <td className="px-3 py-3 text-right">
                      <Button asChild size="sm" variant="outline" className="rounded-2xl">
                        <Link href={`/tickets/${ticket.id}`}>Відкрити</Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
        <div className="space-y-2">
          {visibleTickets.map((ticket) => (
            <div key={ticket.id} className="mobile-card overflow-hidden">
              <Link href={`/tickets/${ticket.id}`} className="block p-4 active:bg-white/5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-semibold text-orange-300">{ticket.number}</span>
                      {ticket.telegram_source_group_id ? <Badge tone="gray">Telegram</Badge> : null}
                    </div>
                    <h2 className="mt-2 line-clamp-2 text-base font-semibold">{ticket.title}</h2>
                    <p className="mt-2 line-clamp-2 text-sm text-stone-400">{ticket.description}</p>
                    <div className="mt-2 inline-flex max-w-full rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-orange-200">
                      <span className="min-w-0 truncate">Підрозділ: {ticket.category?.name ?? "Без категорії"}</span>
                    </div>
                    <div className="mt-3 text-xs text-stone-500">{ticket.object?.name ?? "-"} · {formatDate(ticket.created_at)}</div>
                  </div>
                  <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-stone-500" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge>
                  <Badge tone={ticket.priority === "critical" || ticket.priority === "high" ? "orange" : "gray"}>{priorityLabels[ticket.priority]}</Badge>
                </div>
              </Link>
              {canDeleteTickets ? (
                <form action={hardDeleteTicketAction.bind(null, ticket.id)} className="border-t border-white/10 p-3">
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <ConfirmSubmitButton
                    type="submit"
                    variant="destructive"
                    className="min-h-11 w-full rounded-2xl"
                    message="Ви точно хочете повністю видалити заявку? Цю дію не можна скасувати."
                  >
                    <Trash2 className="h-4 w-4" />Видалити
                  </ConfirmSubmitButton>
                </form>
              ) : null}
            </div>
          ))}
          {visibleTickets.length === 0 ? <div className="mobile-card p-4 text-sm text-stone-500">Заявок поки немає.</div> : null}
        </div>
        )}
      </div>

      <Card className="hidden md:block">
        <CardHeader><CardTitle>Реєстр заявок</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {statusFilters.map((filter) => (
              <Button key={filter.value} asChild variant={activeStatus === filter.value ? "default" : "outline"} size="sm">
                <Link href={filter.value === "all" ? "/tickets" : `/tickets?status=${filter.value}`}>{filter.label}</Link>
              </Button>
            ))}
          </div>
          {visibleTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Заявок поки немає. Створіть першу заявку.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Номер</TH><TH>Заявка</TH><TH>Об'єкт</TH><TH>Виконавець</TH><TH>Статус</TH><TH>Термін</TH>{canDeleteTickets ? <TH>Дії</TH> : null}</TR>
              </THead>
              <TBody>
                {visibleTickets.map((ticket) => (
                  <TR key={ticket.id}>
                    <TD><Link className="font-medium text-orange-200 hover:underline" href={`/tickets/${ticket.id}`}>{ticket.number}</Link></TD>
                    <TD>
                      <div>{ticket.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{priorityLabels[ticket.priority]} · {ticket.category?.name ?? "Без категорії"}</span>
                        {ticket.telegram_source_group_id ? <Badge tone="gray">Групове повідомлення</Badge> : null}
                      </div>
                    </TD>
                    <TD>{ticket.object?.name ?? "-"}</TD>
                    <TD>{ticket.assignee?.full_name ?? "Не призначено"}</TD>
                    <TD><Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge></TD>
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
                            <Trash2 className="h-4 w-4" />Видалити
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
    </div>
  );
}


function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">{title}</div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
