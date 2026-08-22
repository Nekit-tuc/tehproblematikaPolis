import type { ComponentType } from "react";
import Link from "next/link";
import { ArrowLeft, Building2, CalendarDays, CheckCircle, ChevronRight, ClipboardList, Clock, Download, Info, ListChecks, RefreshCw, RotateCcw, Send, Users } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { canConfirmTicket, canEditTicket } from "@/lib/auth/permissions";
import { requireRole } from "@/lib/auth/server";
import { formatWorkWeekDateRange } from "@/lib/date/work-week";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getCategories } from "@/lib/supabase/queries";
import { getDraftWorkPlansForMove, getWorkPlanById, getWorkPlanDispatches, getWorkPlanItems, type WorkPlan, type WorkPlanDispatch, type WorkPlanItem, type WorkPlanStatus } from "@/lib/supabase/work-plans";
import { getActiveWorkers } from "@/lib/supabase/worker-queries";
import { cn, formatDate } from "@/lib/utils";
import type { Category, Profile, TicketWithRelations, WorkerWithCategories } from "@/types/domain";
import { cancelWorkPlanAction, moveWorkPlanItemAction, removeWorkPlanItemAction, resendWorkPlanToAllAction, retryFailedWorkPlanDispatchAction, sendWorkPlanAction, updateWorkPlanAction } from "./actions";
import { QuickTicketModalButton, type QuickTicketCategory, type QuickTicketData, type QuickTicketWorker } from "./quick-ticket-modal";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string; returnTo?: string }>;
};

const planStatusLabels: Record<WorkPlanStatus, string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  partially_done: "Частково виконано",
  done: "Виконано",
  cancelled: "Скасовано",
};

const dispatchStatusLabels: Record<string, string> = {
  sent: "Надіслано",
  failed: "Помилка",
  skipped_no_telegram: "Без Telegram",
};

function safeDecode(value?: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function safeWorkPlanningReturnTo(value?: string | null) {
  if (!value) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("http://") || value.startsWith("https://")) return null;
  if (!value.startsWith("/work-planning")) return null;
  return value;
}

function fallbackReturnToForPlan(plan: Pick<WorkPlan, "period_start">) {
  return `/work-planning?week=${plan.period_start.slice(0, 10)}&view=category`;
}

function successMessage(value?: string) {
  if (!value) return null;
  if (value === "updated") return "План оновлено.";
  if (value === "item_removed") return "Заявку прибрано з плану.";
  if (value === "item_moved") return "Заявку перенесено в інший план.";
  if (value === "cancelled") return "План скасовано.";
  if (value.startsWith("sent_") || value.startsWith("retry_") || value.startsWith("resend_")) {
    const [mode, sentRaw, failedRaw, skippedRaw] = value.split("_");
    const sent = Number(sentRaw ?? 0);
    const failed = Number(failedRaw ?? 0);
    const skipped = Number(skippedRaw ?? 0);
    const prefix = mode === "retry"
      ? "Повтор невдалих завершено"
      : mode === "resend"
        ? "Повторну розсилку всім завершено"
        : "Розсилку завершено";
    if (mode === "retry" && sent === 0 && failed === 0 && skipped === 0) return "Немає невдалих надсилань для повтору.";
    if (sent > 0 && failed === 0 && skipped === 0) return mode === "sent" ? "План надіслано виконавцям." : `${prefix}. Надіслано: ${sent}.`;
    if (sent === 0 && failed === 0 && skipped > 0) return "План не надіслано: у виконавців не підключено Telegram.";
    if (sent > 0 && (failed > 0 || skipped > 0)) return `План частково надіслано: надіслано ${sent}, помилки ${failed}, немає Telegram ${skipped}.`;
    return `${prefix}. Надіслано: ${sent}, помилок: ${failed}, без Telegram: ${skipped}.`;
  }
  return null;
}

function groupItems(items: WorkPlanItem[]) {
  const groups = new Map<string, { title: string; items: WorkPlanItem[] }>();
  for (const item of items) {
    const key = item.worker_id ?? "unassigned";
    const title = item.worker?.name ?? "Без виконавця";
    const group = groups.get(key) ?? { title, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({ key, ...group }));
}

function workerCount(items: WorkPlanItem[]) {
  return new Set(items.map((item) => item.worker_id).filter(Boolean)).size;
}

function inferredWorkerFromPlanTitle(title: string) {
  if (title.startsWith("Денис")) return "Денис сантехнік";
  if (title.startsWith("Лена")) return "Лена (менеджер Гени)";
  if (title.startsWith("Нікіта")) return "Нікіта";
  if (title.startsWith("Максим")) return "Максим";
  if (title.startsWith("Женя")) return "Женя";
  if (title.includes("вікна/двері/фурнітура")) return "Віталік, фурнітура вікна/двері";
  if (title.includes("загальні будроботи/сварка")) return "Віталіка бригада";
  if (title.startsWith("Віталік")) return "Віталік";
  return null;
}

function planItemWorkerLabel(item: WorkPlanItem, plan: WorkPlan) {
  if (item.worker?.name) return item.worker.name;
  if (item.worker_id) return "Виконавець не знайдений";
  if (item.ticket?.worker?.name) return item.ticket.worker.name;
  if (item.ticket?.assignee_worker_id) return "Виконавець не знайдений";
  return inferredWorkerFromPlanTitle(plan.title) ?? "Не призначено";
}

function planProgress(items: WorkPlanItem[]) {
  const total = items.length;
  const waitingConfirmation = items.filter((item) => item.ticket?.status === "waiting_admin_confirmation").length;
  const done = items.filter((item) => item.ticket?.status === "done").length;
  const finished = waitingConfirmation + done;
  return {
    total,
    waitingConfirmation,
    done,
    remaining: Math.max(total - finished, 0),
  };
}

function retryableDispatchCount(dispatches: WorkPlanDispatch[]) {
  const latest = new Map<string, WorkPlanDispatch>();
  for (const dispatch of dispatches) {
    if (!dispatch.worker_id || latest.has(dispatch.worker_id)) continue;
    latest.set(dispatch.worker_id, dispatch);
  }
  return Array.from(latest.values()).filter((dispatch) => dispatch.status === "failed" || dispatch.status === "skipped_no_telegram").length;
}

function statusTone(status: string) {
  if (status === "sent" || status === "done") return "green";
  if (status === "draft" || status === "partially_done") return "orange";
  if (status === "failed" || status === "cancelled") return "red";
  return "gray";
}

function planStatusBadgeClass(status: WorkPlanStatus) {
  if (status === "done") return "border-emerald-400/25 bg-emerald-500/12 text-emerald-200";
  if (status === "sent") return "border-sky-400/25 bg-sky-500/12 text-sky-200";
  if (status === "cancelled") return "border-red-400/25 bg-red-500/12 text-red-200";
  return "border-orange-400/25 bg-orange-500/12 text-orange-200";
}

function priorityTone(priority?: string | null) {
  if (priority === "high" || priority === "critical") return "orange";
  if (priority === "medium") return "orange";
  return "gray";
}

function priorityStripeClass(priority?: string | null) {
  if (priority === "critical" || priority === "high") return "bg-red-500";
  if (priority === "medium") return "bg-orange-400";
  return "bg-emerald-500";
}

function metricToneClass(tone: "gray" | "green" | "orange" | "red" | "blue") {
  if (tone === "green") return "border-emerald-400/20 bg-emerald-500/10 text-emerald-300";
  if (tone === "orange") return "border-orange-400/20 bg-orange-500/10 text-orange-300";
  if (tone === "red") return "border-red-400/20 bg-red-500/10 text-red-300";
  if (tone === "blue") return "border-sky-400/20 bg-sky-500/10 text-sky-300";
  return "border-white/[0.08] bg-white/[0.05] text-zinc-300";
}

export default async function WorkPlanDetailPage({ params, searchParams }: PageProps) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [planResult, itemsResult, dispatchesResult, draftPlansResult, workersResult, categoriesResult] = await Promise.all([
    getWorkPlanById(id),
    getWorkPlanItems(id),
    getWorkPlanDispatches(id),
    getDraftWorkPlansForMove(id),
    getActiveWorkers(),
    getCategories(),
  ]);

  const plan = planResult.data;
  const items = itemsResult.data;
  const dispatches = dispatchesResult.data;
  const draftPlans = draftPlansResult.data;
  const quickWorkers = toQuickWorkers(workersResult.data);
  const quickCategories = toQuickCategories(categoriesResult.data);
  const error = safeDecode(query.error) ?? planResult.error ?? itemsResult.error ?? dispatchesResult.error ?? draftPlansResult.error ?? workersResult.error ?? categoriesResult.error;
  const success = successMessage(query.success);
  const requestedReturnTo = safeWorkPlanningReturnTo(query.returnTo);

  if (!plan) {
    return (
      <div className="page-shell pb-28 md:pb-6">
        <Alert title="План не знайдено">Перевірте посилання або поверніться до списку планів.</Alert>
        <Button asChild variant="outline" className="mt-3 w-fit">
          <Link href={requestedReturnTo ?? "/work-planning"}><ArrowLeft className="h-4 w-4" />До планування</Link>
        </Button>
      </div>
    );
  }

  const returnTo = requestedReturnTo ?? fallbackReturnToForPlan(plan);
  const isDraft = plan.status === "draft";
  const canResend = plan.status === "sent" || plan.status === "partially_done" || plan.status === "done";
  const retryableCount = retryableDispatchCount(dispatches);
  const grouped = groupItems(items);
  const progress = planProgress(items);

  return (
    <div className="page-shell max-w-full space-y-2.5 overflow-x-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.12),transparent_30%)] pb-32 md:space-y-6 md:bg-none md:pb-8">
      <div className="grid min-w-0 gap-2.5">
        <Button asChild variant="outline" size="sm" className="h-9 w-fit rounded-[13px] border-white/[0.08] bg-white/[0.035] px-3 text-[11px] text-zinc-200 md:h-auto md:rounded-md md:text-sm">
          <Link href={returnTo}><ArrowLeft className="h-3.5 w-3.5 md:h-4 md:w-4" />До планування</Link>
        </Button>

        <div className="min-w-0 rounded-[18px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-3 shadow-[0_18px_44px_rgba(0,0,0,0.32)] md:rounded-lg md:p-4">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-orange-400/25 bg-orange-500/15 text-orange-300">
              <CalendarDays className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-start gap-2">
                <h1 className="min-w-0 flex-1 break-words text-[23px] font-bold leading-[1.05] tracking-[-0.03em] text-zinc-100 md:text-2xl">{plan.title}</h1>
                <span className={cn("inline-flex h-6 shrink-0 items-center gap-1 rounded-[9px] border px-2 text-[9px] font-semibold", planStatusBadgeClass(plan.status))}>
                  <Clock className="h-2.5 w-2.5" />{planStatusLabels[plan.status]}
                </span>
              </div>
              <p className="mt-1 break-words text-[12px] leading-4 text-zinc-400 md:text-sm">{formatWorkWeekDateRange(plan.period_start, plan.period_end)}</p>
            </div>
          </div>
        </div>

        <div className="grid w-full min-w-0 grid-cols-2 gap-2 md:flex md:flex-wrap md:justify-end">
          <Button asChild variant="outline" className="h-10 min-w-0 rounded-[13px] border-white/[0.08] bg-white/[0.035] px-2 text-[11px] text-zinc-200 md:h-auto md:rounded-md md:px-3 md:text-sm">
            <Link href={`/work-planning/${plan.id}/export`}><Download className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" /><span className="truncate">Експорт плану</span></Link>
          </Button>
          {isDraft ? (
            <form action={sendWorkPlanAction.bind(null, plan.id)} className="min-w-0">
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton className="h-10 w-full rounded-[13px] bg-gradient-to-r from-orange-500 to-orange-400 px-2 text-[11px] font-semibold text-white shadow-[0_10px_28px_rgba(249,115,22,0.22)] md:h-auto md:w-auto md:rounded-md md:px-3 md:text-sm" pendingText="Надсилається...">
                <Send className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" /><span className="truncate">Надіслати</span>
              </SubmitButton>
            </form>
          ) : null}
          {canResend && retryableCount > 0 ? (
            <form action={retryFailedWorkPlanDispatchAction.bind(null, plan.id)} className="min-w-0">
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton className="h-10 w-full rounded-[13px] px-2 text-[11px] md:h-auto md:w-auto md:rounded-md md:px-3 md:text-sm" pendingText="Повторюється...">
                <RefreshCw className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" /><span className="truncate">Повторити невдалі</span>
              </SubmitButton>
            </form>
          ) : null}
          {canResend ? (
            <form action={resendWorkPlanToAllAction.bind(null, plan.id)} className="min-w-0">
              <input type="hidden" name="returnTo" value={returnTo} />
              <ConfirmSubmitButton
                type="submit"
                variant="outline"
                className="h-10 w-full rounded-[13px] border-white/[0.08] bg-white/[0.035] px-2 text-[11px] md:h-auto md:w-auto md:rounded-md md:px-3 md:text-sm"
                pendingText="Надсилається..."
                message="План уже надсилався. Ви точно хочете повторно надіслати його всім виконавцям?"
              >
                <Send className="h-3.5 w-3.5 shrink-0 md:h-4 md:w-4" /><span className="truncate">Повторно всім</span>
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="Дію не виконано"><span className="break-words whitespace-normal">{error}</span></Alert>
        </div>
      ) : null}
      {success ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="Готово"><span className="break-words whitespace-normal">{success}</span></Alert>
        </div>
      ) : null}

      {dispatches.length > 0 ? (
        <Link href="#dispatch-history" className="flex min-w-0 items-center justify-between gap-2 rounded-[13px] border border-orange-500/20 bg-orange-500/[0.08] px-3 py-2.5 text-[11px] text-orange-200 transition hover:bg-orange-500/[0.12]">
          <span className="flex min-w-0 items-center gap-2 break-words"><Info className="h-3.5 w-3.5 shrink-0 text-orange-300" />Було {dispatches.length} спроб надсилання</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-orange-300" />
        </Link>
      ) : null}

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 xl:grid-cols-8">
        <Metric label="Статус" value={planStatusLabels[plan.status]} tone={statusTone(plan.status)} icon={Clock} compact />
        <Metric label="Заявок" value={String(items.length)} icon={ClipboardList} />
        <Metric label="Виконавців" value={String(workerCount(items))} tone="blue" icon={Users} />
        <Metric label="Очікує підтвердження" value={String(progress.waitingConfirmation)} tone="orange" icon={Clock} />
        <Metric label="Виконано" value={String(progress.done)} tone="green" icon={CheckCircle} />
        <Metric label="Залишилось" value={String(progress.remaining)} tone="blue" icon={ListChecks} />
        <Metric label="Створено" value={formatDate(plan.created_at)} icon={CalendarDays} compact />
        <Metric label="Надіслано" value={plan.sent_at ? formatDate(plan.sent_at) : "Не надсилалось"} tone="orange" icon={Send} compact />
      </div>

      <Card className="rounded-[18px] border-white/[0.08] bg-white/[0.03] shadow-[0_14px_34px_rgba(0,0,0,0.28)] md:rounded-lg">
        <CardHeader className="space-y-0 p-3 md:p-6">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-orange-400/25 bg-orange-500/15 text-orange-300">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <CardTitle className="break-words text-[15px] font-bold text-zinc-100 md:text-lg">Заявки у плані</CardTitle>
              <CardDescription className="mt-0.5 break-words text-[11px] leading-4 text-zinc-400 md:text-sm">Список заявок, згрупованих за виконавцями.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-3 pt-0 md:p-6 md:pt-0">
          {grouped.length === 0 ? (
            <p className="text-[11px] text-muted-foreground md:text-sm">У плані немає заявок.</p>
          ) : grouped.map((group) => (
            <div key={group.key} className="min-w-0 space-y-2.5 rounded-[15px] border border-white/[0.06] bg-black/15 p-2.5 md:p-3">
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="flex min-w-0 items-center gap-1.5 break-words text-[12px] font-semibold text-orange-100 md:text-sm">
                    <Users className="h-3.5 w-3.5 shrink-0 text-orange-300" />{group.title}
                  </h2>
                  {group.key === "unassigned" ? <p className="mt-1 break-words text-[10px] leading-4 text-zinc-500">Група без виконавця не надсилається в Telegram.</p> : null}
                </div>
                <Badge className="h-6 shrink-0 rounded-[9px] px-2 text-[10px]" tone={group.key === "unassigned" ? "gray" : "orange"}>{group.items.length} заявок</Badge>
              </div>
              <div className="grid gap-2">
                {group.items.map((item) => <PlanItemCard key={item.id} item={item} plan={plan} draftPlans={draftPlans} workers={quickWorkers} categories={quickCategories} profile={profile} returnTo={returnTo} />)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {isDraft ? <DraftEditor plan={plan} returnTo={returnTo} /> : null}

      <DispatchHistory dispatches={dispatches} />
    </div>
  );
}

function DraftEditor({ plan, returnTo }: { plan: WorkPlan; returnTo: string }) {
  return (
    <Card className="rounded-[17px] border-orange-500/20 bg-orange-950/10 md:rounded-lg">
      <CardHeader className="p-3 md:p-6">
        <CardTitle className="text-[15px] md:text-lg">Редагування чернетки</CardTitle>
        <CardDescription className="text-[11px] leading-4 md:text-sm">Після надсилання склад і параметри плану стануть доступні тільки для перегляду.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-3 pt-0 md:space-y-4 md:p-6 md:pt-0">
        <form action={updateWorkPlanAction.bind(null, plan.id)} className="grid gap-3 md:grid-cols-4">
          <input type="hidden" name="returnTo" value={returnTo} />
          <Field label="Назва">
            <Input name="title" defaultValue={plan.title} required />
          </Field>
          <Field label="Період з">
            <Input name="period_start" type="date" defaultValue={plan.period_start.slice(0, 10)} required />
          </Field>
          <Field label="Період по">
            <Input name="period_end" type="date" defaultValue={plan.period_end.slice(0, 10)} required />
          </Field>
          <div className="flex items-end">
            <SubmitButton className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm" pendingText="Зберігається...">Зберегти</SubmitButton>
          </div>
          <div className="md:col-span-4">
            <Field label="Примітка">
              <Textarea name="notes" defaultValue={plan.notes ?? ""} className="min-h-20" />
            </Field>
          </div>
        </form>
        <form action={cancelWorkPlanAction.bind(null, plan.id)}>
          <input type="hidden" name="returnTo" value={returnTo} />
          <SubmitButton variant="destructive" className="min-h-8 w-full rounded-lg text-[10px] md:w-auto md:rounded-md md:text-sm" pendingText="Скасовується...">
            Скасувати план
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function formatRepeatDate(value?: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function toQuickWorkers(workers: WorkerWithCategories[]): QuickTicketWorker[] {
  return workers.map((worker) => ({
    id: worker.id,
    name: worker.name,
    categories: (worker.categories ?? []).map((category) => category.name).filter(Boolean),
  }));
}

function toQuickCategories(categories: Category[]): QuickTicketCategory[] {
  return categories.map((category) => ({
    id: category.id,
    name: category.name,
    description: category.description ?? null,
  }));
}

function toQuickTicketData(ticket: TicketWithRelations, workerLabel: string): QuickTicketData {
  return {
    id: ticket.id,
    number: ticket.number,
    title: ticket.title ?? "",
    description: ticket.description ?? "",
    status: ticket.status,
    priority: ticket.priority,
    createdAt: ticket.created_at,
    objectName: ticket.object?.name ?? "Об'єкт не вказано",
    objectAddress: ticket.object?.address ?? "",
    categoryId: ticket.category_id,
    categoryName: ticket.category?.name ?? "Без категорії",
    assigneeWorkerId: ticket.assignee_worker_id ?? null,
    assigneeWorkerName: ticket.worker?.name ?? workerLabel ?? null,
    repeatCount: ticket.repeat_count ?? 0,
    lastRepeatAt: ticket.last_repeat_at ?? null,
  };
}

function PlanItemCard({ item, plan, draftPlans, workers, categories, profile, returnTo }: { item: WorkPlanItem; plan: WorkPlan; draftPlans: WorkPlan[]; workers: QuickTicketWorker[]; categories: QuickTicketCategory[]; profile: Profile; returnTo: string }) {
  const ticket = item.ticket;
  const workerLabel = planItemWorkerLabel(item, plan);
  const quickTicket = ticket ? toQuickTicketData(ticket, workerLabel) : null;
  const completionNote = ticket?.status === "waiting_admin_confirmation"
    ? `Позначено виконавцем: ${ticket.worker_completed_at ? formatDate(ticket.worker_completed_at) : "-"}`
    : ticket?.status === "done"
      ? "Підтверджено адміністратором"
      : null;
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[15px] border border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.055),rgba(255,255,255,0.025))] p-2.5 pl-3.5 shadow-[0_8px_22px_rgba(0,0,0,0.24)] md:grid md:grid-cols-[120px_1fr_120px_120px_150px] md:items-center md:gap-2 md:rounded-lg md:p-3">
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", priorityStripeClass(ticket?.priority))} />
      <div className="flex min-w-0 items-start justify-between gap-2 md:block">
        <div className="flex min-w-0 items-center gap-1.5 break-words text-[12px] font-bold text-orange-100 md:text-sm">
          <ClipboardList className="h-3 w-3 shrink-0 md:hidden" />{ticket?.number ?? "-"}
        </div>
        <Badge className="h-6 shrink-0 rounded-[9px] px-2 text-[9px] md:hidden" tone={priorityTone(ticket?.priority)}>{ticket?.priority ? priorityLabels[ticket.priority] : "-"}</Badge>
      </div>
      <div className="mt-1.5 min-w-0 md:mt-0">
        <div className="flex min-w-0 items-center gap-1.5 break-words text-[13px] font-semibold text-stone-100 md:text-sm">
          <Building2 className="h-3 w-3 shrink-0 text-zinc-500 md:hidden" />{ticket?.object?.name ?? "-"}
        </div>
        <div className="mt-1 line-clamp-2 break-words text-[10px] leading-4 text-zinc-400 md:text-xs">{ticket?.title || ticket?.description || "-"}</div>
        <div className="mt-1 line-clamp-1 break-words text-[10px] text-zinc-500 md:text-xs">{ticket?.category?.name ?? item.category ?? "-"}</div>
        {ticket?.source === "director_portal" ? <Badge className="mt-1.5 w-fit rounded-[8px] px-2 text-[9px] md:text-xs" tone="orange">Від директора</Badge> : null}
        <div className="mt-1 line-clamp-1 break-words text-[10px] font-medium text-zinc-300 md:text-xs">Виконавець: {workerLabel}</div>
        {completionNote ? <div className="mt-1.5 flex items-center gap-1.5 break-words text-[9px] font-medium text-emerald-300 md:text-xs"><CheckCircle className="h-3 w-3 shrink-0" />{completionNote}</div> : null}
      </div>
      <Badge className="mt-2 hidden w-fit text-[9px] md:mt-0 md:inline-flex md:text-xs" tone={priorityTone(ticket?.priority)}>{ticket?.priority ? priorityLabels[ticket.priority] : "-"}</Badge>
      <Badge className="mt-2 w-fit rounded-[8px] px-2 text-[9px] md:mt-0 md:text-xs" tone={ticket?.status === "waiting_admin_confirmation" ? "orange" : ticket?.status === "done" ? "green" : "gray"}>{ticket?.status ? statusLabels[ticket.status] : "-"}</Badge>
      {ticket && (ticket.repeat_count ?? 0) > 0 ? (
        <Badge className="mt-2 w-fit rounded-[8px] px-2 text-[9px] md:mt-0 md:text-xs" tone="orange">Повторна · {ticket.repeat_count}{formatRepeatDate(ticket.last_repeat_at) ? " / " + formatRepeatDate(ticket.last_repeat_at) : ""}</Badge>
      ) : null}
      <div className="mt-2 grid gap-2 md:mt-0 md:flex md:justify-end">
        {ticket ? (
          <QuickTicketModalButton
            workPlanId={plan.id}
            ticket={quickTicket!}
            workers={workers}
            categories={categories}
            returnTo={returnTo}
            permissions={{
              canChangeStatus: canEditTicket(profile, ticket),
              canAssignWorker: canConfirmTicket(profile),
              canChangeCategory: canConfirmTicket(profile),
              canComment: canEditTicket(profile, ticket),
            }}
          />
        ) : null}
        {plan.status === "draft" && ticket ? (
          <form action={removeWorkPlanItemAction.bind(null, plan.id)}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <SubmitButton variant="outline" size="sm" className="h-8 w-full rounded-[10px] border-white/[0.08] bg-white/[0.035] text-[10px] md:h-auto md:w-auto md:rounded-md md:text-sm" pendingText="...">
              Прибрати
            </SubmitButton>
          </form>
        ) : null}
        {plan.status === "draft" && ticket && draftPlans.length > 0 ? (
          <form action={moveWorkPlanItemAction.bind(null, plan.id)} className="grid gap-1.5">
            <input type="hidden" name="returnTo" value={returnTo} />
            <input type="hidden" name="item_id" value={item.id} />
            <select
              name="target_plan_id"
              required
              className="h-8 w-full rounded-[10px] border border-white/[0.08] bg-black/30 px-2 text-[10px] text-zinc-100 outline-none ring-orange-400/30 focus:ring-2 md:min-w-[150px] md:rounded-md"
              defaultValue=""
            >
              <option value="" disabled>Інший план</option>
              {draftPlans.map((draftPlan) => (
                <option key={draftPlan.id} value={draftPlan.id}>{draftPlan.title}</option>
              ))}
            </select>
            <SubmitButton variant="outline" size="sm" className="h-8 w-full rounded-[10px] border-orange-400/20 bg-orange-500/10 text-[10px] text-orange-100 md:h-auto md:w-auto md:rounded-md md:text-sm" pendingText="...">
              Перенести
            </SubmitButton>
          </form>
        ) : plan.status === "draft" && ticket ? (
          <div className="rounded-[10px] border border-white/[0.08] bg-white/[0.025] px-2 py-1.5 text-[10px] leading-4 text-zinc-500">
            Немає інших планів у цьому тижні
          </div>
        ) : null}
      </div>
    </div>
  );
}
function DispatchHistory({ dispatches }: { dispatches: WorkPlanDispatch[] }) {
  return (
    <Card id="dispatch-history" className="scroll-mt-24 rounded-[18px] border-white/[0.08] bg-white/[0.03] shadow-[0_14px_34px_rgba(0,0,0,0.24)] md:rounded-lg">
      <CardHeader className="space-y-0 p-3 md:p-6">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-orange-400/25 bg-orange-500/15 text-orange-300">
            <RotateCcw className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="break-words text-[15px] font-bold text-zinc-100 md:text-lg">Історія надсилань</CardTitle>
            <CardDescription className="mt-0.5 break-words text-[11px] leading-4 text-zinc-400 md:text-sm">Результати ручної Telegram-розсилки плану виконавцям.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 md:p-6 md:pt-0">
        {dispatches.length === 0 ? (
          <p className="text-[11px] text-muted-foreground md:text-sm">План ще не надсилали.</p>
        ) : dispatches.map((dispatch, index) => (
          <div key={dispatch.id} className="min-w-0 rounded-[14px] border border-white/[0.08] bg-white/[0.025] p-2.5 text-[11px] shadow-[0_8px_20px_rgba(0,0,0,0.18)] md:grid md:grid-cols-[90px_1fr_130px_150px_1.4fr] md:items-center md:gap-2 md:text-sm">
            <div className="flex items-center justify-between gap-2 md:block">
              <div className="font-semibold text-orange-100">Спроба {dispatches.length - index}</div>
              <Badge className="h-6 rounded-[9px] px-2 text-[9px] md:hidden" tone={statusTone(dispatch.status)}>{dispatchStatusLabels[dispatch.status] ?? dispatch.status}</Badge>
            </div>
            <div className="mt-1 break-words font-semibold text-stone-100 md:mt-0">{dispatch.worker?.name ?? "Виконавець не знайдений"}</div>
            <Badge className="hidden w-fit text-[9px] md:inline-flex md:text-xs" tone={statusTone(dispatch.status)}>{dispatchStatusLabels[dispatch.status] ?? dispatch.status}</Badge>
            <div className="mt-1 flex items-center gap-1.5 text-[10px] text-zinc-400 md:mt-0 md:text-xs"><CalendarDays className="h-3 w-3 shrink-0" />{formatDate(dispatch.sent_at)}</div>
            <div className={cn("mt-1 break-words text-[10px] leading-4 md:mt-0 md:text-xs", dispatch.error ? "line-clamp-2 text-red-300" : "text-zinc-500")}>
              {dispatch.error ? `Помилка: ${dispatch.error}` : dispatch.message_id ? `Telegram message ID: ${dispatch.message_id}` : "-"}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
function Metric({ label, value, tone = "gray", icon: Icon, compact = false }: { label: string; value: string; tone?: "gray" | "green" | "orange" | "red" | "blue"; icon?: ComponentType<{ className?: string }>; compact?: boolean }) {
  return (
    <Card className="min-h-[72px] rounded-[15px] border-white/[0.08] bg-white/[0.035] md:rounded-lg">
      <CardContent className="flex h-full min-w-0 items-start justify-between gap-2 p-2.5 md:p-4">
        <div className="min-w-0">
          <div className="break-words text-[10px] leading-3 text-zinc-400 md:text-xs">{label}</div>
          <div className={cn("mt-1.5 break-words font-bold leading-tight text-stone-100", compact ? "text-[12px] md:text-sm" : "text-[18px] md:text-xl")}>{value}</div>
        </div>
        {Icon ? (
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border", metricToneClass(tone))}>
            <Icon className="h-3.5 w-3.5" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
