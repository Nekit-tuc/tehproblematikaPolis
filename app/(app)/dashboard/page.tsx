import Link from "next/link";
import { AlertTriangle, ArrowRight, Bot, CheckCircle2, Clock3, ClipboardList, FileSpreadsheet, Plus, Sparkles, Wrench } from "lucide-react";
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
  const newTickets = tickets.filter((ticket) => ticket.status === "new").length;
  const inProgress = tickets.filter((ticket) => ticket.status === "in_progress").length;
  const pendingReview = tickets.filter((ticket) => ticket.status === "pending_review").length;
  const critical = tickets.filter((ticket) => ticket.priority === "critical").length;
  const doneThisWeek = tickets.filter((ticket) => ticket.status === "done").length;
  const error = ticketsResult.error ?? objectsResult.error ?? workerStatsResult.error;
  const topWorkers = workerStatsResult.data
    .filter((item) => item.total > 0)
    .sort((a, b) => b.done - a.done || b.total - a.total)
    .slice(0, 5);

  return (
    <div className="page-shell space-y-6">
      <div className="hidden md:block">
        <h1 className="text-2xl font-semibold">Операційна панель</h1>
        <p className="subtle">Поточний стан заявок по магазинах, складах, виробництву та офісу.</p>
      </div>
      {params.error === "forbidden" ? (
        <Alert title="Недостатньо прав">Вашій ролі не відкрито доступ до цього розділу. Якщо доступ потрібен, адміністратор має змінити роль у профілі.</Alert>
      ) : null}
      {error ? <Alert title="Дані Supabase недоступні">{error}</Alert> : null}
      <div className="space-y-4 md:hidden">
        <div>
          <h1 className="text-xl font-semibold text-stone-50">Вітаємо, Administrator</h1>
          <p className="mt-1 text-sm text-stone-400">Огляд системи на сьогодні</p>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <MobileMetric title="Нові заявки" value={newTickets} icon={ClipboardList} caption="потребують старту" />
          <MobileMetric title="В роботі" value={inProgress} icon={Wrench} caption="активні задачі" />
          <MobileMetric title="На перевірці" value={pendingReview} icon={Bot} caption="AI-заявки" tone="text-violet-300" />
          <MobileMetric title="Виконано" value={doneThisWeek} icon={CheckCircle2} caption="закриті роботи" tone="text-emerald-300" />
        </div>

        <div className="mobile-gradient-card p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-stone-400">AI-аналіз об'єктів</p>
              <h2 className="mt-0.5 text-base font-semibold">Стабільно</h2>
              <p className="mt-0.5 text-xs text-stone-400">Object Matcher працює коректно</p>
            </div>
            <div className="rounded-2xl bg-orange-500/15 p-2.5 text-orange-300">
              <Sparkles className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-2.5 text-xs text-stone-300">
            Помилок за сьогодні: <span className="font-semibold text-emerald-300">0</span>
          </div>
        </div>

        <div className="mobile-card p-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Останні заявки</h2>
            <Link href="/tickets" className="text-sm text-orange-300">Всі</Link>
          </div>
          <div className="space-y-2">
            {tickets.slice(0, 5).map((ticket) => (
              <Link key={ticket.id} href={`/tickets/${ticket.id}`} className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5 active:bg-white/5">
                <div className="min-w-0 flex-1">
                  <div className="text-xs text-orange-300">{ticket.number}</div>
                  <div className="truncate text-sm font-medium">{ticket.title}</div>
                  <div className="mt-1 truncate text-xs text-stone-500">{ticket.object?.name ?? "-"} · {statusLabels[ticket.status]}</div>
                </div>
                <Badge tone={ticket.priority === "critical" || ticket.priority === "high" ? "orange" : "gray"}>{priorityLabels[ticket.priority]}</Badge>
                <ArrowRight className="h-4 w-4 text-stone-500" />
              </Link>
            ))}
            {tickets.length === 0 ? <p className="text-sm text-stone-500">Заявок поки немає.</p> : null}
          </div>
        </div>

        <Link href="/ai-tickets" className="block rounded-3xl border border-violet-400/20 bg-gradient-to-br from-violet-500/20 to-white/[0.03] p-3 active:bg-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-violet-200">AI-заявки на перевірку</p>
              <p className="mt-1 text-2xl font-semibold">{pendingReview}</p>
            </div>
            <span className="rounded-2xl bg-violet-400/15 px-3 py-1.5 text-xs text-violet-100">Переглянути</span>
          </div>
        </Link>

        <div className="grid grid-cols-2 gap-2.5">
          <QuickAction href="/tickets/new" label="Створити заявку" icon={Plus} />
          <QuickAction href="/ai-test" label="AI-тест" icon={Bot} />
          <QuickAction href="/objects" label="Об'єкти" icon={Clock3} />
          <QuickAction href="/reports" label="Звіти" icon={FileSpreadsheet} />
        </div>
      </div>

      <div className="hidden gap-4 md:grid md:grid-cols-4">
        <Metric title="Відкриті заявки" value={active.length} icon={ClipboardList} />
        <Metric title="Критичні" value={critical} icon={AlertTriangle} tone="text-red-300" />
        <Metric title="Об'єкти" value={objects.length} icon={Clock3} />
        <Metric title="Виконано за тиждень" value={doneThisWeek} icon={CheckCircle2} tone="text-emerald-300" />
      </div>
      <Card className="hidden md:block">
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

function MobileMetric({ title, value, icon: Icon, caption, tone = "text-orange-300" }: { title: string; value: number; icon: React.ElementType; caption: string; tone?: string }) {
  return (
    <div className="mobile-gradient-card p-3">
      <div className="mb-2.5 flex h-8 w-8 items-center justify-center rounded-xl bg-white/[0.06]">
        <Icon className={`h-4 w-4 ${tone}`} />
      </div>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="mt-1 text-xs font-medium">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-stone-500">{caption}</p>
    </div>
  );
}

function QuickAction({ href, label, icon: Icon }: { href: string; label: string; icon: React.ElementType }) {
  return (
    <Link href={href} className="mobile-card flex min-h-16 items-center gap-2.5 p-3 text-xs font-medium active:bg-white/5">
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-orange-500/15 text-orange-300">
        <Icon className="h-4 w-4" />
      </span>
      {label}
    </Link>
  );
}
