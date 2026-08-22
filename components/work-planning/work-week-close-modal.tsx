"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Archive, CheckCircle2, RefreshCw, X } from "lucide-react";
import { closeWorkWeekAndRefreshPlansAction } from "@/app/(app)/work-planning/actions";
import type { WorkWeekClosePreview } from "@/lib/supabase/work-plans";

function countLabel(value: number, label: string) {
  return `${value} ${label}`;
}

export function WorkWeekCloseModal({
  preview,
  weekLabel,
}: {
  preview: WorkWeekClosePreview;
  weekLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const closeModal = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeModal();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center justify-center gap-2 rounded-2xl border border-white/[0.10] bg-white/[0.045] px-3 text-[12px] font-semibold text-zinc-100 hover:bg-white/[0.08]"
      >
        <RefreshCw className="h-4 w-4 text-orange-300" />
        Оновити систему
      </button>

      {open && typeof document !== "undefined"
        ? createPortal(
            <>
              <div className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-sm" onClick={closeModal} />
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="work-week-close-title"
                className="fixed left-1/2 top-1/2 z-[9999] flex max-h-[calc(100dvh-24px)] w-[calc(100vw-24px)] max-w-[430px] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-white/10 bg-zinc-950 shadow-2xl shadow-black/60 md:max-h-[calc(100vh-48px)] md:max-w-2xl md:rounded-3xl"
              >
                <div className="shrink-0 border-b border-white/10 p-3 md:p-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="mb-2 inline-flex h-9 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-zinc-200 hover:bg-white/10"
                  >
                    <X className="h-4 w-4" />
                    Закрити
                  </button>
                  <div className="min-w-0">
                    <h2 id="work-week-close-title" className="text-lg font-semibold text-zinc-50">
                      Оновити систему планування?
                    </h2>
                    <p className="mt-1 text-sm leading-5 text-zinc-400">
                      Система закриє всі минулі плани до поточного робочого тижня, залишить у них виконані заявки, а всі невиконані заявки виведе зі старих планів.
                    </p>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 md:p-4">
                  <div className="rounded-2xl border border-orange-400/20 bg-orange-500/10 p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-orange-100">
                      <Archive className="h-4 w-4" />
                      {weekLabel}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-orange-100/75">
                      Поточний робочий тиждень: {weekLabel}. Виконані заявки залишаться в архіві старих тижнів. Невиконані стануть доступними для додавання в поточні плани.
                    </p>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <PreviewTile label="Старих планів" value={preview.plansCount} />
                    <PreviewTile label="Активних старих планів" value={preview.activePlansCount} />
                    <PreviewTile label="Виконані залишаться" value={preview.doneItemsCount} tone="green" />
                    <PreviewTile label="Невиконані вийдуть" value={preview.notDoneItemsCount} tone="orange" />
                    <PreviewTile label="Pending review" value={preview.pendingReviewCount} />
                    <PreviewTile label="Rejected / cancelled" value={preview.rejectedCount + preview.cancelledCount} />
                  </div>

                  {preview.affectedPlans.length > 0 ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-zinc-500">Минулі плани</div>
                      <div className="mt-2 space-y-2">
                        {preview.affectedPlans.map((plan) => (
                          <div key={plan.id} className="flex items-center justify-between gap-3 text-xs">
                            <span className="min-w-0 truncate text-zinc-200">{plan.title}</span>
                            <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-zinc-400">{plan.status}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-400">
                      Старих планів не знайдено. Система все одно перевірить чернетки поточного тижня.
                    </div>
                  )}

                  {preview.activePlansCount === 0 && preview.plansCount > 0 ? (
                    <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-3 text-sm text-emerald-100">
                      Старі активні плани вже закриті. Система перевірить чернетки поточного тижня.
                    </div>
                  ) : null}
                </div>

                <div className="shrink-0 border-t border-white/10 p-3 md:p-4">
                  <div className="mb-3 flex items-start gap-2 text-xs leading-5 text-zinc-400">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
                    Ця дія не видаляє заявки і не змінює їх статуси. Видаляються тільки зв'язки невиконаних заявок зі старими планами.
                  </div>
                  <form action={closeWorkWeekAndRefreshPlansAction} className="flex gap-2">
                    <button type="button" onClick={closeModal} className="h-11 flex-1 rounded-xl border border-white/10 px-4 text-sm font-semibold text-zinc-200 hover:bg-white/10">
                      Скасувати
                    </button>
                    <button
                      type="submit"
                      className="inline-flex h-11 flex-[1.35] items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-bold text-white hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Оновити систему
                    </button>
                  </form>
                  {preview.activePlansCount === 0 ? <p className="mt-2 text-xs text-zinc-500">Старі активні плани вже закриті або відсутні. Дія лише перевірить поточні чернетки.</p> : null}
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}

function PreviewTile({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "green" | "orange" }) {
  const valueClass = tone === "green" ? "text-emerald-300" : tone === "orange" ? "text-orange-300" : "text-zinc-50";
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className={`text-xl font-bold ${valueClass}`}>{value}</div>
      <div className="mt-1 text-[11px] leading-4 text-zinc-400">{countLabel(value, label)}</div>
    </div>
  );
}
