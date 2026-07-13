import Link from "next/link";
import type React from "react";
import {
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle,
  ChevronDown,
  ClipboardList,
  Eye,
  Filter,
  FolderKanban,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Send,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
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
import { getTicketsGroupedByCategory, getWorkPlanningSummary, getWorkPlans, type PlanningFilters, type PlanningTicket, type WorkPlan, type WorkPlanStatus, type WorkPlanningSummary } from "@/lib/supabase/work-plans";
import { getActiveWorkers } from "@/lib/supabase/worker-queries";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, WorkerWithCategories } from "@/types/domain";
import { createWorkPlanAction, deleteWorkPlanAction } from "./actions";

type SearchParams = {
  view?: "category" | "worker" | "object";
  from?: string;
  to?: string;
  categoryId?: string;
  workerId?: string;
  status?: TicketStatus | "";
  objectId?: string;
  assignment?: "all" | "with_worker" | "without_worker";
  create?: string;
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

const planStatusStyle: Record<WorkPlanStatus, { stripe: string; badge: string; icon: React.ElementType }> = {
  draft: {
    stripe: "bg-zinc-500",
    badge: "border-white/[0.10] bg-white/[0.06] text-zinc-300",
    icon: Pencil,
  },
  sent: {
    stripe: "bg-blue-500",
    badge: "border-blue-400/25 bg-blue-500/12 text-blue-300",
    icon: Send,
  },
  partially_done: {
    stripe: "bg-amber-500",
    badge: "border-amber-400/25 bg-amber-500/12 text-amber-300",
    icon: CalendarDays,
  },
  done: {
    stripe: "bg-emerald-500",
    badge: "border-emerald-400/25 bg-emerald-500/12 text-emerald-300",
    icon: CheckCircle,
  },
  cancelled: {
    stripe: "bg-red-500",
    badge: "border-red-400/25 bg-red-500/12 text-red-300",
    icon: XCircle,
  },
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

function planPeriodLabel(ticket: PlanningTicket) {
  if (!ticket.plannedPlanPeriodStart || !ticket.plannedPlanPeriodEnd) return null;
  return `${ticket.plannedPlanPeriodStart} - ${ticket.plannedPlanPeriodEnd}`;
}

function plannedLabel(ticket: PlanningTicket) {
  if (!ticket.isPlanned) return null;
  return ticket.plannedPlanTitle || planPeriodLabel(ticket) || "Активний план";
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
  const createMode = params.create === "1";
  const filters = filtersFromParams(params);

  const [groupsResult, plansResult, categoriesResult, objectsResult, workersResult, summaryResult] = await Promise.all([
    getTicketsGroupedByCategory(filters),
    getWorkPlans(),
    getCategories(),
    getObjects(),
    getActiveWorkers(),
    getWorkPlanningSummary(),
  ]);

  const workersById = new Map(workersResult.data.map((worker) => [worker.id, worker]));
  const error = groupsResult.error ?? plansResult.error ?? categoriesResult.error ?? objectsResult.error ?? workersResult.error ?? summaryResult.error;
  const pageError = displayWorkPlanningError(error);
  const createError = displayWorkPlanningError(params.error);
  const ticketCount = groupsResult.data.reduce((sum, group) => sum + group.tickets.length, 0);
  const planningSummary = summaryResult.data;

  return (
    <div className="page-shell max-w-full space-y-2.5 overflow-x-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.10),transparent_28%)] pb-28 md:space-y-6 md:bg-none md:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[23px] font-bold leading-[1.05] tracking-[-0.03em] text-zinc-100 md:text-2xl">Планування робіт</h1>
          <p className="mt-1 max-w-[320px] text-[11px] leading-4 text-zinc-400 md:text-sm">Формування планів по виконавцях, категоріях і термінах заявок.</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <PlanningSummaryBadge summary={planningSummary} fallbackCount={ticketCount} />
          {!createMode ? (
            <Button asChild className="h-9 rounded-[13px] bg-gradient-to-r from-orange-500 to-orange-400 px-3 text-[11px] font-semibold text-white shadow-[0_8px_22px_rgba(249,115,22,0.22)] md:h-10 md:text-sm">
              <Link href="/work-planning?create=1"><Plus className="h-3.5 w-3.5" /><span className="md:hidden">План</span><span className="hidden md:inline">Створити план</span></Link>
            </Button>
          ) : null}
        </div>
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

      <details className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-2.5 shadow-[0_10px_28px_rgba(0,0,0,0.28)] md:hidden">
        <summary className="flex h-10 cursor-pointer list-none items-center justify-between rounded-[13px] bg-white/[0.045] px-3">
          <span className="flex items-center gap-2 text-[12px] font-semibold text-orange-200"><Filter className="h-4 w-4" />Фільтри</span>
          <span className="flex items-center gap-1.5 text-[10px] text-zinc-400">
            <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white/[0.08] px-1.5 text-[10px] font-semibold text-zinc-200">{ticketCount}</span>
            знайдено
            <ChevronDown className="h-3.5 w-3.5" />
          </span>
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

      <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
        <div className="flex min-w-0 gap-2">
          <TabLink href={buildTabHref("category", params)} active={view === "category"} icon={LayoutGrid}>По категоріях</TabLink>
          <TabLink href={buildTabHref("worker", params)} active={view === "worker"} icon={Users}>По виконавцях</TabLink>
          <TabLink href={buildTabHref("object", params)} active={view === "object"} icon={Building2}>По об'єктах</TabLink>
        </div>
      </div>

      {view !== "category" ? (
        <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
          <CardContent className="pt-6 text-sm text-muted-foreground">Буде додано на наступному етапі.</CardContent>
        </Card>
      ) : (
        <>
        {!createMode ? (
          <Button asChild className="h-11 w-full rounded-[14px] bg-gradient-to-r from-orange-500 to-orange-400 text-[12px] font-semibold text-white shadow-[0_10px_28px_rgba(249,115,22,0.25)] md:hidden">
            <Link href="/work-planning?create=1"><Plus className="h-4 w-4" />Створити тижневий план</Link>
          </Button>
        ) : null}
        <form action={createWorkPlanAction} className={cn("space-y-6", !createMode && "hidden md:block")}>
          <Card className="rounded-[18px] border-orange-500/20 bg-orange-950/10 shadow-[0_10px_28px_rgba(0,0,0,0.24)] md:rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px] md:text-lg"><FolderKanban className="h-4 w-4 text-orange-300 md:h-5 md:w-5" />Створити тижневий план</CardTitle>
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
                <SubmitButton type="submit" pendingText="Створюється..." showOverlay className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
                  Створити план
                </SubmitButton>
              </div>
              <div className="md:col-span-4">
                <Field label="Примітка">
                  <Textarea name="notes" placeholder="Додатковий контекст для плану" className="min-h-20" />
                </Field>
              </div>
              <Button asChild variant="outline" className="min-h-8 rounded-lg text-[10px] md:hidden">
                <Link href="/work-planning">Скасувати</Link>
              </Button>
            </CardContent>
          </Card>

          {groupsResult.data.length === 0 ? (
            <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
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
        </>
      )}

      <Card className="rounded-[18px] border-white/[0.08] bg-white/[0.03] shadow-[0_14px_34px_rgba(0,0,0,0.28)] md:rounded-lg">
        <CardHeader className="p-3 md:p-6">
          <div className="flex items-start gap-2.5">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-orange-400/25 bg-orange-500/15">
              <CalendarDays className="h-4 w-4 text-orange-300" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-[15px] font-bold text-zinc-100 md:text-lg">Плани робіт</CardTitle>
              <CardDescription className="mt-0.5 text-[11px] leading-4 text-zinc-400 md:text-sm">Останні чернетки та плани. Детальна сторінка плану буде додана окремим етапом.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0 md:p-6 md:pt-0">
          {plansResult.data.length === 0 ? (
            <div className="rounded-[17px] border border-dashed border-white/[0.10] bg-white/[0.025] p-4 text-center">
              <CalendarPlus className="mx-auto h-6 w-6 text-orange-300" />
              <div className="mt-2 text-[13px] font-semibold text-zinc-100">Планів робіт поки немає.</div>
              <p className="mx-auto mt-1 max-w-[260px] text-[10px] leading-4 text-zinc-400">Створіть тижневий план із доступних заявок.</p>
              <Button asChild className="mt-3 h-9 rounded-[12px] bg-gradient-to-r from-orange-500 to-orange-400 px-4 text-[11px] font-semibold text-white md:hidden">
                <Link href="/work-planning?create=1"><Plus className="h-3.5 w-3.5" />Створити план</Link>
              </Button>
            </div>
          ) : plansResult.data.map((plan) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanCard({ plan }: { plan: WorkPlan }) {
  const style = planStatusStyle[plan.status];
  const StatusIcon = style.icon;
  return (
    <div className="relative overflow-hidden rounded-[17px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.06),rgba(255,255,255,0.025))] p-3 shadow-[0_10px_26px_rgba(0,0,0,0.32)] md:grid md:grid-cols-[1.4fr_1fr_120px_120px_auto] md:items-center md:gap-3 md:rounded-lg">
      <div className={cn("absolute left-0 top-0 h-full w-[3px]", style.stripe)} />
      <div className="flex min-w-0 items-start justify-between gap-2 md:block">
        <div className="min-w-0 pl-1 md:pl-0">
          <div className="line-clamp-1 break-words text-[13px] font-bold leading-4 text-zinc-100 md:text-sm">{plan.title}</div>
          <div className="mt-1 hidden text-xs text-muted-foreground md:block">Створено: {formatDate(plan.created_at)}</div>
        </div>
        <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[9px] font-semibold md:hidden", style.badge)}>
          <StatusIcon className="h-[11px] w-[11px]" />
          {planStatusLabels[plan.status]}
        </span>
      </div>

      <div className="mt-2 flex items-center gap-1.5 pl-1 text-[10px] text-zinc-400 md:mt-0 md:pl-0 md:text-sm">
        <CalendarDays className="h-3 w-3 shrink-0 md:hidden" />
        <span className="min-w-0 break-words">{plan.period_start} - {plan.period_end}</span>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-x-2 gap-y-1.5 pl-1 md:hidden">
        <MetaItem icon={ClipboardList}>{plan.items_count ?? 0} заявок</MetaItem>
        <MetaItem icon={CalendarDays}>{formatDate(plan.created_at)}</MetaItem>
      </div>

      <div className="mt-2 hidden md:block">
        <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium", style.badge)}>
          <StatusIcon className="h-3 w-3" />
          {planStatusLabels[plan.status]}
        </span>
      </div>
      <div className="hidden text-muted-foreground md:block">{plan.items_count ?? 0} заявок</div>

      <div className="mt-3 grid grid-cols-[1fr_auto] gap-1.5 md:mt-0 md:flex md:justify-end">
        <Button asChild variant="outline" className="h-8 rounded-[10px] border-white/[0.08] bg-white/[0.035] text-[10px] text-zinc-200 md:h-auto md:rounded-md md:text-sm">
          <Link href={`/work-planning/${plan.id}`}><Eye className="h-3 w-3 md:h-4 md:w-4" />Переглянути</Link>
        </Button>
        <Button asChild variant="outline" className="h-8 w-8 rounded-[10px] border-white/[0.08] bg-white/[0.035] p-0 text-zinc-300 md:hidden">
          <Link href={`/work-planning/${plan.id}`} aria-label="Деталі плану"><MoreHorizontal className="h-3.5 w-3.5" /></Link>
        </Button>
      </div>
    </div>
  );
}


function PlanningSummaryBadge({ summary, fallbackCount }: { summary: WorkPlanningSummary; fallbackCount: number }) {
  const total = summary.totalActive || fallbackCount;
  return (
    <div className="hidden min-w-0 rounded-[12px] border border-orange-500/30 bg-orange-500/10 px-3 py-1.5 text-right text-[10px] leading-4 text-orange-100 sm:block">
      <div className="font-semibold">{summary.unplannedActive} не заплановано</div>
      <div className="text-orange-200/75">{total} активні / {summary.plannedActive} у планах</div>
    </div>
  );
}

function PlanActionsMenu({ planId }: { planId: string }) {
  return (
    <details className="group relative">
      <summary className="flex h-8 w-8 cursor-pointer list-none items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.035] text-zinc-300 hover:bg-white/[0.07]">
        <MoreHorizontal className="h-3.5 w-3.5" />
      </summary>
      <div className="absolute right-0 top-9 z-20 w-44 rounded-[12px] border border-white/[0.10] bg-[#111]/95 p-1.5 shadow-2xl shadow-black/40">
        <form action={deleteWorkPlanAction.bind(null, planId)}>
          <ConfirmSubmitButton
            type="submit"
            variant="ghost"
            className="h-8 w-full justify-start rounded-[10px] px-2 text-[11px] text-red-300 hover:bg-red-500/10"
            pendingText="Видаляємо..."
            message="Ви точно хочете видалити цей план? Заявки буде відв'язано від плану."
          >
            <Trash2 className="h-3.5 w-3.5" />
            Видалити план
          </ConfirmSubmitButton>
        </form>
      </div>
    </details>
  );
}

function MetaItem({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[10px] text-zinc-400">
      <Icon className="h-3 w-3 shrink-0 text-zinc-500" />
      <span className="min-w-0 truncate">{children}</span>
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
        <SubmitButton type="submit" pendingText="Застосовується..." className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">Застосувати</SubmitButton>
        <Button asChild variant="outline" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm"><Link href="/work-planning">Скинути</Link></Button>
      </div>
    </form>
  );
}

function CategoryGroup({ title, tickets, workersById }: { title: string; tickets: PlanningTicket[]; workersById: Map<string, WorkerWithCategories> }) {
  return (
    <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader className="p-3 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="break-words text-[13px] md:text-lg">{title}</CardTitle>
          <Badge tone="orange">{tickets.length} заявок</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-stone-950/30 md:rounded-lg">
          <table className="w-full min-w-[780px] text-left text-xs md:text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-3">#</th>
                <th className="px-3 py-3">Номер</th>
                <th className="px-3 py-3">Об'єкт / опис</th>
                <th className="px-3 py-3">Пріоритет</th>
                <th className="px-3 py-3">Статус / план</th>
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

function TicketPlanningRow({ ticket, workersById }: { ticket: PlanningTicket; workersById: Map<string, WorkerWithCategories> }) {
  const planned = plannedLabel(ticket);
  return (
    <tr className={cn("transition hover:bg-stone-900/60", ticket.isPlanned && "opacity-60")}>
      <td className="px-3 py-3 align-top">
        <input
          name="ticketIds"
          value={ticket.id}
          type="checkbox"
          disabled={ticket.isPlanned}
          aria-label={`Додати заявку ${ticket.number} до плану`}
          className="h-5 w-5 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
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
        <div className="flex max-w-[180px] flex-col gap-1">
          <Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge>
          {planned ? (
            <div className="min-w-0">
              <Badge tone="orange">Заплановано</Badge>
              <div className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-orange-100/80">
                {planned}
              </div>
            </div>
          ) : null}
        </div>
      </td>
      <td className="max-w-[160px] break-words px-3 py-3 align-top text-xs text-muted-foreground">{assignmentLabel(ticket.assignee_worker_id, workersById)}</td>
      <td className="px-3 py-3 align-top text-right">
        <Button asChild variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
          <Link href={`/tickets/${ticket.id}`}>Відкрити</Link>
        </Button>
      </td>
    </tr>
  );
}

function TabLink({ href, active, icon: Icon, children }: { href: string; active: boolean; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-[15px] border border-white/[0.08] bg-white/[0.035] px-4 text-[11px] font-semibold text-zinc-300",
        active && "border-orange-400 bg-gradient-to-r from-orange-500 to-orange-400 text-white shadow-[0_8px_22px_rgba(249,115,22,0.22)]",
      )}
    >
      <Icon className="h-[13px] w-[13px]" />
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
