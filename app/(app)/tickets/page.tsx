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

export default async function TicketsPage() {
  const { data: tickets, error } = await getTickets();

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
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Заявок поки немає. Створіть першу заявку.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Номер</TH><TH>Заявка</TH><TH>Об'єкт</TH><TH>Виконавець</TH><TH>Статус</TH><TH>Термін</TH></TR>
              </THead>
              <TBody>
                {tickets.map((ticket) => (
                  <TR key={ticket.id}>
                    <TD><Link className="font-medium text-orange-200 hover:underline" href={`/tickets/${ticket.id}`}>{ticket.number}</Link></TD>
                    <TD><div>{ticket.title}</div><div className="text-xs text-muted-foreground">{priorityLabels[ticket.priority]} · {ticket.category?.name ?? "Без категорії"}</div></TD>
                    <TD>{ticket.object?.name ?? "-"}</TD>
                    <TD>{ticket.assignee?.full_name ?? "Не призначено"}</TD>
                    <TD><Badge tone={ticket.status === "done" ? "green" : "orange"}>{statusLabels[ticket.status]}</Badge></TD>
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
