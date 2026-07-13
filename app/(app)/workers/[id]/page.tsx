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
      {error ? <Alert title="РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё Р·Р°СЏРІРєРё РІРёРєРѕРЅР°РІС†СЏ">{error}</Alert> : null}
      {query.statusError ? <Alert title="Р”С–СЋ РЅРµ РІРёРєРѕРЅР°РЅРѕ">{decodeURIComponent(query.statusError)}</Alert> : null}
      {query.statusSuccess === "unassigned" ? <Alert title="Р’РёРєРѕРЅР°РІС†СЏ Р·РЅСЏС‚Рѕ">Р—Р°СЏРІРєСѓ Р·РЅСЏС‚Рѕ Р· С†СЊРѕРіРѕ РІРёРєРѕРЅР°РІС†СЏ.</Alert> : null}
      {!worker ? (
        <Card><CardContent className="pt-5 text-sm text-muted-foreground">Р’РёРєРѕРЅР°РІС†СЏ РЅРµ Р·РЅР°Р№РґРµРЅРѕ.</CardContent></Card>
      ) : (
        <>
          <div className="mobile-gradient-card p-2.5 md:border-0 md:bg-transparent md:p-0 md:shadow-none">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-orange-300">Р’РёРєРѕРЅР°РІРµС†СЊ</p>
                <h1 className="mt-1 break-words text-2xl font-semibold">{worker.name}</h1>
                <p className="subtle">
                  {worker.telegram_username ? `@${worker.telegram_username}` : "Telegram username РЅРµ РІРєР°Р·Р°РЅРѕ"} В· {worker.is_active ? "РђРєС‚РёРІРЅРёР№" : "РќРµР°РєС‚РёРІРЅРёР№"}
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
                <Link href="/workers">РќР°Р·Р°Рґ</Link>
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {(worker.categories ?? []).length > 0 ? worker.categories?.map((category) => <Badge key={category.id} tone="orange">{category.name}</Badge>) : (
                <span className="text-sm text-muted-foreground">РљР°С‚РµРіРѕСЂС–С— РЅРµ РїСЂРёР·РЅР°С‡РµРЅС–.</span>
              )}
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <FilterLink workerId={worker.id} view="active" current={view} label={`РђРєС‚РёРІРЅС– (${filterTickets(ticketsResult.data, "active").length})`} />
            <FilterLink workerId={worker.id} view="done" current={view} label={`Р’РёРєРѕРЅР°РЅС– (${filterTickets(ticketsResult.data, "done").length})`} />
            <FilterLink workerId={worker.id} view="all" current={view} label={`Р’СЃС– (${ticketsResult.data.length})`} />
          </div>

          {tickets.length === 0 ? (
            <Card className="rounded-3xl border-white/10 bg-white/[0.04]">
              <CardContent className="pt-5 text-sm text-muted-foreground">
                {ticketsResult.data.length === 0 ? "РќР° С†СЊРѕРјСѓ РІРёРєРѕРЅР°РІС†С– С‰Рµ РЅРµРјР°С” Р·Р°РєСЂС–РїР»РµРЅРёС… Р·Р°СЏРІРѕРє." : "Р—Р°СЏРІРѕРє Сѓ С†СЊРѕРјСѓ С„С–Р»СЊС‚СЂС– РЅРµРјР°С”."}
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-2 md:gap-4">
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
            <CardTitle className="line-clamp-2 break-words text-base md:text-xl">{ticket.number} В· {ticket.title}</CardTitle>
            <CardDescription className="mt-1 line-clamp-2 break-words text-xs md:text-sm">
              {ticket.object?.name ?? "-"} В· {ticket.object?.address ?? "-"}
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
          <Info label="РљР°С‚РµРіРѕСЂС–СЏ" value={ticket.category?.name ?? "-"} />
          <Info label="РЎС‚РІРѕСЂРµРЅРѕ" value={formatDate(ticket.created_at)} />
          <Info label="РџСЂРёР·РЅР°С‡РµРЅРѕ" value={formatDate(ticket.assigned_at)} />
          <Info label="РћР±'С”РєС‚" value={ticket.object?.name ?? "-"} />
        </div>
        <div className="grid gap-2 md:flex md:flex-wrap">
          <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">
            <Link href={`/tickets/${ticket.id}`}>Р’С–РґРєСЂРёС‚Рё Р·Р°СЏРІРєСѓ</Link>
          </Button>
          {!closed ? (
            <form action={unassignWorkerAction.bind(null, ticket.id)}>
              <input type="hidden" name="returnTo" value={`/workers/${workerId}`} />
              <ConfirmSubmitButton
                type="submit"
                variant="destructive"
                className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md"
                message="Р—РЅСЏС‚Рё С†СЋ Р·Р°СЏРІРєСѓ Р· РІРёРєРѕРЅР°РІС†СЏ?"
              >
                Р—РЅСЏС‚Рё Р· РІРёРєРѕРЅР°РІС†СЏ
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

