import type { ReactNode } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { reportsPeriodHref, type ReportsPeriod } from "@/lib/supabase/report-queries";
import { cn } from "@/lib/utils";

const tabs: Array<{ value: ReportsPeriod; label: string }> = [
  { value: "this_week", label: "Цей тиждень" },
  { value: "previous_week", label: "Минулий" },
  { value: "month", label: "Місяць" },
  { value: "custom", label: "Період" },
];

export function ReportPeriodTabs({ basePath, active, from, to, label, periodId }: { basePath: string; active: ReportsPeriod; from: string; to: string; label: string; periodId?: string | null }) {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
      <div className="mb-2 text-[10px] text-stone-500">{label}</div>
      <div className="flex max-w-full gap-1 overflow-x-auto rounded-2xl border border-white/[0.08] bg-black/20 p-1">
        {tabs.map((tab) => <Link key={tab.value} href={reportsPeriodHref(basePath, tab.value, from, to, periodId)} className={cn("shrink-0 rounded-xl px-3 py-2 text-[11px] font-semibold text-stone-400 transition", active === tab.value && "bg-orange-500 text-black")}>{tab.label}</Link>)}
      </div>
      {active === "custom" ? (
        <form className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
          <input type="hidden" name="period" value="custom" />
          <Field label="Від"><Input name="from" type="date" defaultValue={from} className="h-9 rounded-2xl text-[12px]" /></Field>
          <Field label="До"><Input name="to" type="date" defaultValue={to} className="h-9 rounded-2xl text-[12px]" /></Field>
          <div className="flex items-end"><Button type="submit" size="sm" className="h-9 rounded-2xl text-[11px]">Застосувати</Button></div>
        </form>
      ) : null}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-[10px] text-stone-400">{label}</Label>{children}</div>;
}