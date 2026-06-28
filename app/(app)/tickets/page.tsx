import Link from "next/link";
import { Plus } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { getTickets } from "@/lib/supabase/queries";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { TicketStatus } from "@/types/domain";

const statusFilters: Array<{ value: "all" | TicketStatus; label: string }> = [
  { value: "all", label: "Всі" },
  { value: "pending_review", label: "Очікує підтвердження" },
  { value: "new", label: "Нові" },
  { value: "in_progress", label: "В роботі" },
  { value: "waiting", label: "Очікують" },
  { value: "done", label: "Виконані" },
  { value: "rejected", label: "Відхилені" },
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
  searchParams: Promise<{ status?: string }>;
}) {
  const query = await searchParams;
  const { data: tickets, error } = await getTickets();
  const activeStatus = statusFilters.some((filter) => filter.value === query.status) ? query.status : "all";
  const visibleTickets = activeStatus === "all" ? tickets : tickets.filter((ticket) => ticket.status === activeStatus);

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Заявки</h1>
          <p className="subtle">Фільтрація, контроль SLA та розподіл виконавців.</p>
        </div>
        <Button asChild><Link href="/tickets/new"><Plus className="h-4 w-4" />Нова заявка</Link></Button>
      </div>
      {error ? <Alert title="Не вдалося завантажити заявки">{error}</Alert> : null}
      <Card>
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
                <TR><TH>Номер</TH><TH>Заявка</TH><TH>Об'єкт</TH><TH>Виконавець</TH><TH>Статус</TH><TH>Термін</TH></TR>
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
