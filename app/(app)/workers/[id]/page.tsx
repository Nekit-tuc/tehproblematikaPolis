import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { requireRole } from "@/lib/auth/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getTicketsByWorkerId, getWorkerById } from "@/lib/supabase/worker-queries";
import { formatDate } from "@/lib/utils";
import type { TicketStatus, TicketWithRelations } from "@/types/domain";
import { unassignWorkerAction } from "../../tickets/[id]/actions";

type WorkerTicketFilter = "active" | "done" | "all";

function isClosed(status: TicketStatus) {
  return status === "done" || status === "cancelled" || status === "rejected";
}

function filterTickets(tickets: TicketWithRelations[], filter: WorkerTicketFilter) {
  if (filter === "all") return tickets;
  if (filter === "done") return tickets.filter((ticket) => isClosed(ticket.status));
  return tickets.filter((ticket) => !isClosed(ticket.status));
}

export default async function WorkerTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: WorkerTicketFilter; statusError?: string; statusSuccess?: string }>;
}) {
  await requireRole(["admin", "management", "tech_manager"]);
  const { id } = await params;
  const query = await searchParams;
  const view = query.view === "done" || query.view === "all" ? query.view : "active";
  const [workerResult, ticketsResult] = await Promise.all([getWorkerById(id), getTicketsByWorkerId(id)]);

  if (!workerResult.data && !workerResult.error) notFound();

  const worker = workerResult.data;
  const tickets = filterTickets(ticketsResult.data, view);
  const error = workerResult.error ?? ticketsResult.error;

  return (
    <div className="page-shell space-y-6">
      {error ? <Alert title="Не вдалося завантажити заявки виконавця">{error}</Alert> : null}
      {query.statusError ? <Alert title="Дію не виконано">{decodeURIComponent(query.statusError)}</Alert> : null}
      {query.statusSuccess === "unassigned" ? <Alert title="Виконавця знято">Заявку знято з цього виконавця.</Alert> : null}
      {!worker ? (
        <Card><CardContent className="pt-5 text-sm text-muted-foreground">Виконавця не знайдено.</CardContent></Card>
      ) : (
        <>
          <div className="mobile-gradient-card p-4 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-orange-300">Виконавець</p>
                <h1 className="mt-1 break-words text-2xl font-semibold">{worker.name}</h1>
                <p className="subtle">
                  {worker.telegram_username ? `@${worker.telegram_username}` : "Telegram username не вказано"} · {worker.is_active ? "Активний" : "Неактивний"}
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
                <Link href="/workers">Назад</Link>
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(worker.categories ?? []).length > 0 ? worker.categories?.map((category) => <Badge key={category.id} tone="orange">{category.name}</Badge>) : (
                <span className="text-sm text-muted-foreground">Категорії не призначені.</span>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterLink workerId={worker.id} view="active" current={view} label={`Активні (${filterTickets(ticketsResult.data, "active").length})`} />
            <FilterLink workerId={worker.id} view="done" current={view} label={`Виконані (${filterTickets(ticketsResult.data, "done").length})`} />
            <FilterLink workerId={worker.id} view="all" current={view} label={`Всі (${ticketsResult.data.length})`} />
          </div>

          {tickets.length === 0 ? (
            <Card className="rounded-3xl border-white/10 bg-white/[0.04]">
              <CardContent className="pt-5 text-sm text-muted-foreground">
                {ticketsResult.data.length === 0 ? "На цьому виконавці ще немає закріплених заявок." : "Заявок у цьому фільтрі немає."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:gap-4">
              {tickets.map((ticket) => <WorkerTicketCard key={ticket.id} ticket={ticket} workerId={worker.id} />)}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function FilterLink({ workerId, view, current, label }: { workerId: string; view: WorkerTicketFilter; current: WorkerTicketFilter; label: string }) {
  const active = view === current;
  return (
    <Link
      href={`/workers/${workerId}?view=${view}`}
      className={active ? "rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-stone-950" : "rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-300"}
    >
      {label}
    </Link>
  );
}

function WorkerTicketCard({ ticket, workerId }: { ticket: TicketWithRelations; workerId: string }) {
  const closed = isClosed(ticket.status);
  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader className="p-3 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 break-words text-base md:text-xl">{ticket.number} · {ticket.title}</CardTitle>
            <CardDescription className="mt-1 line-clamp-2 break-words text-xs md:text-sm">
              {ticket.object?.name ?? "-"} · {ticket.object?.address ?? "-"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={isClosed(ticket.status) ? "green" : "orange"}>{statusLabels[ticket.status]}</Badge>
            <Badge>{priorityLabels[ticket.priority]}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 md:p-6 md:pt-0">
        <p className="line-clamp-3 break-words text-sm text-stone-300">{ticket.description}</p>
        <div className="grid gap-2 md:grid-cols-4">
          <Info label="Категорія" value={ticket.category?.name ?? "-"} />
          <Info label="Створено" value={formatDate(ticket.created_at)} />
          <Info label="Призначено" value={formatDate(ticket.assigned_at)} />
          <Info label="Об'єкт" value={ticket.object?.name ?? "-"} />
        </div>
        <div className="grid gap-2 md:flex md:flex-wrap">
          <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">
            <Link href={`/tickets/${ticket.id}`}>Відкрити заявку</Link>
          </Button>
          {!closed ? (
            <form action={unassignWorkerAction.bind(null, ticket.id)}>
              <input type="hidden" name="returnTo" value={`/workers/${workerId}`} />
              <ConfirmSubmitButton
                type="submit"
                variant="destructive"
                className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md"
                message="Зняти цю заявку з виконавця?"
              >
                Зняти з виконавця
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-stone-950/30 p-2.5 md:rounded-md md:p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xs font-medium md:text-sm">{value}</div>
    </div>
  );
}
