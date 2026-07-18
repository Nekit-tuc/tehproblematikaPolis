import Link from "next/link";
import { priorityLabels, statusLabels } from "@/lib/labels";
import type { ReportTicketRow } from "@/lib/supabase/report-queries";

export function ReportTicketTable({ title, rows, empty }: { title: string; rows: ReportTicketRow[]; empty: string }) {
  return (
    <section className="rounded-[18px] border border-white/[0.08] bg-white/[0.035] p-3 shadow-sm shadow-black/20">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[14px] font-semibold text-stone-100">{title}</h2>
        <span className="rounded-full bg-white/[0.07] px-2 py-1 text-[10px] text-stone-300">{rows.length}</span>
      </div>
      <div className="space-y-2 md:hidden">
        {rows.length ? rows.map((row) => <TicketCard key={row.id} row={row} />) : <Empty text={empty} />}
      </div>
      <div className="hidden overflow-x-auto md:block">
        {rows.length ? (
          <table className="w-full min-w-[760px] text-left text-[12px]">
            <thead className="text-[10px] uppercase tracking-wide text-stone-500"><tr><th className="p-2">№ заявки</th><th className="p-2">Об'єкт</th><th className="p-2">Категорія</th><th className="p-2">Виконавець</th><th className="p-2">Статус</th><th className="p-2">Пріоритет</th></tr></thead>
            <tbody>{rows.map((row) => <tr key={row.id} className="border-t border-white/[0.06]"><td className="p-2 font-semibold text-orange-200"><Link href={`/tickets/${row.id}`}>{row.number}</Link></td><td className="p-2 text-stone-300">{row.objectName}</td><td className="p-2 text-stone-400">{row.categoryName}</td><td className="p-2 text-stone-400">{row.assigneeName}</td><td className="p-2 text-stone-300">{statusLabels[row.status]}</td><td className="p-2 text-stone-300">{priorityLabels[row.priority]}</td></tr>)}</tbody>
          </table>
        ) : <Empty text={empty} />}
      </div>
    </section>
  );
}

function TicketCard({ row }: { row: ReportTicketRow }) {
  return <Link href={`/tickets/${row.id}`} className="block rounded-2xl border border-white/[0.07] bg-black/20 p-3 active:bg-white/[0.05]"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="text-[10px] font-semibold text-orange-300">{row.number}</p><h3 className="mt-0.5 line-clamp-2 text-[13px] font-semibold text-stone-100">{row.title}</h3></div><span className="shrink-0 rounded-full bg-white/[0.07] px-2 py-1 text-[9px] text-stone-300">{priorityLabels[row.priority]}</span></div><div className="mt-2 grid gap-1 text-[10px] text-stone-500"><p className="truncate">{row.objectName}</p><p className="truncate">{row.categoryName} · {row.assigneeName}</p><p>{statusLabels[row.status]}</p></div></Link>;
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-2xl border border-dashed border-white/[0.08] p-3 text-[11px] text-stone-500">{text}</p>;
}