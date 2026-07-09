import Link from "next/link";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { MobileTicketSwitch } from "@/components/tickets/mobile-ticket-switch";
import { priorityLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { getActiveWorkers } from "@/lib/supabase/worker-queries";
import { formatDate } from "@/lib/utils";
import type { Category, CompanyObject, TicketPriority, TicketWithRelations, WorkerWithCategories } from "@/types/domain";
import { assignWorkerToAiTicketAction, confirmAiTicketAction, rejectAiTicketAction, updateAiTicketAction } from "./actions";

const priorities: TicketPriority[] = ["low", "medium", "high", "critical"];

const ticketSelect = `
  id,
  number,
  title,
  description,
  status,
  priority,
  object_id,
  category_id,
  created_by,
  assigned_to,
  assignee_worker_id,
  due_at,
  completed_at,
  assigned_at,
  source,
  telegram_source_group_id,
  telegram_user_id,
  telegram_user_name,
  original_message_text,
  ai_confidence,
  ai_raw_result,
  recommended_department,
  created_at,
  updated_at,
  object:objects(id, name, type, object_number, city, district, address, is_active, created_at),
  category:categories(id, name, description, is_active, created_at)
`;

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

function confidenceBucket(value: number | null | undefined) {
  const confidence = value ?? 0;
  if (confidence >= 0.85) return "high";
  if (confidence >= 0.6) return "medium";
  return "low";
}

function resolverConfidence(ticket: TicketWithRelations) {
  const raw = ticket.ai_raw_result;
  if (!raw || typeof raw !== "object") return null;
  const resolver = (raw as { objectResolver?: unknown }).objectResolver;
  if (!resolver || typeof resolver !== "object") return null;
  const confidence = (resolver as { confidence?: unknown }).confidence;
  return typeof confidence === "number" ? confidence : null;
}

function filterTickets(tickets: TicketWithRelations[], params: SearchParams) {
  const query = params.q?.trim().toLowerCase();
  return tickets.filter((ticket) => {
    if (params.object && params.object !== "all" && ticket.object_id !== params.object) return false;
    if (params.category && params.category !== "all" && ticket.category_id !== params.category) return false;
    if (params.priority && params.priority !== "all" && ticket.priority !== params.priority) return false;
    if (params.confidence && params.confidence !== "all" && confidenceBucket(ticket.ai_confidence) !== params.confidence) return false;
    if (params.date && !ticket.created_at.startsWith(params.date)) return false;
    if (!query) return true;
    return [ticket.title, ticket.description, ticket.object?.name, ticket.object?.address, ticket.original_message_text]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

function groupTickets(tickets: TicketWithRelations[]) {
  return tickets.reduce<Record<string, TicketWithRelations[]>>((groups, ticket) => {
    if (!ticket.telegram_source_group_id) return groups;
    groups[ticket.telegram_source_group_id] = [...(groups[ticket.telegram_source_group_id] ?? []), ticket];
    return groups;
  }, {});
}

export default async function AiTicketsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const mobileView = params.view === "table" ? "table" : "cards";
  const supabase = await createClient();
  let ticketsQuery = supabase
    .from("tickets")
    .select(ticketSelect)
    .eq("status", "pending_review")
    .in("source", ["telegram_group", "telegram_private_test"])
    .order("created_at", { ascending: false })
    .limit(50);
  if (params.object && params.object !== "all") ticketsQuery = ticketsQuery.eq("object_id", params.object);
  if (params.category && params.category !== "all") ticketsQuery = ticketsQuery.eq("category_id", params.category);
  if (params.priority && params.priority !== "all") ticketsQuery = ticketsQuery.eq("priority", params.priority);
  if (params.date) {
    ticketsQuery = ticketsQuery.gte("created_at", `${params.date}T00:00:00`).lte("created_at", `${params.date}T23:59:59`);
  }
  const [{ data: ticketsData, error }, { data: objectsData }, { data: categoriesData }, workersResult] = await Promise.all([
    ticketsQuery,
    supabase.from("objects").select("id, name, type, object_number, city, district, address, aliases, manager_id, is_active, created_at").order("name"),
    supabase.from("categories").select("id, name, description, is_active, created_at").eq("is_active", true).order("name"),
    getActiveWorkers(),
  ]);

  const tickets = (ticketsData ?? []) as unknown as TicketWithRelations[];
  const objects = (objectsData ?? []) as unknown as CompanyObject[];
  const categories = (categoriesData ?? []) as unknown as Category[];
  const workers = workersResult.data;
  const workersById = new Map(workers.map((worker) => [worker.id, worker]));
  const visibleTickets = filterTickets(tickets, params);
  const relatedGroups = groupTickets(tickets);
  const viewHref = (view: "cards" | "table") => {
    const next = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value && key !== "success" && key !== "error" && key !== "view") next.set(key, value);
    }
    if (view === "table") next.set("view", "table");
    const search = next.toString();
    return search ? `/ai-tickets?${search}` : "/ai-tickets";
  };

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI-заявки</h1>
        <p className="subtle">Перевірка заявок, які Telegram AI-бот створив зі статусом очікування підтвердження.</p>
      </div>
      <MobileTicketSwitch active="ai" />
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

      {error || workersResult.error ? <Alert title="Не вдалося завантажити AI-заявки">{error?.message ?? workersResult.error}</Alert> : null}
      {params.error ? <Alert title="Помилка">{decodeURIComponent(params.error)}</Alert> : null}
      {params.success === "confirmed" ? <Alert title="Заявку підтверджено">Статус змінено на нову заявку.</Alert> : null}
      {params.success === "confirmed_sent" ? <Alert title="AI-заявку підтверджено">AI-заявку підтверджено, виконавця призначено, Telegram надіслано.</Alert> : null}
      {params.success === "confirmed_no_worker" ? <Alert title="AI-заявку підтверджено">AI-заявку підтверджено, але виконавця не знайдено.</Alert> : null}
      {params.success === "rejected" ? <Alert title="Заявку відхилено">Статус змінено на відхилену.</Alert> : null}
      {params.success === "updated" ? <Alert title="Заявку оновлено">Правки збережено, заявка лишилась на перевірці.</Alert> : null}
      {params.success === "worker_assigned" ? <Alert title="Виконавця призначено">Прив'язку виконавця до AI-заявки збережено.</Alert> : null}

      <div className="flex gap-2 overflow-x-auto pb-1 md:hidden">
        <Link href="/ai-tickets" className="rounded-full bg-orange-500 px-4 py-2 text-sm font-semibold text-stone-950">Очікують</Link>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-400">Всі</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-400">Підтверджені</span>
        <span className="rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-400">Відхилені</span>
      </div>

      <details className="mobile-card p-3 md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-orange-200">
          Фільтри
          <span className="text-xs text-stone-500">{visibleTickets.length} знайдено</span>
        </summary>
        <form className="mt-3 grid gap-3">
          <Field label="Пошук">
            <Input name="q" defaultValue={params.q ?? ""} placeholder="Назва, опис, об'єкт" className="min-h-11 rounded-2xl" />
          </Field>
          <Field label="Об'єкт">
            <Select name="object" defaultValue={params.object ?? "all"}>
              <option value="all">Всі об'єкти</option>
              {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Категорія">
              <Select name="category" defaultValue={params.category ?? "all"}>
                <option value="all">Всі</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" defaultValue={params.priority ?? "all"}>
                <option value="all">Всі</option>
                {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Confidence">
              <Select name="confidence" defaultValue={params.confidence ?? "all"}>
                <option value="all">Всі</option>
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
              </Select>
            </Field>
            <Field label="Дата">
              <Input type="date" name="date" defaultValue={params.date ?? ""} className="min-h-11 rounded-2xl" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" className="min-h-11 rounded-2xl">Застосувати</Button>
            <Button variant="outline" asChild className="min-h-11 rounded-2xl"><Link href="/ai-tickets">Скинути</Link></Button>
          </div>
        </form>
      </details>

      <Card className="hidden rounded-3xl border-white/10 bg-white/[0.04] md:block md:rounded-lg">
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
          <CardDescription>Знайдено: {visibleTickets.length}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Пошук">
              <Input name="q" defaultValue={params.q ?? ""} placeholder="Назва, опис, об'єкт" />
            </Field>
            <Field label="Об'єкт">
              <Select name="object" defaultValue={params.object ?? "all"}>
                <option value="all">Всі об'єкти</option>
                {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
              </Select>
            </Field>
            <Field label="Категорія">
              <Select name="category" defaultValue={params.category ?? "all"}>
                <option value="all">Всі категорії</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" defaultValue={params.priority ?? "all"}>
                <option value="all">Всі</option>
                {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
              </Select>
            </Field>
            <Field label="Confidence">
              <Select name="confidence" defaultValue={params.confidence ?? "all"}>
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
              <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Застосувати</Button>
              <Button variant="outline" asChild className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md"><Link href="/ai-tickets">Скинути</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {visibleTickets.length === 0 ? (
        <Card className="rounded-3xl border-white/10 bg-white/[0.04]">
          <CardContent className="pt-6 text-sm text-muted-foreground">AI-заявок на підтвердження немає.</CardContent>
        </Card>
      ) : mobileView === "table" ? (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
          <table className="w-full min-w-[760px] text-left text-xs">
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
                  <td className="whitespace-nowrap px-3 py-3 font-semibold text-orange-200">{ticket.number}</td>
                  <td className="max-w-[180px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.title}</div></td>
                  <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.object?.name ?? "-"}</div></td>
                  <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{ticket.category?.name ?? "-"}</div></td>
                  <td className="px-3 py-3"><Badge tone="gray">{priorityLabels[ticket.priority]}</Badge></td>
                  <td className="px-3 py-3"><Badge tone={confidenceTone(ticket.ai_confidence)}>{confidenceLabel(ticket.ai_confidence)}</Badge></td>
                  <td className="px-3 py-3 text-right">
                    <Button asChild size="sm" variant="outline" className="rounded-2xl"><Link href={`/tickets/${ticket.id}`}>Відкрити</Link></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 md:gap-4">
          {visibleTickets.map((ticket) => (
            <AiTicketCard
              key={ticket.id}
              ticket={ticket}
              related={ticket.telegram_source_group_id ? relatedGroups[ticket.telegram_source_group_id] ?? [] : []}
              objects={objects}
              categories={categories}
              workers={workers}
              assignedWorker={ticket.assignee_worker_id ? workersById.get(ticket.assignee_worker_id) ?? null : null}
            />
          ))}
        </div>
      )}
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
}: {
  ticket: TicketWithRelations;
  related: TicketWithRelations[];
  objects: CompanyObject[];
  categories: Category[];
  workers: WorkerWithCategories[];
  assignedWorker: WorkerWithCategories | null;
}) {
  const siblingTickets = related.filter((item) => item.id !== ticket.id);
  const objectResolverConfidence = resolverConfidence(ticket);
  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader className="p-3 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <CardTitle className="line-clamp-2 break-words text-base md:text-xl">{ticket.title}</CardTitle>
            <CardDescription className="mt-1 line-clamp-2 break-words text-xs md:text-sm">
              {ticket.object?.name ?? "Об'єкт не визначено"} · {formatDate(ticket.created_at)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-1.5 md:gap-2">
            <Badge tone={confidenceTone(ticket.ai_confidence)}>{confidenceLabel(ticket.ai_confidence)}</Badge>
            {objectResolverConfidence !== null ? <Badge tone={confidenceTone(objectResolverConfidence)}>Object {confidenceLabel(objectResolverConfidence)}</Badge> : null}
            <Badge tone="gray">{priorityLabels[ticket.priority]}</Badge>
            {ticket.source === "telegram_private_test" ? <Badge tone="orange">Приватний тест</Badge> : null}
            {ticket.telegram_source_group_id ? <Badge tone="gray">Частина групового повідомлення</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 md:space-y-4 md:p-6 md:pt-0">
        <div className="grid gap-2 md:grid-cols-2 md:gap-3 xl:grid-cols-4">
          <Info label="Об'єкт" value={ticket.object?.name ?? "-"} />
          <Info label="Адреса" value={ticket.object?.address ?? "-"} />
          <Info label="Категорія" value={ticket.category?.name ?? "-"} />
          <Info label="Підрозділ" value={ticket.recommended_department ?? "-"} />
          <Info label="Telegram автор" value={ticket.telegram_user_name ?? ticket.telegram_user_id ?? "-"} />
          <Info label="Закріплено" value={assignedWorker?.name ?? (ticket.assignee_worker_id ? "Виконавець не знайдений" : "Не призначено")} />
          <Info label="Номер" value={ticket.number} />
          <Info label="Group ID" value={ticket.telegram_source_group_id ?? "-"} />
        </div>

        <WorkerAssignPanel ticket={ticket} workers={workers} assignedWorker={assignedWorker} />

        <div className="rounded-2xl border border-border bg-stone-950/30 p-2.5 md:rounded-md md:p-3">
          <div className="text-xs text-muted-foreground">Опис заявки</div>
          <p className="mt-1.5 line-clamp-3 whitespace-normal break-words text-xs text-stone-300 md:text-sm">{ticket.description}</p>
        </div>

        <div className="rounded-2xl border border-border bg-stone-950/30 p-2.5 md:rounded-md md:p-3">
          <div className="text-xs text-muted-foreground">Оригінальне повідомлення</div>
          <p className="mt-1.5 line-clamp-3 whitespace-normal break-words text-xs text-stone-300 md:whitespace-pre-wrap md:text-sm">{ticket.original_message_text ?? ticket.description}</p>
        </div>

        {siblingTickets.length > 0 ? (
          <div className="rounded-md border border-border bg-stone-950/30 p-3">
            <div className="mb-2 text-sm font-medium">Пов'язані AI-заявки з цього повідомлення</div>
            <div className="grid gap-2">
              {siblingTickets.map((relatedTicket) => (
                <Link key={relatedTicket.id} href={`/tickets/${relatedTicket.id}`} className="text-sm text-orange-200 hover:underline">
                  {relatedTicket.number} · {relatedTicket.title}
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 md:flex md:flex-wrap">
          <form action={confirmAiTicketAction.bind(null, ticket.id)}>
            <SubmitButton type="submit" pendingText="Підтверджується..." showOverlay className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">✅ Підтвердити</SubmitButton>
          </form>
          <form action={rejectAiTicketAction.bind(null, ticket.id)}>
            <SubmitButton type="submit" pendingText="Відхиляється..." showOverlay variant="destructive" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">❌ Відхилити</SubmitButton>
          </form>
          <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md"><Link href={`/tickets/${ticket.id}`}>Відкрити картку</Link></Button>
        </div>

        <details className="rounded-2xl border border-white/10 bg-stone-950/20 p-2.5 md:rounded-md md:p-3">
          <summary className="cursor-pointer text-sm font-medium text-orange-200">✏️ Редагувати перед підтвердженням</summary>
          <form action={updateAiTicketAction.bind(null, ticket.id)} className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label="Назва">
              <Input name="title" required defaultValue={ticket.title} />
            </Field>
            <Field label="Об'єкт">
              <Select name="object_id" required defaultValue={ticket.object_id}>
                {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
              </Select>
            </Field>
            <Field label="Категорія">
              <Select name="category_id" required defaultValue={ticket.category_id}>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" required defaultValue={ticket.priority}>
                {priorities.map((priority) => <option key={priority} value={priority}>{priorityLabels[priority]}</option>)}
              </Select>
            </Field>
            <Field label="Рекомендований підрозділ">
              <Input name="recommended_department" defaultValue={ticket.recommended_department ?? ""} />
            </Field>
            <div className="md:col-span-2">
              <Field label="Опис">
                <Textarea name="description" required defaultValue={ticket.description} className="min-h-32" />
              </Field>
            </div>
            <div className="md:col-span-2 rounded-md border border-border bg-stone-950/30 p-3">
              <div className="text-xs text-muted-foreground">AI-оригінал</div>
              <p className="mt-2 max-w-full whitespace-pre-wrap break-words text-sm">{ticket.original_message_text ?? "-"}</p>
            </div>
            {ticket.ai_raw_result ? (
              <details className="md:col-span-2 rounded-md border border-border bg-stone-950/30 p-3">
                <summary className="cursor-pointer text-sm text-orange-200">Показати JSON</summary>
                <pre className="mt-3 max-h-80 max-w-full overflow-x-auto overflow-y-auto whitespace-pre-wrap break-words rounded-2xl bg-black/30 p-3 text-xs">{JSON.stringify(ticket.ai_raw_result, null, 2)}</pre>
              </details>
            ) : null}
            <div className="md:col-span-2">
              <SubmitButton type="submit" pendingText="Зберігається..." showOverlay>Зберегти правки</SubmitButton>
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
}: {
  ticket: TicketWithRelations;
  workers: WorkerWithCategories[];
  assignedWorker: WorkerWithCategories | null;
}) {
  const recommendedWorkers = workers.filter((worker) => worker.categories?.some((category) => category.id === ticket.category_id));
  const recommendedIds = new Set(recommendedWorkers.map((worker) => worker.id));
  const sortedWorkers = [...recommendedWorkers, ...workers.filter((worker) => !recommendedIds.has(worker.id))];

  return (
    <div className="rounded-2xl border border-orange-900/50 bg-orange-950/10 p-2.5 md:rounded-md md:p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium text-orange-100">Виконавці</div>
          <p className="mt-1 text-xs text-muted-foreground">
            {assignedWorker ? `Закріплено: ${assignedWorker.name}` : ticket.assignee_worker_id ? "Виконавець не знайдений" : "Ще не призначено"}
          </p>
        </div>
        {assignedWorker?.telegram_username ? <Badge>@{assignedWorker.telegram_username}</Badge> : null}
      </div>
      <form action={assignWorkerToAiTicketAction.bind(null, ticket.id)} className="mt-3 grid gap-2 md:grid-cols-[1fr_auto]">
        <select
          name="worker_id"
          required
          defaultValue={assignedWorker?.id ?? recommendedWorkers[0]?.id ?? ""}
          className="h-11 w-full rounded-2xl border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:h-10 md:rounded-md"
        >
          <option value="">Оберіть виконавця</option>
          {sortedWorkers.map((worker) => (
            <option key={worker.id} value={worker.id}>
              {worker.name}{recommendedIds.has(worker.id) ? " · рекомендовано" : ""}
            </option>
          ))}
        </select>
        <SubmitButton type="submit" pendingText="Зберігається..." showOverlay variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Зберегти виконавця</SubmitButton>
      </form>
      <p className="mt-2 text-xs text-muted-foreground">Telegram не надсилається автоматично.</p>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 max-w-full rounded-2xl border border-border bg-stone-950/30 p-2.5 md:rounded-md md:p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-xs font-medium md:text-sm">{value}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className="h-11 w-full rounded-2xl border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:h-10 md:rounded-md">
      {children}
    </select>
  );
}
