import Link from "next/link";
import type React from "react";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/reports/print-button";
import { requireRole } from "@/lib/auth/server";
import { getWorkerById, getWorkerTicketCompletionDate, getWorkerTicketOverview, type WorkerPlanTicketRow } from "@/lib/supabase/worker-queries";

type SearchParams = {
  period?: string;
  from?: string;
  to?: string;
};

const statusLabels: Record<string, string> = {
  pending_review: "AI-перевірка",
  new: "Нова",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На підтвердженні",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const priorityLabels: Record<string, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

function formatDateTime(value: Date | string) {
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(value));
}

function backHref(workerId: string, params: SearchParams) {
  const search = new URLSearchParams();
  if (params.period) search.set("period", params.period);
  if (params.from) search.set("from", params.from);
  if (params.to) search.set("to", params.to);
  const query = search.toString();
  return query ? `/workers/${workerId}?${query}` : `/workers/${workerId}`;
}

export default async function WorkerPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<SearchParams>;
}) {
  await requireRole(["admin", "management", "tech_manager"]);
  const { id } = await params;
  const query = await searchParams;
  const [workerResult, overviewResult] = await Promise.all([getWorkerById(id), getWorkerTicketOverview(id, query.period, query.from, query.to)]);

  if (!workerResult.data && !workerResult.error) notFound();
  const worker = workerResult.data;
  const overview = overviewResult.data;

  return (
    <main className="min-h-screen bg-neutral-100 px-3 py-4 text-neutral-950 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white !important; }
          aside, nav, header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          tr { page-break-inside: avoid; }
          table { page-break-inside: auto; }
          thead { display: table-header-group; }
        }
      `}</style>

      <section className="mx-auto max-w-[1180px] rounded-2xl bg-white p-5 shadow-xl shadow-black/10 print:max-w-none print:rounded-none print:p-0 print:shadow-none">
        <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
          <Link href={backHref(id, query)} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100">
            Назад до виконавця
          </Link>
          <PrintButton label="Друкувати / PDF" />
        </div>

        <div className="border-b-2 border-orange-500 pb-3">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-600">POLISSYA SERVICE DESK AI</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-950">Звіт по виконавцю</h1>
          <p className="mt-1 text-sm text-neutral-600">Виконавець: {worker?.name ?? "-"}</p>
          <p className="text-sm text-neutral-600">Період: {overview.period.label}</p>
          <p className="text-sm text-neutral-600">Дата формування: {formatDateTime(new Date())}</p>
          {workerResult.error || overviewResult.error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{workerResult.error ?? overviewResult.error}</p> : null}
        </div>

        <div className="my-4 grid grid-cols-4 gap-2 text-sm print:grid-cols-4">
          <Kpi label="Закріплено активних" value={overview.stats.active} />
          <Kpi label="У планах за період" value={overview.stats.planned} />
          <Kpi label="Виконано за період" value={overview.stats.completed} />
          <Kpi label="На підтвердженні" value={overview.stats.waitingConfirmation} />
        </div>

        <h2 className="mb-2 text-lg font-bold text-neutral-950">Виконані заявки</h2>
        {overview.completedTickets.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">Виконаних заявок за вибраний період немає.</div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[11px] leading-snug">
              <thead>
                <tr className="bg-neutral-900 text-white">
                  <Th>№</Th>
                  <Th>Номер заявки</Th>
                  <Th>Дата виконання</Th>
                  <Th>Адреса / об'єкт</Th>
                  <Th>Опис</Th>
                  <Th>Категорія</Th>
                  <Th>Статус</Th>
                  <Th>Пріоритет</Th>
                  <Th>План</Th>
                </tr>
              </thead>
              <tbody>
                {overview.completedTickets.map((row, index) => (
                  <PrintRow key={row.ticketId} row={row} index={index} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function PrintRow({ row, index }: { row: WorkerPlanTicketRow; index: number }) {
  const ticket = row.ticket;
  return (
    <tr className={index % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
      <Td className="w-8 text-center">{index + 1}</Td>
      <Td className="w-28 font-semibold">{ticket.number}</Td>
      <Td className="w-24">{formatDate(getWorkerTicketCompletionDate(ticket))}</Td>
      <Td className="w-52">{ticket.object?.name ?? "-"}<br />{ticket.object?.address ?? "-"}</Td>
      <Td className="max-w-[360px] whitespace-normal break-words">{ticket.description}</Td>
      <Td className="w-36">{ticket.category?.name ?? "-"}</Td>
      <Td className="w-32">{statusLabels[ticket.status] ?? ticket.status}</Td>
      <Td className="w-24">{priorityLabels[ticket.priority] ?? ticket.priority}</Td>
      <Td className="w-40">{row.plan?.title ?? "-"}</Td>
    </tr>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-xl font-bold text-neutral-950">{value}</p>
      <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-neutral-700 px-2 py-2 text-left align-middle font-bold">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-neutral-300 px-2 py-2 align-top ${className}`}>{children}</td>;
}
