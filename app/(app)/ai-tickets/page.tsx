import Link from "next/link";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { MobileTicketSwitch } from "@/components/tickets/mobile-ticket-switch";
import { requireRole } from "@/lib/auth/server";
import { formatDate } from "@/lib/utils";
import {
  getAiTicketsMeta,
  getAiTicketsPage,
  getAiTicketConfirmReadiness,
  type AiTicketConfirmReadiness,
  type AiTicketListItem,
  type AiTicketsMeta,
} from "@/lib/supabase/ai-tickets";
import type { TicketPriority, WorkerWithCategories } from "@/types/domain";
import {
  assignWorkerToAiTicketAction,
  confirmAiTicketAction,
  rejectAiTicketAction,
  updateAiTicketAction,
} from "./actions";

const priorities: TicketPriority[] = ["low", "medium", "high", "critical"];

const uaPriorityLabels: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

const PAGE_SIZE = 20;

type SearchParams = {
  q?: string;
  object?: string;
  category?: string;
  priority?: string;
  confidence?: string;
  date?: string;
  success?: string;
  error?: string;
  view?: string;
  page?: string;
};

function confidenceTone(value: number | null | undefined) {
  const confidence = value ?? 0;
  if (confidence >= 0.85) return "green";
  if (confidence >= 0.6) return "orange";
  return "red";
}

function confidenceLabel(value: number | null | undefined) {
  if (typeof value !== "number") return "-";
  return `${Math.round(value * 100)}%`;
}

function groupTickets(tickets: AiTicketListItem[]) {
  return tickets.reduce<Record<string, AiTicketListItem[]>>(
    (groups, ticket) => {
      if (!ticket.telegram_source_group_id) return groups;
      groups[ticket.telegram_source_group_id] = [
        ...(groups[ticket.telegram_source_group_id] ?? []),
        ticket,
      ];
      return groups;
    },
    {},
  );
}

export default async function AiTicketsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const mobileView = params.view === "table" ? "table" : "cards";
  const currentPage = Math.max(Number(params.page ?? 1) || 1, 1);
  const [ticketsPageResult, metaResult] = await Promise.all([
    getAiTicketsPage({
      q: params.q,
      object: params.object,
      category: params.category,
      priority: params.priority,
      confidence: params.confidence,
      date: params.date,
      page: currentPage,
      limit: PAGE_SIZE,
    }),
    getAiTicketsMeta(),
  ]);

  const tickets = ticketsPageResult.data.tickets;
  const totalTickets = ticketsPageResult.data.total;
  const totalPages = Math.max(Math.ceil(totalTickets / PAGE_SIZE), 1);
  const safePage = Math.min(currentPage, totalPages);
  const shownFrom = totalTickets === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const shownTo = Math.min(safePage * PAGE_SIZE, totalTickets);
  const objects = metaResult.data.objects;
  const categories = metaResult.data.categories;
  const workers = metaResult.data.workers;
  const workersById = new Map(workers.map((worker) => [worker.id, worker]));
  const visibleTickets = tickets;
  const relatedGroups = groupTickets(tickets);
  const readinessResult = await getAiTicketConfirmReadiness(visibleTickets, workers);
  const readinessByTicket = readinessResult.data;
  const pageHref = (page: number) => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "success" && key !== "error") next.set(key, value);
    }
    if (page > 1) next.set("page", String(page));
    else next.delete("page");
    const search = next.toString();
    return search ? `/ai-tickets?${search}` : "/ai-tickets";
  };
  const viewHref = (view: "cards" | "table") => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "success" && key !== "error" && key !== "view")
        next.set(key, value);
    }
    if (view === "table") next.set("view", "table");
    next.delete("page");
    const search = next.toString();
    return search ? `/ai-tickets?${search}` : "/ai-tickets";
  };

  return (
    <div className="page-shell max-w-full space-y-2.5 overflow-x-hidden pb-20 md:space-y-6 md:pb-0">
      <div className="space-y-1">
        <h1 className="text-[23px] font-semibold leading-none tracking-[-0.03em] text-zinc-100 md:text-2xl">
          AI-заявки
        </h1>
        <p className="text-[11px] leading-4 text-zinc-400 md:text-sm">
          Перевірка заявок, які Telegram AI-бот створив зі статусом очікування
          підтвердження.
        </p>
      </div>
      <MobileTicketSwitch active="ai" aiCount={totalTickets} />
      <details className="hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-orange-200">
          Вигляд
          <span className="text-xs text-stone-500">
            {mobileView === "table" ? "Таблиця" : "Картки"}
          </span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            asChild
            variant={mobileView === "cards" ? "default" : "outline"}
            size="sm"
            className="min-h-10 rounded-2xl"
          >
            <Link href={viewHref("cards")}>Картки</Link>
          </Button>
          <Button
            asChild
            variant={mobileView === "table" ? "default" : "outline"}
            size="sm"
            className="min-h-10 rounded-2xl"
          >
            <Link href={viewHref("table")}>Таблиця</Link>
          </Button>
        </div>
      </details>

      {ticketsPageResult.error || metaResult.error ? (
        <Alert title="Не вдалося завантажити AI-заявки">
          {ticketsPageResult.error ?? metaResult.error}
        </Alert>
      ) : null}
      {readinessResult.error ? (
        <Alert title="Маршрути підтвердження не підготовлено">
          {readinessResult.error}
        </Alert>
      ) : null}
      {params.error ? (
        <Alert title="Помилка">{decodeURIComponent(params.error)}</Alert>
      ) : null}
      {params.success === "confirmed" ? (
        <Alert title="Заявку підтверджено">
          Статус змінено на нову заявку.
        </Alert>
      ) : null}
      {params.success === "confirmed_sent" ? (
        <Alert title="AI-заявку підтверджено">
          AI-заявку підтверджено і додано в план. Виконавець отримає її після надсилання плану.
        </Alert>
      ) : null}
      {params.success === "confirmed_planned" ? (
        <Alert title="AI-заявку підтверджено">
          AI-заявку підтверджено і додано в план. Виконавець отримає її після надсилання плану.
        </Alert>
      ) : null}
      {params.success === "confirmed_no_worker" ? (
        <Alert title="AI-заявку підтверджено">
          AI-заявку підтверджено, але виконавця не знайдено.
        </Alert>
      ) : null}
      {params.success === "rejected" ? (
        <Alert title="Заявку відхилено">Статус змінено на відхилену.</Alert>
      ) : null}
      {params.success === "updated" ? (
        <Alert title="Заявку оновлено">
          Правки збережено, заявка лишилась на перевірці.
        </Alert>
      ) : null}
      {params.success === "worker_assigned" ? (
        <Alert title="Виконавця призначено">
          Прив'язку виконавця до AI-заявки збережено.
        </Alert>
      ) : null}

      <div className="flex max-w-full gap-1 overflow-x-auto pb-0.5 md:hidden">
        <Link
          href="/ai-tickets"
          className="shrink-0 rounded-full bg-orange-500 px-2.5 py-1 text-[10px] font-semibold text-black"
        >
          Очікують
        </Link>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-400">
          Всі
        </span>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-400">
          Підтверджені
        </span>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] text-zinc-400">
          Відхилені
        </span>
      </div>

      <details className="rounded-[14px] border border-white/10 bg-white/[0.035] p-0.5 md:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-xl px-3 text-[12px] font-semibold text-zinc-100">
          Фільтри
          <span className="text-[10px] text-zinc-400">
            {totalTickets} знайдено
          </span>
        </summary>
        <form className="grid gap-2 px-2 pb-2.5 pt-2">
          <Field label="Пошук">
            <Input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Назва, опис, об'єкт"
              className="min-h-8 rounded-lg text-[11px]"
            />
          </Field>
          <Field label="Об'єкт">
            <Select name="object" defaultValue={params.object ?? "all"}>
              <option value="all">Всі об'єкти</option>
              {objects.map((object) => (
                <option key={object.id} value={object.id}>
                  {object.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Категорія">
              <Select name="category" defaultValue={params.category ?? "all"}>
                <option value="all">Всі</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" defaultValue={params.priority ?? "all"}>
                <option value="all">Всі</option>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {uaPriorityLabels[priority]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Confidence">
              <Select
                name="confidence"
                defaultValue={params.confidence ?? "all"}
              >
                <option value="all">Всі</option>
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
              </Select>
            </Field>
            <Field label="Дата">
              <Input
                type="date"
                name="date"
                defaultValue={params.date ?? ""}
                className="min-h-8 rounded-lg text-[11px]"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" className="min-h-8 rounded-lg text-[10px]">
              Застосувати
            </Button>
            <Button
              variant="outline"
              asChild
              className="min-h-8 rounded-lg text-[10px]"
            >
              <Link href="/ai-tickets">Скинути</Link>
            </Button>
          </div>
        </form>
      </details>

      <Card className="hidden rounded-3xl border-white/10 bg-white/[0.04] md:block md:rounded-lg">
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
          <CardDescription>Знайдено: {totalTickets}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Пошук">
              <Input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Назва, опис, об'єкт"
              />
            </Field>
            <Field label="Об'єкт">
              <Select name="object" defaultValue={params.object ?? "all"}>
                <option value="all">Всі об'єкти</option>
                {objects.map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Категорія">
              <Select name="category" defaultValue={params.category ?? "all"}>
                <option value="all">Всі категорії</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" defaultValue={params.priority ?? "all"}>
                <option value="all">Всі</option>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {uaPriorityLabels[priority]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Confidence">
              <Select
                name="confidence"
                defaultValue={params.confidence ?? "all"}
              >
                <option value="all">Всі</option>
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
              </Select>
            </Field>
            <Field label="Дата">
              <Input type="date" name="date" defaultValue={params.date ?? ""} />
            </Field>
            <div className="flex flex-col gap-2 md:col-span-3 md:flex-row md:items-end xl:col-span-6">
              <Button
                type="submit"
                className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md"
              >
                Застосувати
              </Button>
              <Button
                variant="outline"
                asChild
                className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md"
              >
                <Link href="/ai-tickets">Скинути</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <AiPagination
        page={safePage}
        total={totalTickets}
        totalPages={totalPages}
        shownFrom={shownFrom}
        shownTo={shownTo}
        hrefForPage={pageHref}
      />

      {visibleTickets.length === 0 ? (
        <Card className="rounded-3xl border-white/10 bg-white/[0.04]">
          <CardContent className="pt-6 text-sm text-muted-foreground">
            AI-заявок на підтвердження немає.
          </CardContent>
        </Card>
      ) : mobileView === "table" ? (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="w-full min-w-[720px] text-left text-[11px]">
            <thead className="bg-white/[0.04] text-muted-foreground">
              <tr>
                <th className="px-3 py-3">№</th>
                <th className="px-3 py-3">Заявка</th>
                <th className="px-3 py-3">Об'єкт</th>
                <th className="px-3 py-3">Категорія</th>
                <th className="px-3 py-3">Пріоритет</th>
                <th className="px-3 py-3">AI</th>
                <th className="px-3 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {visibleTickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td className="whitespace-nowrap px-2.5 py-2 font-semibold text-orange-200">
                    {ticket.number}
                  </td>
                  <td className="max-w-[170px] px-2.5 py-2">
                    <div className="line-clamp-2 break-words">
                      {ticket.title}
                    </div>
                  </td>
                  <td className="max-w-[140px] px-2.5 py-2">
                    <div className="line-clamp-2 break-words">
                      {ticket.object?.name ?? "-"}
                    </div>
                  </td>
                  <td className="max-w-[140px] px-2.5 py-2">
                    <div className="line-clamp-2 break-words">
                      {ticket.category?.name ?? "-"}
                    </div>
                  </td>
                  <td className="px-2.5 py-2">
                    <Badge tone="gray">
                      {uaPriorityLabels[ticket.priority]}
                    </Badge>
                  </td>
                  <td className="px-2.5 py-2">
                    <Badge tone={confidenceTone(ticket.ai_confidence)}>
                      {confidenceLabel(ticket.ai_confidence)}
                    </Badge>
                  </td>
                  <td className="px-2.5 py-2 text-right">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="rounded-2xl"
                    >
                      <Link href={`/tickets/${ticket.id}`}>Відкрити</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-2 md:gap-4">
          {visibleTickets.map((ticket) => (
            <AiTicketCard
              key={ticket.id}
              ticket={ticket}
              related={
                ticket.telegram_source_group_id
                  ? (relatedGroups[ticket.telegram_source_group_id] ?? [])
                  : []
              }
              objects={objects}
              categories={categories}
              workers={workers}
              assignedWorker={
                ticket.assignee_worker_id
                  ? (workersById.get(ticket.assignee_worker_id) ?? null)
                  : null
              }
              readiness={readinessByTicket.get(ticket.id) ?? null}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AiPagination({
  page,
  total,
  totalPages,
  shownFrom,
  shownTo,
  hrefForPage,
}: {
  page: number;
  total: number;
  totalPages: number;
  shownFrom: number;
  shownTo: number;
  hrefForPage: (page: number) => string;
}) {
  if (totalPages <= 1 && total === 0) return null;
  const pages = Array.from(
    new Set(
      [1, totalPages, page - 1, page, page + 1].filter(
        (item) => item >= 1 && item <= totalPages,
      ),
    ),
  ).sort((a, b) => a - b);
  return (
    <div className="rounded-[14px] border border-white/10 bg-white/[0.035] p-2">
      <div className="mb-2 text-[10px] text-zinc-400">
        Показано {shownFrom}-{shownTo} із {total}
      </div>
      <div className="flex max-w-full gap-1.5 overflow-x-auto pb-0.5">
        {pages.map((item, index) => (
          <div key={item} className="flex items-center gap-1.5">
            {index > 0 && item - pages[index - 1] > 1 ? (
              <span className="text-[10px] text-zinc-500">...</span>
            ) : null}
            <Button
              asChild
              variant={item === page ? "default" : "outline"}
              className="h-8 min-w-8 rounded-[10px] px-2 text-[10px]"
            >
              <Link href={hrefForPage(item)}>{item}</Link>
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
function AiTicketCard({
  ticket,
  related,
  objects,
  categories,
  workers,
  assignedWorker,
  readiness,
}: {
  ticket: AiTicketListItem;
  related: AiTicketListItem[];
  objects: AiTicketsMeta["objects"];
  categories: AiTicketsMeta["categories"];
  workers: WorkerWithCategories[];
  assignedWorker: WorkerWithCategories | null;
  readiness: AiTicketConfirmReadiness | null;
}) {
  const siblingTickets = related.filter((item) => item.id !== ticket.id);
  return (
    <Card className="relative overflow-hidden rounded-[17px] border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] shadow-[0_10px_26px_rgba(0,0,0,0.3)] md:rounded-lg">
      <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-sky-500 to-orange-400 md:hidden" />
      <CardHeader className="px-3 py-2.5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-bold leading-4 tracking-tight text-zinc-100 md:hidden">
              {ticket.number}
            </div>
            <CardTitle className="mt-1.5 line-clamp-2 break-words text-[12px] font-semibold leading-4 text-zinc-100 md:mt-0 md:text-xl">
              {ticket.title}
            </CardTitle>
            <CardDescription className="mt-1 line-clamp-2 break-words text-[10px] text-zinc-400 md:text-sm">
              {ticket.object?.name ?? "Об'єкт не визначено"} ·{" "}
              {formatDate(ticket.created_at)}
            </CardDescription>
          </div>
          <div className="flex max-w-full flex-wrap gap-1 md:gap-2">
            <Badge tone={confidenceTone(ticket.ai_confidence)}>
              {confidenceLabel(ticket.ai_confidence)}
            </Badge>
            <Badge tone="gray">{uaPriorityLabels[ticket.priority]}</Badge>
            {ticket.source === "telegram_private_test" ? (
              <Badge tone="orange">Приватний тест</Badge>
            ) : null}
            {ticket.telegram_source_group_id ? (
              <Badge tone="gray">Групове повідомлення</Badge>
            ) : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 px-3 pb-2.5 pt-0 md:space-y-4 md:p-6 md:pt-0">
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
          <Info label="Об'єкт" value={ticket.object?.name ?? "-"} />
          <Info label="Адреса" value={ticket.object?.address ?? "-"} />
          <Info label="Категорія" value={ticket.category?.name ?? "-"} />
          <Info
            label="Підрозділ"
            value={ticket.recommended_department ?? "-"}
          />
          <Info
            label="Telegram автор"
            value={ticket.telegram_user_name ?? ticket.telegram_user_id ?? "-"}
          />
          <Info
            label="Закріплено"
            value={
              assignedWorker?.name ??
              (ticket.assignee_worker_id
                ? "Виконавець не знайдений"
                : "Не призначено")
            }
          />
          <Info label="Номер" value={ticket.number} />
          <Info
            label="Group ID"
            value={ticket.telegram_source_group_id ?? "-"}
          />
        </div>

        <WorkerAssignPanel
          ticket={ticket}
          workers={workers}
          assignedWorker={assignedWorker}
          readiness={readiness}
        />

        <div className="rounded-lg border border-border bg-stone-950/30 p-2 md:rounded-md md:p-3">
          <div className="text-xs text-muted-foreground">Опис заявки</div>
          <p className="mt-1 line-clamp-2 whitespace-normal break-words text-[10px] text-stone-300 md:text-sm">
            {ticket.description}
          </p>
        </div>

        <div className="rounded-lg border border-border bg-stone-950/30 p-2 md:rounded-md md:p-3">
          <div className="text-xs text-muted-foreground">
            Оригінальне повідомлення
          </div>
          <p className="mt-1 line-clamp-2 whitespace-normal break-words text-[10px] text-stone-300 md:whitespace-pre-wrap md:text-sm">
            {ticket.original_message_text ?? ticket.description}
          </p>
        </div>

        {siblingTickets.length > 0 ? (
          <div className="rounded-md border border-border bg-stone-950/30 p-3">
            <div className="mb-2 text-sm font-medium">
              Пов'язані AI-заявки з цього повідомлення
            </div>
            <div className="grid gap-2">
              {siblingTickets.map((relatedTicket) => (
                <Link
                  key={relatedTicket.id}
                  href={`/tickets/${relatedTicket.id}`}
                  className="text-sm text-orange-200 hover:underline"
                >
                  {relatedTicket.number} · {relatedTicket.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-1 md:flex md:flex-wrap">
          <form action={confirmAiTicketAction.bind(null, ticket.id)}>
            {readiness?.suggestedWorkerId ? <input type="hidden" name="preferred_worker_id" value={readiness.suggestedWorkerId} /> : null}
            <SubmitButton
              type="submit"
              pendingText="Підтверджуємо..."
              showOverlay
              className="min-h-8 w-full rounded-lg px-2 text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm"
            >
              Підтвердити
            </SubmitButton>
          </form>
          <form action={rejectAiTicketAction.bind(null, ticket.id)}>
            <SubmitButton
              type="submit"
              pendingText="Відхиляється..."
              showOverlay
              variant="destructive"
              className="min-h-8 w-full rounded-lg px-2 text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm"
            >
              Відхилити
            </SubmitButton>
          </form>
          <Button
            asChild
            variant="outline"
            className="min-h-8 w-full rounded-lg px-2 text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm"
          >
            <Link href={`/tickets/${ticket.id}`}>Відкрити картку</Link>
          </Button>
        </div>

        <details className="rounded-lg border border-white/10 bg-stone-950/20 p-2 md:rounded-md md:p-3">
          <summary className="cursor-pointer text-[10px] font-medium text-orange-200 md:text-sm">
            Редагувати перед підтвердженням
          </summary>
          <form
            action={updateAiTicketAction.bind(null, ticket.id)}
            className="mt-3 grid gap-3 md:grid-cols-2 md:gap-4"
          >
            <Field label="Назва">
              <Input name="title" required defaultValue={ticket.title} />
            </Field>
            <Field label="Об'єкт">
              <Select name="object_id" required defaultValue={ticket.object_id}>
                {objects.map((object) => (
                  <option key={object.id} value={object.id}>
                    {object.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Категорія">
              <Select
                name="category_id"
                required
                defaultValue={ticket.category_id}
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" required defaultValue={ticket.priority}>
                {priorities.map((priority) => (
                  <option key={priority} value={priority}>
                    {uaPriorityLabels[priority]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Рекомендований підрозділ">
              <Input
                name="recommended_department"
                defaultValue={ticket.recommended_department ?? ""}
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Опис">
                <Textarea
                  name="description"
                  required
                  defaultValue={ticket.description}
                  className="min-h-32"
                />
              </Field>
            </div>
            <div className="md:col-span-2 rounded-md border border-border bg-stone-950/30 p-3">
              <div className="text-xs text-muted-foreground">AI-оригінал</div>
              <p className="mt-2 max-w-full whitespace-pre-wrap break-words text-sm">
                {ticket.original_message_text ?? "-"}
              </p>
            </div>

            <div className="md:col-span-2">
              <SubmitButton
                type="submit"
                pendingText="Зберігається..."
                showOverlay
              >
                Зберегти правки
              </SubmitButton>
            </div>
          </form>
        </details>
      </CardContent>
    </Card>
  );
}

function WorkerAssignPanel({
  ticket,
  workers,
  assignedWorker,
  readiness,
}: {
  ticket: AiTicketListItem;
  workers: WorkerWithCategories[];
  assignedWorker: WorkerWithCategories | null;
  readiness: AiTicketConfirmReadiness | null;
}) {
  const recommendedWorkers = workers.filter((worker) =>
    worker.categories?.some((category) => category.id === ticket.category_id),
  );
  const recommendedIds = new Set(recommendedWorkers.map((worker) => worker.id));
  const sortedWorkers = [
    ...recommendedWorkers,
    ...workers.filter((worker) => !recommendedIds.has(worker.id)),
  ];

  return (
    <div className="rounded-lg border border-orange-900/50 bg-orange-950/10 p-2 md:rounded-md md:p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-medium text-orange-100 md:text-sm">
            Виконавці
          </div>
          <p className="mt-0.5 text-[10px] text-muted-foreground md:text-xs">
            {assignedWorker
              ? `Закріплено: ${assignedWorker.name}`
              : ticket.assignee_worker_id
                ? "Виконавець не знайдений"
                : "Ще не призначено"}
          </p>
        </div>
        {assignedWorker?.telegram_username ? (
          <Badge>@{assignedWorker.telegram_username}</Badge>
        ) : null}
      </div>
      <form
        action={assignWorkerToAiTicketAction.bind(null, ticket.id)}
        className="mt-2 grid gap-1 md:grid-cols-[1fr_auto] md:gap-2"
      >
        <select
          name="worker_id"
          required
          defaultValue={assignedWorker?.id ?? recommendedWorkers[0]?.id ?? ""}
          className="h-8 w-full rounded-lg border border-input bg-stone-950/30 px-2 py-1 text-[10px] outline-none focus:ring-2 focus:ring-ring md:h-10 md:rounded-md md:text-sm"
        >
          <option value="">Оберіть виконавця</option>
          {sortedWorkers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.name}
              {recommendedIds.has(worker.id) ? " · рекомендовано" : ""}
            </option>
          ))}
        </select>
        <SubmitButton
          type="submit"
          pendingText="Зберігається..."
          showOverlay
          variant="outline"
          className="min-h-8 rounded-lg px-2 text-[10px] md:min-h-0 md:rounded-md md:text-sm"
        >
          Зберегти виконавця
        </SubmitButton>
      </form>
      <p className="mt-1.5 text-[10px] text-muted-foreground md:text-xs">
        Telegram не надсилається автоматично.
      </p>
      {readiness ? (
        <div className={`mt-2 rounded-lg border px-2 py-1.5 text-[10px] leading-4 md:text-xs ${
          readiness.routeStatus === "ready"
            ? "border-emerald-400/25 bg-emerald-500/10 text-emerald-100"
            : "border-amber-400/25 bg-amber-500/10 text-amber-100"
        }`}>
          {readiness.routeStatus === "ready" ? (
            <>
              Маршрут підготовлено: {readiness.suggestedWorkerName ?? "виконавець"} · {readiness.targetPlanTitle ?? "план"}.
            </>
          ) : (
            readiness.warning ?? "Маршрут потребує перевірки."
          )}
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full rounded-lg border border-border bg-stone-950/30 p-1.5 md:rounded-md md:p-3">
      <div className="text-[9px] text-muted-foreground md:text-xs">{label}</div>
      <div className="mt-0.5 break-words text-[10px] font-medium md:text-sm">
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1 md:space-y-2">
      <Label className="text-[10px] md:text-sm">{label}</Label>
      {children}
    </div>
  );
}

function Select({
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-8 w-full rounded-lg border border-input bg-stone-950/30 px-2 py-1 text-[10px] outline-none focus:ring-2 focus:ring-ring md:h-10 md:rounded-md md:text-sm"
    >
      {children}
    </select>
  );
}
