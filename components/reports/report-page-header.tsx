import type React from "react";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ReportPageHeader({ label = "POLISSYA", title, subtitle, action }: { label?: string; title: string; subtitle: string; action?: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-white/[0.08] bg-white/[0.04] p-4 shadow-sm shadow-black/20 backdrop-blur md:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.30em] text-orange-300">{label}</p>
          <h1 className="mt-1 text-[24px] font-semibold leading-tight text-stone-50 md:text-3xl">{title}</h1>
          <p className="mt-1 max-w-2xl text-[11px] leading-relaxed text-stone-400 md:text-sm">{subtitle}</p>
        </div>
        {action ? <div className="flex shrink-0 flex-wrap gap-2">{action}</div> : null}
      </div>
    </section>
  );
}

export function ReportBackButton({ href = "/reports" }: { href?: string }) {
  return <Button asChild variant="outline" size="sm" className="h-9 rounded-2xl text-[11px]"><a href={href}>До звітів</a></Button>;
}

export function ReportExportButton({ href, label = "Excel" }: { href: string; label?: string }) {
  return (
    <Button asChild size="sm" className="h-9 rounded-2xl text-[11px]">
      <a href={href}>
        <Download className="h-3.5 w-3.5" />
        {label}
      </a>
    </Button>
  );
}


export function ReportPrintLink({ href, label = "\u0414\u0440\u0443\u043A / PDF" }: { href: string; label?: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="h-9 rounded-2xl text-[11px]">
      <a href={href}>
        <Printer className="h-3.5 w-3.5" />
        {label}
      </a>
    </Button>
  );
}
