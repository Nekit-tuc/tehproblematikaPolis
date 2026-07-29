import Link from "next/link";
import type React from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  CalendarPlus,
  CheckCircle,
  FileSpreadsheet,
  ChevronDown,
  ClipboardList,
  Eye,
  Filter,
  FolderKanban,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  UserRound,
  Plus,
  Send,
  Trash2,
  Users,
  XCircle,
} from "lucide-react";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { WorkPlanningDocumentsMenu } from "@/components/work-planning/work-planning-documents-menu";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { addDays, formatDateDDMMYYYY, getNextWorkWeekRange, getWorkWeekRange, type WorkWeekRange } from "@/lib/date/work-week";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getWorkPlanningDuplicateRepeatsForWeek, getWorkPlanningSummary, getWorkPlanningWeeksOverview, getWorkPlans, type PlanningFilters, type PlanningTicket, type WorkPlan, type WorkPlanStatus, type WorkPlanningDuplicateRepeat, type WorkPlanningSummary, type WorkPlanningWeekOverview } from "@/lib/supabase/work-plans";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, WorkerWithCategories } from "@/types/domain";
import { createWorkPlanAction, deleteWorkPlanAction, ensureAutoDraftPlansAction } from "./actions";

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
  week?: string;
  created?: string;
  carried?: string;
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

function isDateParam(value?: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function planningHref(params: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) search.set(key, value);
  });
  const query = search.toString();
  return query ? `/work-planning?${query}` : "/work-planning";
}

function weekRangeFromStart(startDate: string): WorkWeekRange {
  return getWorkWeekRange(new Date(`${startDate}T12:00:00`));
}

function buildPlanningWeeks(currentWeek: WorkWeekRange, selectedWeek: WorkWeekRange) {
  const baseStart = currentWeek.start;
  const starts = [-14, -7, 0, 7, 14, 21, 28].map((offset) => addDays(baseStart, offset));
  if (!starts.some((date) => formatDateDDMMYYYY(date) === formatDateDDMMYYYY(selectedWeek.start))) starts.push(selectedWeek.start);
  return starts
    .sort((a, b) => a.getTime() - b.getTime())
    .map((start) => {
      const range = getWorkWeekRange(start);
      const diffDays = Math.round((range.start.getTime() - currentWeek.start.getTime()) / 86400000);
      const label: WorkPlanningWeekOverview["label"] = diffDays < 0 ? "previous" : diffDays === 0 ? "current" : diffDays === 7 ? "next" : "future";
      return { startDate: range.startDate, endDate: range.endDate, label };
    });
}

function shortWeekPeriod(week: Pick<WorkPlanningWeekOverview, "startDate" | "endDate">) {
  return `${formatDateDDMMYYYY(week.startDate).slice(0, 5)}—${formatDateDDMMYYYY(week.endDate).slice(0, 5)} · 15:00`;
}

function weekBadgeLabel(label: WorkPlanningWeekOverview["label"]) {
  if (label === "previous") return "Минулий";
  if (label === "current") return "Поточний";
  if (label === "next") return "Наступний";
  return "Майбутній";
}

function weekHint(label: WorkPlanningWeekOverview["label"]) {
  if (label === "previous") return "Минулий тиждень · перегляд історії планів.";
  if (label === "current") return "Поточний тиждень · роботи, які виконуються зараз.";
  if (label === "next") return "Наступний тиждень · сюди автоматично додаються нові заявки з Telegram.";
  return "Майбутній тиждень · підготовка робіт наперед.";
}

export default async function WorkPlanningPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const view = params.view === "worker" || params.view === "object" ? params.view : "category";
  const createMode = params.create === "1";
  const currentWorkWeek = getWorkWeekRange();
  const nextWorkWeek = getNextWorkWeekRange();
  const selectedWeek = isDateParam(params.week) ? weekRangeFromStart(params.week!) : nextWorkWeek;
  const weekOptions = buildPlanningWeeks(currentWorkWeek, selectedWeek);

  const [plansResult, summaryResult, weeksOverviewResult, duplicatesResult] = await Promise.all([
    getWorkPlans({ from: selectedWeek.startIso, to: selectedWeek.endIso, limit: 100 }),
    getWorkPlanningSummary(),
    getWorkPlanningWeeksOverview(weekOptions),
    getWorkPlanningDuplicateRepeatsForWeek(selectedWeek),
  ]);

  const error = plansResult.error ?? summaryResult.error ?? weeksOverviewResult.error ?? duplicatesResult.error;
  const pageError = displayWorkPlanningError(error);
  const createError = displayWorkPlanningError(params.error);
  const planningSummary = summaryResult.data;
  const weekOverview = weeksOverviewResult.data;
  const selectedWeekBase = weekOptions.find((week) => week.startDate === selectedWeek.startDate) ?? { startDate: selectedWeek.startDate, endDate: selectedWeek.endDate, label: "future" as const };
  const selectedWeekOverview = weekOverview.find((week) => week.startDate === selectedWeek.startDate) ?? { ...selectedWeekBase, plansCount: 0, ticketsCount: 0, draftCount: 0, sentCount: 0, doneCount: 0, notDoneCount: 0, withoutWorkerCount: 0 };
  const isNextSelectedWeek = selectedWeek.startDate === nextWorkWeek.startDate;

  return (
    <div className="page-shell max-w-full space-y-2.5 overflow-x-hidden bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.10),transparent_28%)] pb-[180px] md:space-y-6 md:bg-none md:pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[23px] font-bold leading-[1.05] tracking-[-0.03em] text-zinc-100 md:text-2xl">Планування робіт</h1>
          <p className="mt-1 max-w-[320px] text-[11px] leading-4 text-zinc-400 md:text-sm">Формування планів по виконавцях, категоріях і термінах заявок.</p>
        </div>
        <div className="flex shrink-0 items-start gap-2">
          <PlanningSummaryBadge summary={planningSummary} fallbackCount={planningSummary.totalActive} />
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

      {params.success === "auto_drafts" ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title={"Авто-чернетки оновлено"}>
            <span className="break-words whitespace-normal">{"Створено нових планів: "}{params.created ?? "0"}{". Перенесено невиконаних заявок: "}{params.carried ?? "0"}{"."}</span>
          </Alert>
        </div>
      ) : null}

      <WeekSlider weeks={weekOverview} selectedWeekStart={selectedWeek.startDate} params={params} />
      <div className="flex justify-stretch md:justify-start">
        <WorkPlanningDocumentsMenu weekStart={selectedWeekOverview.startDate} weekPeriod={shortWeekPeriod(selectedWeekOverview)} plans={plansResult.data.map((plan) => ({ id: plan.id, title: plan.title, itemsCount: plan.items_count ?? 0 }))} />
      </div>

      {createMode ? (
        <form action={createWorkPlanAction} className="space-y-3">
          <Card className="rounded-[18px] border-orange-500/20 bg-orange-950/10 shadow-[0_10px_28px_rgba(0,0,0,0.24)] md:rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-[15px] md:text-lg"><FolderKanban className="h-4 w-4 text-orange-300 md:h-5 md:w-5" />Створити тижневий план</CardTitle>
              <CardDescription>Оберіть заявки, вкажіть період і створіть чернетку плану.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Field label="Назва плану">
                <Input name="title" required placeholder="Наприклад: План робіт на тиждень" />
              </Field>
              <Field label="Період з">
                <Input name="period_start" type="date" required defaultValue={selectedWeek.startDate} />
              </Field>
              <Field label="Період по">
                <Input name="period_end" type="date" required defaultValue={selectedWeek.endDate} />
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
        </form>
      ) : null}

      <PlansSection plans={plansResult.data} selectedWeek={selectedWeek} />
      <DuplicateRepeatsSection repeats={duplicatesResult.data} />


    </div>
  );
}

function WeekSlider({ weeks, selectedWeekStart, params }: { weeks: WorkPlanningWeekOverview[]; selectedWeekStart: string; params: SearchParams }) {
  const activeIndex = Math.max(0, weeks.findIndex((week) => week.startDate === selectedWeekStart));
  const activeWeek = weeks[activeIndex] ?? weeks[0];
  const previousWeek = weeks[activeIndex - 1];
  const nextWeek = weeks[activeIndex + 1];

  if (!activeWeek) return null;

  return (
    <section className="relative overflow-hidden rounded-[22px] border border-white/[0.10] bg-[radial-gradient(circle_at_50%_0%,rgba(249,115,22,0.10),transparent_34%),linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-[14px] shadow-[0_14px_34px_rgba(0,0,0,0.30)] md:rounded-[24px] md:p-5">
      <div className="flex items-start justify-between gap-3">
        {previousWeek ? (
          <Link href={planningHref({ week: previousWeek.startDate, view: params.view ?? "category" })} className="mt-9 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white/[0.08] text-xl leading-none text-zinc-100 hover:bg-white/[0.12] md:mt-12 md:h-10 md:w-10 md:text-2xl" aria-label="Попередній тиждень">&lsaquo;</Link>
        ) : (
          <span className="mt-9 h-9 w-9 shrink-0 md:mt-12 md:h-10 md:w-10" />
        )}
        <div className="min-w-0 flex-1 text-center">
          <div className="text-[11px] font-semibold text-orange-300 md:text-xs">Плани робіт</div>
          <div className="mt-1.5 text-2xl font-black leading-none tracking-[-0.03em] text-white md:mt-2 md:text-3xl">{shortWeekPeriod(activeWeek)}</div>
          <div className="mt-2 flex flex-wrap justify-center gap-1.5 md:mt-3 md:gap-2">
            <span className="inline-flex h-7 items-center rounded-full border border-orange-400/25 bg-orange-500/15 px-3 text-[11px] font-bold text-orange-200">{weekBadgeLabel(activeWeek.label)} тиждень</span>
          </div>
        </div>
        {nextWeek ? (
          <Link href={planningHref({ week: nextWeek.startDate, view: params.view ?? "category" })} className="mt-9 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white/[0.08] text-xl leading-none text-zinc-100 hover:bg-white/[0.12] md:mt-12 md:h-10 md:w-10 md:text-2xl" aria-label="Наступний тиждень">&rsaquo;</Link>
        ) : (
          <span className="mt-9 h-9 w-9 shrink-0 md:mt-12 md:h-10 md:w-10" />
        )}
      </div>
      <div className="mt-4 grid grid-cols-5 gap-1 md:mt-5 md:gap-3">
        <WeekHeroMetric icon={FolderKanban} label="Планів" value={activeWeek.plansCount} />
        <WeekHeroMetric icon={ClipboardList} label="Заявок" value={activeWeek.ticketsCount} />
        <WeekHeroMetric icon={Pencil} label="Чернеток" value={activeWeek.draftCount} />
        <WeekHeroMetric icon={Send} label="Надіслано" value={activeWeek.sentCount} />
        <WeekHeroMetric icon={UserRound} label="Без вик." value={activeWeek.withoutWorkerCount} />
      </div>
      <div className="mt-4 flex justify-center gap-2 md:mt-5">
        {weeks.map((week) => (
          <Link key={week.startDate} href={planningHref({ week: week.startDate, view: params.view ?? "category" })} aria-label={shortWeekPeriod(week)} className={cn("h-1.5 rounded-full transition-all", week.startDate === activeWeek.startDate ? "w-8 bg-orange-400" : "w-5 bg-white/20 hover:bg-white/35")} />
        ))}
      </div>
    </section>
  );
}

function WeekHeroMetric({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: number }) {
  return (
    <div className="min-w-0 text-center">
      <Icon className="mx-auto h-4 w-4 text-orange-300 md:h-5 md:w-5" />
      <div className="mt-1.5 text-lg font-bold leading-none text-white md:mt-2 md:text-xl">{value}</div>
      <div className="mt-0.5 truncate text-[10px] leading-3 text-zinc-400 md:text-xs">{label}</div>
    </div>
  );
}

function PlansSection({ plans, selectedWeek }: { plans: WorkPlan[]; selectedWeek: WorkWeekRange }) {
  return (
    <section className="rounded-[24px] border border-white/[0.10] bg-[radial-gradient(circle_at_0%_0%,rgba(249,115,22,0.08),transparent_30%),rgba(255,255,255,0.035)] p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.34)] md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-none text-zinc-100 md:text-2xl">Плани виконавців</h2>
          <p className="mt-1.5 text-xs leading-4 text-zinc-400 md:text-sm">Плани вибраного тижня {shortWeekPeriod(selectedWeek)}</p>
        </div>
        <span className="shrink-0 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-200 shadow-[0_0_20px_rgba(249,115,22,0.12)] md:text-sm">{plans.length} планів</span>
      </div>
      {plans.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-white/[0.12] bg-white/[0.025] p-4 text-center">
          <CalendarPlus className="mx-auto h-7 w-7 text-orange-300" />
          <div className="mt-2 text-[14px] font-semibold text-zinc-100">Планів на цей тиждень ще немає.</div>
          <p className="mx-auto mt-1 max-w-[280px] text-[11px] leading-4 text-zinc-400">Створіть план вручну або сформуйте авто-чернетки.</p>
        </div>
      ) : (
        <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0 xl:grid-cols-3">
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
        </div>
      )}
    </section>
  );
}

function DuplicateRepeatsSection({ repeats }: { repeats: WorkPlanningDuplicateRepeat[] }) {
  if (repeats.length === 0) return null;

  return (
    <section className="rounded-[24px] border border-orange-400/20 bg-[radial-gradient(circle_at_0%_0%,rgba(249,115,22,0.11),transparent_32%),rgba(255,255,255,0.035)] p-3.5 shadow-[0_18px_42px_rgba(0,0,0,0.34)] md:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-orange-300" />
            <h2 className="text-xl font-bold leading-none text-zinc-100 md:text-2xl">Дублі заявок</h2>
          </div>
          <p className="mt-1.5 text-xs leading-4 text-zinc-400 md:text-sm">Повідомлення з Telegram, які схожі на вже заплановані заявки.</p>
        </div>
        <span className="shrink-0 rounded-full border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-bold text-orange-200">{repeats.length} дублікатів</span>
      </div>
      <div className="space-y-2.5 md:grid md:grid-cols-2 md:gap-3 md:space-y-0">
        {repeats.map((repeat) => (
          <article key={repeat.id} className="min-w-0 rounded-[20px] border border-white/[0.09] bg-black/20 p-3">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-orange-300">{repeat.ticketNumber ?? "Основна заявка"}</div>
                <h3 className="mt-1 line-clamp-2 break-words text-sm font-semibold leading-5 text-zinc-100">{repeat.ticketTitle ?? "Повторне звернення"}</h3>
              </div>
              {repeat.confidence !== null ? <Badge tone="orange" className="shrink-0 text-[10px]">{Math.round(repeat.confidence * 100)}%</Badge> : null}
            </div>
            <div className="mt-2 grid gap-1.5 text-[11px] leading-4 text-zinc-400">
              <MetaItem icon={Building2}>{repeat.objectName ?? "Об'єкт не вказано"}</MetaItem>
              <MetaItem icon={CalendarDays}>{formatDate(repeat.createdAt)}</MetaItem>
              <MetaItem icon={FolderKanban}>{repeat.planTitle || "Активний план"}</MetaItem>
            </div>
            {repeat.objectAddress ? <p className="mt-2 line-clamp-1 break-words text-[11px] text-zinc-500">{repeat.objectAddress}</p> : null}
            <p className="mt-2 line-clamp-3 break-words rounded-[14px] border border-white/[0.07] bg-white/[0.035] p-2 text-[12px] leading-5 text-zinc-300">{repeat.rawText}</p>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <div className="text-[10px] text-zinc-500">
                {repeat.detectedBy ? `detected: ${repeat.detectedBy}` : "detected: rule"}
              </div>
              <Button asChild variant="outline" className="h-8 rounded-[11px] border-white/[0.10] bg-white/[0.04] px-3 text-[11px] text-orange-200 hover:bg-orange-500/10">
                <Link href={`/tickets/${repeat.ticketId}`}>Відкрити основну заявку</Link>
              </Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ticketWord(count: number) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return "заявка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заявки";
  return "заявок";
}

function planDisplayParts(plan: Pick<WorkPlan, "title" | "notes" | "worker_name">) {
  const normalizedTitle = plan.title.trim() || "План робіт";
  const [rawOwner, ...rest] = normalizedTitle.split(/\s+[—-]\s+/);
  const ownerName = rawOwner?.trim() || "Не призначено";
  const direction = rest.join(" - ").trim() || plan.notes?.trim() || "План робіт";
  return { ownerName, direction, title: normalizedTitle };
}

function planInitials(plan: Pick<WorkPlan, "title" | "notes" | "worker_name">) {
  const owner = planDisplayParts(plan).ownerName;
  if (owner === "Не призначено") return "-";
  const words = owner.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "-";
  return words.slice(0, 2).map((word) => word[0]?.toUpperCase()).join("").slice(0, 2);
}

function planProgress(plan: WorkPlan) {
  const total = plan.items_count ?? 0;
  const done = Math.min(plan.done_items_count ?? 0, total);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, percent };
}

function progressTone(status: WorkPlanStatus, percent: number) {
  if (status === "cancelled") return "bg-red-400";
  if (percent >= 100 || status === "done") return "bg-emerald-400";
  if (status === "sent" || status === "partially_done") return "bg-blue-400";
  return "bg-orange-400";
}

function PlanCard({ plan }: { plan: WorkPlan }) {
  const style = planStatusStyle[plan.status];
  const StatusIcon = style.icon;
  const { ownerName, direction, title } = planDisplayParts(plan);
  const progress = planProgress(plan);
  const period = shortWeekPeriod({ startDate: plan.period_start, endDate: plan.period_end });
  const withoutWorkerCount = plan.without_worker_count ?? 0;

  return (
    <div className="relative min-w-0 overflow-hidden rounded-[22px] border border-white/[0.10] bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] p-3 pl-3.5 shadow-[0_14px_30px_rgba(0,0,0,0.30)] md:p-4 md:pl-5">
      <div className={cn("absolute left-0 top-9 bottom-9 w-1 rounded-r-full", style.stripe)} />
      <div className="flex min-w-0 gap-2.5">
        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-orange-400/45 bg-orange-500/10 text-base font-bold text-orange-200 shadow-[0_0_22px_rgba(249,115,22,0.10)] md:h-12 md:w-12 md:text-lg">
          {planInitials(plan)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="line-clamp-2 break-words text-sm font-semibold leading-5 text-zinc-100 md:text-base md:leading-6">{title}</div>
          <div className="mt-1 flex min-w-0 items-center gap-1.5 text-xs leading-4 text-zinc-400">
            <UserRound className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="min-w-0 truncate">Виконавець: {ownerName}</span>
          </div>
          <div className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-zinc-500">{direction}</div>
        </div>
      </div>

      <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5">
        <span className="inline-flex h-7 items-center gap-1.5 rounded-[9px] border border-white/[0.09] bg-black/20 px-2 text-[11px] text-zinc-300">
          <ClipboardList className="h-3.5 w-3.5 text-orange-300" />
          {progress.total} {ticketWord(progress.total)}
        </span>
        <span className="inline-flex h-7 items-center gap-1.5 rounded-[9px] border border-white/[0.09] bg-black/20 px-2 text-[11px] text-zinc-300">
          <CalendarDays className="h-3.5 w-3.5 text-zinc-400" />
          {period}
        </span>
        <span className={cn("inline-flex h-7 items-center gap-1.5 rounded-[9px] border px-2 text-[11px] font-semibold", style.badge)}>
          <StatusIcon className="h-3.5 w-3.5" />
          {planStatusLabels[plan.status]}
        </span>
      </div>

      <div className="mt-2.5">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.10]">
          <div className={cn("h-full rounded-full transition-all", progressTone(plan.status, progress.percent))} style={{ width: `${progress.percent}%` }} />
        </div>
        <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] leading-4 text-zinc-400">
          {progress.total > 0 ? (
            <span>Виконано {progress.done} з {progress.total} · {progress.percent}%</span>
          ) : (
            <span>Заявок ще немає</span>
          )}
          {withoutWorkerCount > 0 ? <span className="font-semibold text-orange-300">Без виконавця: {withoutWorkerCount}</span> : null}
        </div>
      </div>

      <div className="mt-2.5 flex justify-end gap-2">
        <Button asChild variant="outline" className="h-10 w-10 rounded-full border-white/[0.12] bg-white/[0.045] p-0 text-orange-300 hover:bg-orange-500/10 hover:text-orange-200">
          <Link href={`/work-planning/${plan.id}`} aria-label={`Редагувати план ${plan.title}`}><Pencil className="h-4 w-4" /></Link>
        </Button>
        <Button asChild variant="outline" className="h-10 w-10 rounded-full border-white/[0.12] bg-white/[0.045] p-0 text-orange-300 hover:bg-orange-500/10 hover:text-orange-200">
          <Link href={`/work-planning/${plan.id}`} aria-label={`Відкрити план ${plan.title}`}><Eye className="h-4 w-4" /></Link>
        </Button>
        <PlanActionsMenu plan={plan} />
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

function deletePlanConfirmMessage(status: WorkPlanStatus) {
  if (status === "sent" || status === "partially_done") {
    return "План уже міг бути надісланий виконавцям. Видалити його? Заявки залишаться в системі без плану.";
  }
  return "Видалити цей план? Заявки залишаться в системі та стануть доступними для нового планування.";
}

function PlanActionsMenu({ plan }: { plan: WorkPlan }) {
  return (
    <details className="group relative z-30 open:z-[90]">
      <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.045] text-orange-300 hover:bg-orange-500/10 hover:text-orange-200">
        <MoreHorizontal className="h-4 w-4" />
      </summary>
      <div className="absolute right-0 top-11 z-[100] w-48 rounded-[12px] border border-white/[0.10] bg-[#111]/95 p-1.5 shadow-2xl shadow-black/40">
        {plan.status === "done" ? (
          <div className="rounded-[10px] px-2 py-2 text-[11px] leading-4 text-zinc-400">Завершений план не можна видалити.</div>
        ) : (
          <form action={deleteWorkPlanAction.bind(null, plan.id)}>
            <ConfirmSubmitButton
              type="submit"
              variant="ghost"
              className="h-8 w-full justify-start rounded-[10px] px-2 text-[11px] text-red-300 hover:bg-red-500/10"
              pendingText="Видаляємо..."
              message={deletePlanConfirmMessage(plan.status)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Видалити
            </ConfirmSubmitButton>
          </form>
        )}
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
