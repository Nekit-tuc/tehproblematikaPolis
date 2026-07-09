import Link from "next/link";
import type React from "react";
import { CalendarDays, Filter, FolderKanban } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getCategories, getObjects } from "@/lib/supabase/queries";
import { getTicketsGroupedByCategory, getWorkPlans, type PlanningFilters, type WorkPlanStatus } from "@/lib/supabase/work-plans";
import { getActiveWorkers } from "@/lib/supabase/worker-queries";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, TicketWithRelations, WorkerWithCategories } from "@/types/domain";
import { createWorkPlanAction } from "./actions";

type SearchParams = {
  view?: "category" | "worker" | "object";
  from?: string;
  to?: string;
  categoryId?: string;
  workerId?: string;
  status?: TicketStatus | "";
  objectId?: string;
  assignment?: "all" | "with_worker" | "without_worker";
  success?: string;
  error?: string;
};

const planningStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_admin_confirmation"];

const planStatusLabels: Record<WorkPlanStatus, string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  partially_done: "Частково виконано",
  done: "Виконано",
  cancelled: "Скасовано",
};

function filtersFromParams(params: SearchParams): PlanningFilters {
  return {
    from: params.from,
    to: params.to,
    categoryId: params.categoryId,
    workerId: params.workerId,
    status: params.status,
    objectId: params.objectId,
    assignment: params.assignment ?? "all",
    limit: 100,
  };
}

function priorityTone(priority: TicketPriority) {
  if (priority === "critical") return "red";
  if (priority === "high") return "orange";
  return "gray";
}

function statusTone(status: TicketStatus) {
  if (status === "waiting_admin_confirmation") return "orange";
  if (status === "in_progress" || status === "assigned") return "green";
  return "gray";
}

function assignmentLabel(workerId?: string | null, workersById?: Map<string, WorkerWithCategories>) {
  if (!workerId) return "Не призначено";
  return workersById?.get(workerId)?.name ?? "Виконавець не знайдений";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function displayWorkPlanningError(value?: string | null) {
  if (!value) return null;
  const message = safeDecode(value);
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) {
    return "Не вдалося створити план. Перевірте права доступу або RLS.";
  }
  if (message.length > 180) return `${message.slice(0, 177)}...`;
  return message;
}

function buildTabHref(view: string, params: SearchParams) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && !["success", "error", "view"].includes(key)) search.set(key, value);
  });
  search.set("view", view);
  return `/work-planning?${search.toString()}`;
}

export default async function WorkPlanningPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const view = params.view === "worker" || params.view === "object" ? params.view : "category";
  const filters = filtersFromParams(params);

  const [groupsResult, plansResult, categoriesResult, objectsResult, workersResult] = await Promise.all([
    getTicketsGroupedByCategory(filters),
    getWorkPlans(),
    getCategories(),
    getObjects(),
    getActiveWorkers(),
  ]);

  const workersById = new Map(workersResult.data.map((worker) => [worker.id, worker]));
  const error = groupsResult.error ?? plansResult.error ?? categoriesResult.error ?? objectsResult.error ?? workersResult.error;
  const pageError = displayWorkPlanningError(error);
  const createError = displayWorkPlanningError(params.error);
  const ticketCount = groupsResult.data.reduce((sum, group) => sum + group.tickets.length, 0);

  return (
    <div className="page-shell space-y-6 pb-28 md:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Планування робіт</h1>
          <p className="subtle">Групування заявок по підрозділах, виконавцях і тижневих планах.</p>
        </div>
        <Badge tone="orange">{ticketCount} заявок доступно</Badge>
      </div>

      {pageError ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="Не вдалося завантажити планування">
            <span className="break-words whitespace-normal">{pageError}</span>
          </Alert>
        </div>
      ) : null}
      {createError ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="План не створено">
            <span className="break-words whitespace-normal">{createError}</span>
          </Alert>
        </div>
      ) : null}
      {params.success === "created" ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="План створено">
            <span className="break-words whitespace-normal">Чернетку плану робіт збережено. Заявки залишилися окремими і не змінили статус.</span>
          </Alert>
        </div>
      ) : null}

      <details className="mobile-card p-3 md:hidden">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-orange-200">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4" />Фільтри</span>
          <span className="text-xs text-stone-500">{ticketCount} знайдено</span>
        </summary>
        <FilterForm params={params} categories={categoriesResult.data} objects={objectsResult.data} workers={workersResult.data} compact />
      </details>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
          <CardDescription>Показуються підтверджені незавершені заявки: нові, призначені, в роботі та на підтвердженні виконання.</CardDescription>
        </CardHeader>
        <CardContent>
          <FilterForm params={params} categories={categoriesResult.data} objects={objectsResult.data} workers={workersResult.data} />
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <TabLink href={buildTabHref("category", params)} active={view === "category"}>По категоріях</TabLink>
        <TabLink href={buildTabHref("worker", params)} active={view === "worker"}>По виконавцях</TabLink>
        <TabLink href={buildTabHref("object", params)} active={view === "object"}>По об'єктах</TabLink>
      </div>

      {view !== "category" ? (
        <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
          <CardContent className="pt-6 text-sm text-muted-foreground">Буде додано на наступному етапі.</CardContent>
        </Card>
      ) : (
        <form action={createWorkPlanAction} className="space-y-6">
          <Card className="rounded-3xl border-orange-500/20 bg-orange-950/10 md:rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-orange-300" />Створити тижневий план</CardTitle>
              <CardDescription>Оберіть заявки нижче, вкажіть період і створіть чернетку плану. Telegram-розсилка буде на етапі 2.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Field label="Назва плану">
                <Input name="title" required placeholder="Наприклад: План робіт на тиждень" />
              </Field>
              <Field label="Період з">
                <Input name="period_start" type="date" required />
              </Field>
              <Field label="Період по">
                <Input name="period_end" type="date" required />
              </Field>
              <div className="flex items-end">
                <SubmitButton type="submit" pendingText="Створюється..." className="min-h-11 w-full rounded-2xl md:min-h-0 md:rounded-md">
                  Створити план
                </SubmitButton>
              </div>
              <div className="md:col-span-4">
                <Field label="Примітка">
                  <Textarea name="notes" placeholder="Додатковий контекст для плану" className="min-h-20" />
                </Field>
              </div>
            </CardContent>
          </Card>

          {groupsResult.data.length === 0 ? (
            <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
              <CardContent className="pt-6 text-sm text-muted-foreground">Заявок для планування за поточними фільтрами немає.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupsResult.data.map((group) => (
                <CategoryGroup key={group.categoryId} title={group.categoryName} tickets={group.tickets} workersById={workersById} />
              ))}
            </div>
          )}
        </form>
      )}

      <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-orange-300" />Плани робіт</CardTitle>
          <CardDescription>Останні чернетки та плани. Детальна сторінка плану буде додана окремим етапом.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {plansResult.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Планів робіт поки немає.</p>
          ) : plansResult.data.map((plan) => (
            <div key={plan.id} className="grid gap-3 rounded-2xl border border-border bg-stone-950/30 p-3 text-sm md:grid-cols-[1.4fr_1fr_120px_120px_auto] md:items-center md:rounded-lg">
              <div className="min-w-0">
                <div className="break-words font-medium text-stone-100">{plan.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">Створено: {formatDate(plan.created_at)}</div>
              </div>
              <div className="text-muted-foreground">{plan.period_start} - {plan.period_end}</div>
              <Badge tone={plan.status === "draft" ? "orange" : plan.status === "done" ? "green" : "gray"}>{planStatusLabels[plan.status]}</Badge>
              <div className="text-muted-foreground">{plan.items_count ?? 0} заявок</div>
              <Button type="button" variant="outline" disabled className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Переглянути</Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterForm({
  params,
  categories,
  objects,
  workers,
  compact = false,
}: {
  params: SearchParams;
  categories: Array<{ id: string; name: string }>;
  objects: Array<{ id: string; name: string }>;
  workers: WorkerWithCategories[];
  compact?: boolean;
}) {
  return (
    <form className={cn("grid gap-3", compact ? "mt-3" : "md:grid-cols-4 xl:grid-cols-7")}>
      <input type="hidden" name="view" value={params.view ?? "category"} />
      <Field label="Період з"><Input name="from" type="date" defaultValue={params.from ?? ""} /></Field>
      <Field label="Період по"><Input name="to" type="date" defaultValue={params.to ?? ""} /></Field>
      <Field label="Категорія">
        <Select name="categoryId" defaultValue={params.categoryId ?? "all"}>
          <option value="all">Всі</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
      </Field>
      <Field label="Виконавець">
        <Select name="workerId" defaultValue={params.workerId ?? "all"}>
          <option value="all">Всі</option>
          {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
        </Select>
      </Field>
      <Field label="Статус">
        <Select name="status" defaultValue={params.status ?? ""}>
          <option value="">Всі</option>
          {planningStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </Select>
      </Field>
      <Field label="Об'єкт">
        <Select name="objectId" defaultValue={params.objectId ?? "all"}>
          <option value="all">Всі</option>
          {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
        </Select>
      </Field>
      <Field label="Призначення">
        <Select name="assignment" defaultValue={params.assignment ?? "all"}>
          <option value="all">Всі</option>
          <option value="without_worker">Без виконавця</option>
          <option value="with_worker">З виконавцем</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2 md:col-span-full md:flex">
        <SubmitButton type="submit" pendingText="Застосовується..." className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Застосувати</SubmitButton>
        <Button asChild variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md"><Link href="/work-planning">Скинути</Link></Button>
      </div>
    </form>
  );
}

function CategoryGroup({ title, tickets, workersById }: { title: string; tickets: TicketWithRelations[]; workersById: Map<string, WorkerWithCategories> }) {
  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader className="p-3 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="break-words text-lg">{title}</CardTitle>
          <Badge tone="orange">{tickets.length} заявок</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-stone-950/30 md:rounded-lg">
          <table className="w-full min-w-[720px] text-left text-xs md:text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-3">#</th>
                <th className="px-3 py-3">Номер</th>
                <th className="px-3 py-3">Об'єкт / опис</th>
                <th className="px-3 py-3">Пріоритет</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3">Виконавець</th>
                <th className="px-3 py-3 text-right">Дія</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <TicketPlanningRow key={ticket.id} ticket={ticket} workersById={workersById} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketPlanningRow({ ticket, workersById }: { ticket: TicketWithRelations; workersById: Map<string, WorkerWithCategories> }) {
  return (
    <tr className="transition hover:bg-stone-900/60">
      <td className="px-3 py-3 align-top">
        <input
          name="ticketIds"
          value={ticket.id}
          type="checkbox"
          aria-label={`Додати заявку ${ticket.number} до плану`}
          className="h-5 w-5 accent-orange-500"
        />
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top font-semibold text-orange-200">{ticket.number}</td>
      <td className="min-w-0 px-3 py-3 align-top">
        <div className="max-w-[260px] break-words font-medium text-stone-100">{ticket.object?.name ?? "-"}</div>
        <div className="mt-1 line-clamp-2 max-w-[320px] break-words text-xs text-muted-foreground">{ticket.title || ticket.description}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <Badge tone={priorityTone(ticket.priority)}>{priorityLabels[ticket.priority]}</Badge>
      </td>
      <td className="px-3 py-3 align-top">
        <Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge>
      </td>
      <td className="max-w-[160px] break-words px-3 py-3 align-top text-xs text-muted-foreground">{assignmentLabel(ticket.assignee_worker_id, workersById)}</td>
      <td className="px-3 py-3 align-top text-right">
        <Button asChild variant="outline" size="sm" className="min-h-10 rounded-2xl md:min-h-0 md:rounded-md">
          <Link href={`/tickets/${ticket.id}`}>Відкрити</Link>
        </Button>
      </td>
    </tr>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-300",
        active && "border-orange-500 bg-orange-500 text-stone-950 font-semibold",
      )}
    >
      {children}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}
