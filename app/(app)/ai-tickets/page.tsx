import Link from "next/link";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { priorityLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { Category, CompanyObject, Profile, TicketPriority, TicketWithRelations } from "@/types/domain";
import { confirmAiTicketAction, rejectAiTicketAction, updateAiTicketAction } from "./actions";

const priorities: TicketPriority[] = ["low", "medium", "high", "critical"];

const ticketSelect = `
  *,
  object:objects(*),
  category:categories(*),
  creator:profiles!tickets_created_by_fkey(*),
  assignee:profiles!tickets_assigned_to_fkey(*)
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
  const supabase = await createClient();
  const [{ data: ticketsData, error }, { data: objectsData }, { data: categoriesData }, { data: profilesData }] = await Promise.all([
    supabase
      .from("tickets")
      .select(ticketSelect)
      .eq("status", "pending_review")
      .in("source", ["telegram_group", "telegram_private_test"])
      .order("created_at", { ascending: false }),
    supabase.from("objects").select("*").order("name"),
    supabase.from("categories").select("*").order("name"),
    supabase.from("profiles").select("*").eq("is_active", true).order("full_name"),
  ]);

  const tickets = (ticketsData ?? []) as TicketWithRelations[];
  const objects = (objectsData ?? []) as CompanyObject[];
  const categories = (categoriesData ?? []) as Category[];
  const profiles = (profilesData ?? []) as Profile[];
  const visibleTickets = filterTickets(tickets, params);
  const relatedGroups = groupTickets(tickets);

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI-заявки</h1>
        <p className="subtle">Перевірка заявок, які Telegram AI-бот створив зі статусом очікування підтвердження.</p>
      </div>

      {error ? <Alert title="Не вдалося завантажити AI-заявки">{error.message}</Alert> : null}
      {params.error ? <Alert title="Помилка">{decodeURIComponent(params.error)}</Alert> : null}
      {params.success === "confirmed" ? <Alert title="Заявку підтверджено">Статус змінено на нову заявку.</Alert> : null}
      {params.success === "rejected" ? <Alert title="Заявку відхилено">Статус змінено на відхилену.</Alert> : null}
      {params.success === "updated" ? <Alert title="Заявку оновлено">Правки збережено, заявка лишилась на перевірці.</Alert> : null}

      <Card>
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
            <div className="flex items-end gap-2 md:col-span-3 xl:col-span-6">
              <Button type="submit">Застосувати</Button>
              <Button variant="outline" asChild><Link href="/ai-tickets">Скинути</Link></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {visibleTickets.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">AI-заявок на підтвердження немає.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {visibleTickets.map((ticket) => (
            <AiTicketCard
              key={ticket.id}
              ticket={ticket}
              related={ticket.telegram_source_group_id ? relatedGroups[ticket.telegram_source_group_id] ?? [] : []}
              objects={objects}
              categories={categories}
              profiles={profiles}
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
  profiles,
}: {
  ticket: TicketWithRelations;
  related: TicketWithRelations[];
  objects: CompanyObject[];
  categories: Category[];
  profiles: Profile[];
}) {
  const siblingTickets = related.filter((item) => item.id !== ticket.id);
  const objectResolverConfidence = resolverConfidence(ticket);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{ticket.title}</CardTitle>
            <CardDescription className="mt-1">
              {ticket.object?.name ?? "Об'єкт не визначено"} · {formatDate(ticket.created_at)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={confidenceTone(ticket.ai_confidence)}>{confidenceLabel(ticket.ai_confidence)}</Badge>
            {objectResolverConfidence !== null ? <Badge tone={confidenceTone(objectResolverConfidence)}>Object {confidenceLabel(objectResolverConfidence)}</Badge> : null}
            <Badge tone="gray">{priorityLabels[ticket.priority]}</Badge>
            {ticket.source === "telegram_private_test" ? <Badge tone="orange">Приватний тест</Badge> : null}
            {ticket.telegram_source_group_id ? <Badge tone="gray">Частина групового повідомлення</Badge> : null}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Info label="Об'єкт" value={ticket.object?.name ?? "-"} />
          <Info label="Адреса" value={ticket.object?.address ?? "-"} />
          <Info label="Категорія" value={ticket.category?.name ?? "-"} />
          <Info label="Підрозділ" value={ticket.recommended_department ?? "-"} />
          <Info label="Telegram автор" value={ticket.telegram_user_name ?? ticket.telegram_user_id ?? "-"} />
          <Info label="Виконавець" value={ticket.assignee?.full_name ?? "Не призначено"} />
          <Info label="Номер" value={ticket.number} />
          <Info label="Group ID" value={ticket.telegram_source_group_id ?? "-"} />
        </div>

        <div className="rounded-md border border-border bg-stone-950/30 p-3">
          <div className="text-xs text-muted-foreground">Опис заявки</div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.description}</p>
        </div>

        <div className="rounded-md border border-border bg-stone-950/30 p-3">
          <div className="text-xs text-muted-foreground">Оригінальне повідомлення</div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.original_message_text ?? ticket.description}</p>
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

        <div className="flex flex-wrap gap-2">
          <form action={confirmAiTicketAction.bind(null, ticket.id)}>
            <Button type="submit">✅ Підтвердити</Button>
          </form>
          <form action={rejectAiTicketAction.bind(null, ticket.id)}>
            <Button type="submit" variant="destructive">❌ Відхилити</Button>
          </form>
          <Button asChild variant="outline"><Link href={`/tickets/${ticket.id}`}>Відкрити картку</Link></Button>
        </div>

        <details className="rounded-md border border-border bg-stone-950/20 p-3">
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
            <Field label="Виконавець">
              <Select name="assigned_to" defaultValue={ticket.assigned_to ?? ""}>
                <option value="">Не призначено</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
              </Select>
            </Field>
            <div className="md:col-span-2">
              <Field label="Опис">
                <Textarea name="description" required defaultValue={ticket.description} className="min-h-32" />
              </Field>
            </div>
            <div className="md:col-span-2 rounded-md border border-border bg-stone-950/30 p-3">
              <div className="text-xs text-muted-foreground">AI-оригінал</div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{ticket.original_message_text ?? "-"}</p>
            </div>
            {ticket.ai_raw_result ? (
              <details className="md:col-span-2 rounded-md border border-border bg-stone-950/30 p-3">
                <summary className="cursor-pointer text-sm text-orange-200">Показати JSON</summary>
                <pre className="mt-3 max-h-80 overflow-auto text-xs">{JSON.stringify(ticket.ai_raw_result, null, 2)}</pre>
              </details>
            ) : null}
            <div className="md:col-span-2">
              <Button type="submit">Зберегти правки</Button>
            </div>
          </form>
        </details>
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-stone-950/30 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
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
    <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
      {children}
    </select>
  );
}
