import Link from "next/link";
import type React from "react";
import { PrintButton } from "@/components/reports/print-button";
import { requireAuth } from "@/lib/auth/server";
import { formatDateDDMMYYYY, formatDateTimeDDMMYYYYHHMM, getTicketReportRows, getTicketReportSummary } from "@/lib/reports/ticket-report-format";
import { getTicketsForPrint } from "@/lib/supabase/queries";

function toInputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeek(date = new Date()) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  const day = value.getDay() || 7;
  value.setDate(value.getDate() - day + 1);
  return value;
}

function addDays(date: Date, days: number) {
  const value = new Date(date);
  value.setDate(value.getDate() + days);
  return value;
}

function isDateParam(value?: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value ?? "");
}

function buildBackHref(params: Record<string, string>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value) search.set(key, value);
  const query = search.toString();
  return query ? `/tickets?${query}` : "/tickets";
}

export default async function TicketsPrintPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; status?: string; category?: string; priority?: string; q?: string; sort?: string }> }) {
  await requireAuth();
  const params = await searchParams;
  const weekStart = startOfWeek();
  const from = isDateParam(params.from) ? params.from! : toInputDate(weekStart);
  const to = isDateParam(params.to) ? params.to! : toInputDate(addDays(weekStart, 6));
  const filters = {
    from,
    to,
    status: params.status,
    category: params.category,
    priority: params.priority,
    q: params.q?.trim(),
    sort: params.sort,
    limit: 2000,
  };
  const ticketsResult = await getTicketsForPrint(filters);
  const rows = getTicketReportRows(ticketsResult.data);
  const summary = getTicketReportSummary(rows);
  const backHref = buildBackHref({ from, to, status: params.status ?? "", category: params.category ?? "", priority: params.priority ?? "", q: params.q ?? "", sort: params.sort ?? "" });

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
          <Link href={backHref} className="rounded-xl border border-neutral-300 px-3 py-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-100">Назад до заявок</Link>
          <PrintButton />
        </div>

        <div className="border-b-2 border-orange-500 pb-3">
          <p className="text-xs font-bold uppercase tracking-[0.28em] text-orange-600">POLISSYA SERVICE DESK AI</p>
          <h1 className="mt-1 text-2xl font-bold text-neutral-950">Звіт по заявках</h1>
          <p className="mt-1 text-sm text-neutral-600">Період: {formatDateDDMMYYYY(from)} - {formatDateDDMMYYYY(to)}</p>
          <p className="text-sm text-neutral-600">Дата формування: {formatDateTimeDDMMYYYYHHMM(new Date())}</p>
          {ticketsResult.error ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{ticketsResult.error}</p> : null}
        </div>

        <div className="my-4 grid grid-cols-5 gap-2 text-sm print:grid-cols-5">
          <Kpi label="Усього заявок" value={summary.total} />
          <Kpi label="Виконано" value={summary.completed} />
          <Kpi label="Не виконано" value={summary.unresolved} />
          <Kpi label="На підтвердженні" value={summary.waitingConfirmation} />
          <Kpi label="Високий пріоритет" value={summary.highPriority} />
        </div>

        {rows.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-5 text-sm text-neutral-600">За період {formatDateDDMMYYYY(from)} - {formatDateDDMMYYYY(to)} заявок не знайдено.</div>
        ) : (
          <div className="overflow-x-auto print:overflow-visible">
            <table className="w-full border-collapse text-[11px] leading-snug">
              <thead>
                <tr className="bg-neutral-900 text-white">
                  <Th>№</Th>
                  <Th>Номер заявки</Th>
                  <Th>Дата</Th>
                  <Th>Адреса</Th>
                  <Th>Опис заявки</Th>
                  <Th>Виконавець</Th>
                  <Th>Статус</Th>
                  <Th>Пріоритет</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={row.ticketId} className={index % 2 === 0 ? "bg-white" : "bg-neutral-50"}>
                    <Td className="w-8 text-center">{index + 1}</Td>
                    <Td className="w-28 font-semibold">{row.number}</Td>
                    <Td className="w-24">{row.date}</Td>
                    <Td className="w-48">{row.address}</Td>
                    <Td className="max-w-[360px] whitespace-normal break-words">{row.description}</Td>
                    <Td className="w-40">{row.workerName}</Td>
                    <Td className="w-36">{row.status}</Td>
                    <Td className="w-28">{row.priority}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3"><p className="text-xl font-bold text-neutral-950">{value}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p></div>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="border border-neutral-700 px-2 py-2 text-left align-middle font-bold">{children}</th>;
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`border border-neutral-300 px-2 py-2 align-top ${className}`}>{children}</td>;
}
