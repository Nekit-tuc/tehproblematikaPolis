import Link from "next/link";
import type React from "react";
import { notFound } from "next/navigation";
import { CalendarDays, CheckCircle2, ClipboardList, Printer, UserRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { requireRole } from "@/lib/auth/server";
import { getWorkerById, getWorkerTicketCompletionDate, getWorkerTicketOverview, type WorkerPlanTicketRow, type WorkerTicketPeriod } from "@/lib/supabase/worker-queries";
import { formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, TicketWithRelations } from "@/types/domain";
import { unassignWorkerAction } from "../../tickets/[id]/actions";

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
  statusError?: string;
  statusSuccess?: string;
};

const statusLabels: Record<TicketStatus, string> = {
  pending_review: "AI-перевірка",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На підтвердженні",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const priorityLabels: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

function statusTone(status: TicketStatus) {
  if (status === "done") return "green" as const;
  if (status === "cancelled" || status === "rejected") return "red" as const;
  if (status === "waiting_admin_confirmation" || status === "waiting") return "orange" as const;
  return "gray" as const;
}

function priorityTone(priority: TicketPriority) {
  if (priority === "critical" || priority === "high") return "red" as const;
  if (priority === "medium") return "orange" as const;
  return "gray" as const;
}

function periodHref(workerId: string, period: WorkerTicketPeriod, from?: string, to?: string) {
  const params = new URLSearchParams({ period });
  if (period === "custom" && from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  return `/workers/${workerId}?${params.toString()}`;
}

function printHref(workerId: string, period: WorkerTicketPeriod, from: string, to: string) {
  const params = new URLSearchParams({ period });
  if (period === "custom") {
    params.set("from", from);
    params.set("to", to);
  }
  return `/workers/${workerId}/print?${params.toString()}`;
}

export default async function WorkerTicketsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "management", "tech_manager"]);
  const { id } = await params;
  const query = await searchParams;
  const [workerResult, overviewResult] = await Promise.all([getWorkerById(id), getWorkerTicketOverview(id, query.period, query.from, query.to)]);

  if (!workerResult.data && !workerResult.error) notFound();

  const worker = workerResult.data;
  const overview = overviewResult.data;
  const error = workerResult.error ?? overviewResult.error;

  return (
    <div className="page-shell max-w-full space-y-4 overflow-x-hidden pb-28 md:space-y-6 md:pb-0">
      {error ? <Alert title="Не вдалося завантажити заявки виконавця">{error}</Alert> : null}
      {query.statusError ? <Alert title="Дію не виконано">{decodeURIComponent(query.statusError)}</Alert> : null}
      {query.statusSuccess === "unassigned" ? <Alert title="Виконавця знято">Заявку знято з цього виконавця.</Alert> : null}
      {!worker ? (
        <Card>
          <CardContent className="pt-5 text-sm text-muted-foreground">Виконавця не знайдено.</CardContent>
        </Card>
      ) : (
        <>
          <section className="mobile-gradient-card p-3 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-orange-500/40 bg-orange-500/10 text-lg font-bold text-orange-200">
                  {worker.name.slice(0, 1).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-orange-300">Виконавець</p>
                  <h1 className="mt-1 break-words text-2xl font-semibold leading-tight text-zinc-100">{worker.name}</h1>
                  <p className="mt-1 text-xs text-zinc-400">
                    {worker.telegram_username ? `@${worker.telegram_username}` : "Telegram username не вказано"} · {worker.telegram_id ? "Telegram підключено" : "Telegram не підключено"}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge tone={worker.is_active ? "green" : "red"}>{worker.is_active ? "Активний" : "Неактивний"}</Badge>
                <Button asChild variant="outline" className="min-h-10 rounded-2xl text-xs md:min-h-0 md:rounded-md">
                  <Link href="/workers">Назад</Link>
                </Button>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(worker.categories ?? []).length > 0 ? (
                worker.categories?.map((category) => (
                  <Badge key={category.id} tone="orange">
                    {category.name}
                  </Badge>
                ))
              ) : (
                <span className="text-sm text-muted-foreground">Категорії не призначені.</span>
              )}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Kpi icon={<ClipboardList className="h-4 w-4" />} label="Активні заявки" value={overview.stats.active} />
            <Kpi icon={<CalendarDays className="h-4 w-4" />} label="У планах" value={overview.stats.planned} />
            <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Виконано" value={overview.stats.completed} />
            <Kpi icon={<UserRound className="h-4 w-4" />} label="На підтвердженні" value={overview.stats.waitingConfirmation} />
          </section>

          <section className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 md:rounded-lg md:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-zinc-100">Фільтр виконаних заявок</h2>
                <p className="mt-1 text-xs text-zinc-400">Період: {overview.period.label}. Виконання рахується за датою завершення, не за датою створення.</p>
              </div>
              <Button asChild className="min-h-10 rounded-2xl text-xs md:min-h-0 md:rounded-md">
                <Link href={printHref(worker.id, overview.period.period, overview.period.from, overview.period.to)}>
                  <Printer className="h-4 w-4" />
                  Друк звіту
                </Link>
              </Button>
            </div>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
              <PeriodLink href={periodHref(worker.id, "this_week")} active={overview.period.period === "this_week"} label="Поточний тиждень" />
              <PeriodLink href={periodHref(worker.id, "previous_week")} active={overview.period.period === "previous_week"} label="Попередній тиждень" />
              <PeriodLink href={periodHref(worker.id, "month")} active={overview.period.period === "month"} label="Поточний місяць" />
            </div>
            <form className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
              <input type="hidden" name="period" value="custom" />
              <input type="date" name="from" defaultValue={overview.period.period === "custom" ? overview.period.from : ""} className="h-10 rounded-2xl border border-input bg-stone-950/40 px-3 text-xs outline-none md:rounded-md" />
              <input type="date" name="to" defaultValue={overview.period.period === "custom" ? overview.period.to : ""} className="h-10 rounded-2xl border border-input bg-stone-950/40 px-3 text-xs outline-none md:rounded-md" />
              <Button type="submit" variant="outline" className="min-h-10 rounded-2xl text-xs md:min-h-0 md:rounded-md">
                Застосувати
              </Button>
            </form>
          </section>

          <TicketSection title="Закріплені заявки" description="Активні заявки з tickets.assignee_worker_id або активних планів цього виконавця." empty="Активних заявок для цього виконавця немає.">
            {overview.activeTickets.map((ticket) => (
              <WorkerTicketCard key={ticket.id} ticket={ticket} workerId={worker.id} />
            ))}
          </TicketSection>

          <PlanTicketSection title="Заявки з планів" description={`Планові заявки за період ${overview.period.label}. Якщо заявка була у кількох планах, показано найновіший план.`} empty="Заявок у планах за вибраний період немає.">
            {overview.plannedTickets.map((row) => (
              <PlanTicketCard key={row.ticketId} row={row} workerId={worker.id} />
            ))}
          </PlanTicketSection>

          <PlanTicketSection title="Виконані заявки" description="Заявки зі статусом done, де дата виконання потрапляє у вибраний період." empty="Виконаних заявок за вибраний період немає.">
            {overview.completedTickets.map((row) => (
              <PlanTicketCard key={row.ticketId} row={row} workerId={worker.id} showCompletionDate />
            ))}
          </PlanTicketSection>
        </>
      )}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-3 md:rounded-lg">
      <div className="text-orange-300">{icon}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-100">{value}</div>
      <div className="mt-1 text-[11px] text-zinc-400">{label}</div>
    </div>
  );
}

function PeriodLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={active ? "shrink-0 rounded-full bg-orange-500 px-3 py-2 text-xs font-semibold text-stone-950" : "shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-stone-300"}>
      {label}
    </Link>
  );
}

function TicketSection({ title, description, empty, children }: { title: string; description: string; empty: string; children: React.ReactNode[] }) {
  return (
    <section className="space-y-2">
      <div>
        <h2 className="text-lg font-semibold text-zinc-100">{title}</h2>
        <p className="mt-1 text-xs text-zinc-400">{description}</p>
      </div>
      {children.length ? <div className="grid gap-2 md:gap-4">{children}</div> : <EmptyCard text={empty} />}
    </section>
  );
}

function PlanTicketSection({ title, description, empty, children }: { title: string; description: string; empty: string; children: React.ReactNode[] }) {
  return <TicketSection title={title} description={description} empty={empty}>{children}</TicketSection>;
}

function EmptyCard({ text }: { text: string }) {
  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.04]">
      <CardContent className="pt-5 text-sm text-muted-foreground">{text}</CardContent>
    </Card>
  );
}

function WorkerTicketCard({ ticket, workerId }: { ticket: TicketWithRelations; workerId: string }) {
  return <BaseTicketCard ticket={ticket} workerId={workerId} />;
}

function PlanTicketCard({ row, workerId, showCompletionDate = false }: { row: WorkerPlanTicketRow; workerId: string; showCompletionDate?: boolean }) {
  return <BaseTicketCard ticket={row.ticket} workerId={workerId} plan={row.plan} completionDate={showCompletionDate ? getWorkerTicketCompletionDate(row.ticket) : null} />;
}

function BaseTicketCard({ ticket, workerId, plan, completionDate }: { ticket: TicketWithRelations; workerId: string; plan?: WorkerPlanTicketRow["plan"] | null; completionDate?: string | null }) {
  const closed = ticket.status === "done" || ticket.status === "cancelled" || ticket.status === "rejected";
  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader className="p-3 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="line-clamp-2 break-words text-base md:text-lg">
              {ticket.number} · {ticket.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2 break-words text-xs md:text-sm">
              {ticket.object?.name ?? "-"} · {ticket.object?.address ?? "-"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge>
            <Badge tone={priorityTone(ticket.priority)}>{priorityLabels[ticket.priority]}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 md:p-5 md:pt-0">
        <p className="line-clamp-3 break-words text-sm text-stone-300">{ticket.description}</p>
        <div className="grid gap-2 md:grid-cols-4">
          <Info label="Категорія" value={ticket.category?.name ?? "-"} />
          <Info label="Створено" value={formatDate(ticket.created_at)} />
          <Info label="Виконано" value={completionDate ? formatDate(completionDate) : "-"} />
          <Info label="План" value={plan ? `${plan.title} · ${formatDate(plan.period_start)}` : "-"} />
        </div>
        <div className="grid gap-2 md:flex md:flex-wrap">
          <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">
            <Link href={`/tickets/${ticket.id}`}>Відкрити заявку</Link>
          </Button>
          {!closed ? (
            <form action={unassignWorkerAction.bind(null, ticket.id)}>
              <input type="hidden" name="returnTo" value={`/workers/${workerId}`} />
              <ConfirmSubmitButton type="submit" variant="destructive" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md" message="Зняти цю заявку з виконавця?">
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
