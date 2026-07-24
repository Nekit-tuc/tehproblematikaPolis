"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Download, FileSpreadsheet, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type WorkPlanningDocumentPlan = {
  id: string;
  title: string;
  itemsCount: number;
};

type Props = {
  weekStart: string;
  weekPeriod: string;
  plans: WorkPlanningDocumentPlan[];
};

function ticketWord(count: number) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  if (mod10 === 1 && mod100 !== 11) return "заявка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "заявки";
  return "заявок";
}

export function WorkPlanningDocumentsMenu({ weekStart, weekPeriod, plans }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)} className="h-11 w-full justify-between rounded-[18px] border-orange-400/25 bg-orange-500/10 px-4 text-sm font-semibold text-orange-100 hover:bg-orange-500/15 md:h-10 md:w-auto md:justify-center md:rounded-[14px] md:px-4 md:text-sm">
        Документи плану
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {open ? (
        <div className="fixed inset-0 z-[220]">
          <button type="button" aria-label="Закрити меню документів" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/65 backdrop-blur-sm" />
          <div className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto overscroll-contain rounded-t-[24px] border-t border-white/[0.12] bg-[#0b0b0b]/98 p-4 shadow-2xl shadow-black/60 md:left-auto md:right-6 md:top-24 md:bottom-auto md:w-[400px] md:rounded-[22px] md:border md:border-white/[0.12]">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-zinc-100">Документи тижня</h3>
                <p className="mt-1 text-xs text-zinc-400">{weekPeriod}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white/[0.05] text-zinc-300">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              <Link href={"/work-planning/export?week=" + weekStart} className="flex min-w-0 items-center justify-between gap-3 rounded-[16px] border border-orange-400/25 bg-orange-500/10 p-3 text-orange-100 hover:bg-orange-500/15" onClick={() => setOpen(false)}>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Скачати всі плани одним Excel</span>
                  <span className="mt-0.5 block text-xs text-orange-100/70">{plans.length} планів за вибраний тиждень</span>
                </span>
                <Download className="h-4 w-4 shrink-0" />
              </Link>
              {plans.length === 0 ? (
                <div className="rounded-[16px] border border-dashed border-white/[0.12] bg-white/[0.035] p-3 text-xs text-zinc-400">Планів для скачування ще немає.</div>
              ) : (
                plans.map((plan) => (
                  <Link key={plan.id} href={"/work-planning/" + plan.id + "/export"} className="flex min-w-0 items-center justify-between gap-3 rounded-[16px] border border-white/[0.09] bg-white/[0.045] p-3 text-zinc-200 hover:bg-white/[0.07]" onClick={() => setOpen(false)}>
                    <span className="min-w-0">
                      <span className="line-clamp-2 text-sm font-semibold leading-5">{plan.title}</span>
                      <span className="mt-0.5 block text-xs text-zinc-500">{plan.itemsCount} {ticketWord(plan.itemsCount)}</span>
                    </span>
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-orange-300" />
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
