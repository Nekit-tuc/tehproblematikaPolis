"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, X } from "lucide-react";
import { updatePlansFromDashboardAction } from "@/app/(app)/dashboard/actions";
import type {
  DashboardPlanRefreshData,
  DashboardPlanRefreshTargetWeek,
  DashboardPlanRefreshTicket,
} from "@/lib/supabase/dashboard-plan-refresh";

const weekLabels: Record<DashboardPlanRefreshTargetWeek, string> = {
  current_week: "Поточний тиждень",
  next_week: "Наступний тиждень",
};

function formatDate(value: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(new Date(value));
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    pending_review: "На перевірці",
    new: "Нова",
    assigned: "Призначена",
    in_progress: "В роботі",
    waiting: "Очікує",
    waiting_admin_confirmation: "На підтвердженні",
    rejected: "Відхилена",
    cancelled: "Скасована",
  };
  return labels[status] ?? status;
}

function planForWeek(ticket: DashboardPlanRefreshTicket, week: DashboardPlanRefreshTargetWeek) {
  return ticket.planLinks.find((plan) => plan.weekKey === week);
}

function planOutsideWeek(ticket: DashboardPlanRefreshTicket, week: DashboardPlanRefreshTargetWeek) {
  return ticket.planLinks.find((plan) => plan.weekKey !== week);
}

function disabledReason(ticket: DashboardPlanRefreshTicket, week: DashboardPlanRefreshTargetWeek) {
  if (ticket.status === "pending_review") return "Спочатку підтвердіть заявку";
  if (ticket.status === "rejected") return "Відхилена";
  if (ticket.status === "cancelled") return "Скасована";
  if (planForWeek(ticket, week)) return "Вже додана в цей тиждень";
  if (planOutsideWeek(ticket, week)) return "Заявка вже є в іншому плані";
  return null;
}

export function PlanRefreshModal({ data, error }: { data: DashboardPlanRefreshData | null; error?: string | null }) {
  const [open, setOpen] = useState(false);
  const [targetWeek, setTargetWeek] = useState<DashboardPlanRefreshTargetWeek>("next_week");
  const selectedWeek = targetWeek === "current_week" ? data?.weeks.current : data?.weeks.next;
  const selectableCount = useMemo(() => data?.tickets.filter((ticket) => !disabledReason(ticket, targetWeek)).length ?? 0, [data, targetWeek]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-orange-400/20 bg-orange-500/10 px-3 text-[12px] font-semibold text-orange-100 hover:bg-orange-500/15"
      >
        <RefreshCw className="h-4 w-4" />
        Оновити плани
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-3 backdrop-blur-sm md:items-center md:p-6">
          <div className="max-h-[92vh] w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 p-4">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold text-zinc-50">Оновити плани</h2>
                <p className="mt-1 max-w-2xl text-sm text-zinc-400">
                  Оберіть невиконані заявки, змініть виконавця за потреби та додайте їх у план поточного або наступного тижня.
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-300 hover:bg-white/10" aria-label="Закрити">
                <X className="h-4 w-4" />
              </button>
            </div>

            {error ? <div className="m-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div> : null}

            {data ? (
              <form action={updatePlansFromDashboardAction} className="flex max-h-[calc(92vh-92px)] flex-col">
                <div className="border-b border-white/10 p-4">
                  <div className="grid gap-2 md:grid-cols-2">
                    {(["current_week", "next_week"] as DashboardPlanRefreshTargetWeek[]).map((week) => {
                      const info = week === "current_week" ? data.weeks.current : data.weeks.next;
                      const active = targetWeek === week;
                      return (
                        <label key={week} className={`cursor-pointer rounded-2xl border p-3 transition ${active ? "border-amber-400/60 bg-amber-400/10" : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
                          <input type="radio" name="targetWeek" value={week} checked={active} onChange={() => setTargetWeek(week)} className="sr-only" />
                          <span className="block text-sm font-semibold text-zinc-50">{weekLabels[week]}</span>
                          <span className="mt-1 block text-xs text-zinc-400">{formatDate(info.startIso)} - {formatDate(info.endIso)}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-zinc-500">
                    Доступно для вибору: {selectableCount}. {selectedWeek ? `Період: ${formatDate(selectedWeek.startIso)} - ${formatDate(selectedWeek.endIso)}.` : null}
                  </p>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  {data.tickets.length === 0 ? (
                    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-center text-sm text-zinc-400">Немає невиконаних заявок для оновлення планів.</div>
                  ) : (
                    <div className="space-y-3">
                      {data.tickets.map((ticket) => {
                        const reason = disabledReason(ticket, targetWeek);
                        const selectedPlan = planForWeek(ticket, targetWeek);
                        const otherPlan = planOutsideWeek(ticket, targetWeek);
                        const defaultWorker = ticket.assigneeWorkerId ?? ticket.recommendedWorkerId ?? "";
                        return (
                          <div key={ticket.id} className={`rounded-2xl border p-3 ${reason ? "border-white/10 bg-white/[0.025] opacity-75" : "border-white/10 bg-zinc-900/70"}`}>
                            <div className="flex items-start gap-3">
                              <input type="checkbox" name="ticketId" value={ticket.id} disabled={Boolean(reason)} className="mt-1 h-4 w-4 rounded border-white/20 bg-zinc-950 text-amber-400" />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="text-sm font-semibold text-zinc-50">{ticket.number ?? "Без номера"}</span>
                                  <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-zinc-300">{statusLabel(ticket.status)}</span>
                                  <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200">{ticket.sourceLabel}</span>
                                </div>
                                <p className="mt-1 truncate text-xs text-zinc-400">{ticket.objectLabel}</p>
                                <p className="mt-1 line-clamp-2 text-sm text-zinc-200">{ticket.description}</p>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-zinc-400">
                                  <span className="rounded-full bg-white/5 px-2 py-1">{ticket.categoryLabel}</span>
                                  {selectedPlan ? <span className="text-emerald-300">У плані: {selectedPlan.planTitle}</span> : null}
                                  {!selectedPlan && otherPlan ? <span className="text-amber-300">У плані іншого тижня: {otherPlan.planTitle}</span> : null}
                                  {!selectedPlan && !otherPlan ? <span>Не в плані</span> : null}
                                  {reason ? <span className="text-red-300">{reason}</span> : null}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3 grid gap-2 md:grid-cols-[1fr_240px] md:items-center">
                              <div className="text-xs text-zinc-500">Виконавець: {ticket.assigneeWorkerName ?? ticket.recommendedWorkerName ?? "Не визначено"}</div>
                              <select name={`workerId:${ticket.id}`} defaultValue={defaultWorker} disabled={Boolean(reason)} className="h-10 rounded-xl border border-white/10 bg-zinc-950 px-3 text-sm text-zinc-100 outline-none focus:border-amber-400/60">
                                <option value="">Не визначено</option>
                                {data.workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-2 border-t border-white/10 p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <AlertTriangle className="h-4 w-4 text-amber-300" />
                    Pending review не додаються в план до підтвердження.
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOpen(false)} className="h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10">Скасувати</button>
                    <button type="submit" className="inline-flex h-11 items-center rounded-xl bg-amber-400 px-4 text-sm font-bold text-black hover:bg-amber-300">
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Додати вибрані в план
                    </button>
                  </div>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}