import { AlertTriangle, CheckCircle2, Clock3, ClipboardList } from "lucide-react";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { getObjects, getTickets } from "@/lib/supabase/queries";
import { getWorkerStats } from "@/lib/supabase/worker-queries";
import { priorityLabels, statusLabels } from "@/lib/labels";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const [ticketsResult, objectsResult, workerStatsResult] = await Promise.all([getTickets(), getObjects(), getWorkerStats()]);
  const tickets = ticketsResult.data;
  const objects = objectsResult.data;
  const active = tickets.filter((ticket) => ticket.status !== "done" && ticket.status !== "cancelled");
  const critical = tickets.filter((ticket) => ticket.priority === "critical").length;
  const doneThisWeek = tickets.filter((ticket) => ticket.status === "done").length;
  const error = ticketsResult.error ?? objectsResult.error ?? workerStatsResult.error;
  const topWorkers = workerStatsResult.data
    .filter((item) => item.total > 0)
    .sort((a, b) => b.done - a.done || b.total - a.total)
    .slice(0, 5);

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Операційна панель</h1>
        <p className="subtle">Поточний стан заявок по магазинах, складах, виробництву та офісу.</p>
      </div>
      {params.error === "forbidden" ? (
        <Alert title="Недостатньо прав">Вашій ролі не відкрито доступ до цього розділу. Якщо доступ потрібен, адміністратор має змінити роль у профілі.</Alert>
      ) : null}
      {error ? <Alert title="Дані Supabase недоступні">{error}</Alert> : null}
      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="Відкриті заявки" value={active.length} icon={ClipboardList} />
        <Metric title="Критичні" value={critical} icon={AlertTriangle} tone="text-red-300" />
        <Metric title="Об'єкти" value={objects.length} icon={Clock3} />
        <Metric title="Виконано за тиждень" value={doneThisWeek} icon={CheckCircle2} tone="text-emerald-300" />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Останні заявки</CardTitle>
          <CardDescription>Заявки, які потребують уваги технічної команди.</CardDescription>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Заявок поки немає.</p>
          ) : (
            <Table>
              <THead>
                <TR><TH>Номер</TH><TH>Назва</TH><TH>Статус</TH><TH>Пріоритет</TH><TH>Об'єкт</TH></TR>
              </THead>
              <TBody>
                {tickets.slice(0, 8).map((ticket) => (
                  <TR key={ticket.id}>
                    <TD className="font-medium">{ticket.number}</TD>
                    <TD>{ticket.title}</TD>
                    <TD><Badge tone="orange">{statusLabels[ticket.status]}</Badge></TD>
                    <TD>{priorityLabels[ticket.priority]}</TD>
                    <TD>{ticket.object?.name ?? "-"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Топ виконавців</CardTitle>
          <CardDescription>Коротка статистика по призначених і виконаних заявках.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {topWorkers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Статистика виконавців ще порожня.</p>
          ) : topWorkers.map((item) => (
            <div key={item.worker.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-stone-950/30 p-3 text-sm">
              <div>
                <div className="font-medium text-stone-100">{item.worker.name}</div>
                <div className="text-xs text-muted-foreground">Активні: {item.active} · На підтвердженні: {item.waitingConfirmation}</div>
              </div>
              <Badge tone="green">Виконано: {item.done}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value, icon: Icon, tone = "text-orange-300" }: { title: string; value: number; icon: React.ElementType; tone?: string }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-5">
        <div>
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold">{value}</p>
        </div>
        <Icon className={`h-7 w-7 ${tone}`} />
      </CardContent>
    </Card>
  );
}
