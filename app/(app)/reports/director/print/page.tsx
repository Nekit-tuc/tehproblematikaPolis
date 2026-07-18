import Link from "next/link";
import { PrintButton } from "@/components/reports/print-button";
import { requireRole } from "@/lib/auth/server";
import { getReportsDashboardData, reportsPeriodHref } from "@/lib/supabase/report-queries";

const text = {
  brand: "\u0050\u004f\u004c\u0049\u0053\u0053\u0059\u0041 \u0053\u0045\u0052\u0056\u0049\u0043\u0045 \u0044\u0045\u0053\u004b \u0041\u0049",
  reportTitle: "\u0417\u0432\u0456\u0442 \u0434\u043b\u044f \u0434\u0438\u0440\u0435\u043a\u0442\u043e\u0440\u0430",
  period: "\u041f\u0435\u0440\u0456\u043e\u0434",
  summary: "\u0412\u0438\u043a\u043e\u043d\u0430\u0432\u0447\u0435 \u0440\u0435\u0437\u044e\u043c\u0435",
  kpi: "\u041a\u043b\u044e\u0447\u043e\u0432\u0456 \u043f\u043e\u043a\u0430\u0437\u043d\u0438\u043a\u0438",
  total: "\u0423\u0441\u044c\u043e\u0433\u043e \u0437\u0432\u0435\u0440\u043d\u0435\u043d\u044c",
  completed: "\u0412\u0438\u043a\u043e\u043d\u0430\u043d\u043e",
  unresolved: "\u041d\u0435 \u0432\u0438\u043a\u043e\u043d\u0430\u043d\u043e",
  problematic: "\u041f\u0440\u043e\u0431\u043b\u0435\u043c\u043d\u0456",
  carried: "\u041f\u043e\u0432\u0442\u043e\u0440\u043d\u0456 / \u043f\u0435\u0440\u0435\u043d\u0435\u0441\u0435\u043d\u0456",
  dynamics: "\u0414\u0438\u043d\u0430\u043c\u0456\u043a\u0430 \u0437\u0432\u0435\u0440\u043d\u0435\u043d\u044c",
  stores: "\u041d\u0430\u0439\u043f\u0440\u043e\u0431\u043b\u0435\u043c\u043d\u0456\u0448\u0456 \u043c\u0430\u0433\u0430\u0437\u0438\u043d\u0438",
  workers: "\u0420\u043e\u0431\u043e\u0442\u0430 \u0432\u0438\u043a\u043e\u043d\u0430\u0432\u0446\u0456\u0432",
  recommendations: "\u0412\u0438\u0441\u043d\u043e\u0432\u043a\u0438 \u0456 \u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446\u0456\u0457",
  print: "\u0414\u0440\u0443\u043a\u0443\u0432\u0430\u0442\u0438 / \u0417\u0431\u0435\u0440\u0435\u0433\u0442\u0438 PDF",
  back: "\u041d\u0430\u0437\u0430\u0434 \u0434\u043e \u0437\u0432\u0456\u0442\u0443",
  object: "\u041e\u0431'\u0454\u043a\u0442",
  address: "\u0410\u0434\u0440\u0435\u0441\u0430",
  count: "\u041a\u0456\u043b\u044c\u043a\u0456\u0441\u0442\u044c",
  worker: "\u0412\u0438\u043a\u043e\u043d\u0430\u0432\u0435\u0446\u044c",
  assigned: "\u041f\u0440\u0438\u0437\u043d\u0430\u0447\u0435\u043d\u043e",
  efficiency: "\u0415\u0444\u0435\u043a\u0442\u0438\u0432\u043d\u0456\u0441\u0442\u044c",
  waiting: "\u041e\u0447\u0456\u043a\u0443\u0454",
  noData: "\u0414\u0430\u043d\u0438\u0445 \u0437\u0430 \u043e\u0431\u0440\u0430\u043d\u0438\u0439 \u043f\u0435\u0440\u0456\u043e\u0434 \u043d\u0435\u043c\u0430\u0454.",
};

export default async function DirectorPrintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const result = await getReportsDashboardData(params.period, params.from, params.to, params.periodId);
  const data = result.data;
  const maxTrend = Math.max(1, ...data.weeklyTrend.map((point) => point.count));
  const topWorkers = data.workerRows.filter((row) => row.assigned > 0).slice(0, 5);
  const lowWorkers = data.workerRows.filter((row) => row.assigned > 0).sort((a, b) => a.efficiency - b.efficiency || b.assigned - a.assigned).slice(0, 5);
  const backHref = reportsPeriodHref("/reports/director", data.periodRange.period, data.periodRange.from, data.periodRange.to, params.periodId);

  return (
    <main className="min-h-screen bg-neutral-200 px-3 py-4 text-neutral-950 print:bg-white print:p-0">
      <style>{`
        @page { size: A4; margin: 14mm; }
        @media print {
          .no-print { display: none !important; }
          .print-document { width: auto !important; min-height: auto !important; box-shadow: none !important; border: 0 !important; padding: 0 !important; }
          body { background: white !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          section { page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mx-auto mb-3 flex max-w-[210mm] items-center justify-between gap-2">
        <Link href={backHref} className="rounded-full border border-neutral-300 bg-white px-4 py-2 text-[12px] font-semibold text-neutral-800 shadow-sm">{text.back}</Link>
        <PrintButton label={text.print} />
      </div>

      <article className="print-document mx-auto min-h-[297mm] w-full max-w-[210mm] space-y-7 bg-white p-8 shadow-2xl md:p-10">
        <header className="border-b border-neutral-200 pb-6">
          <p className="text-[11px] font-bold uppercase tracking-[0.34em] text-orange-600">{text.brand}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-neutral-950">{text.reportTitle}</h1>
              <p className="mt-2 text-sm text-neutral-600">{text.period}: {data.periodRange.label}</p>
            </div>
            <p className="text-right text-[11px] text-neutral-500">{new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())}</p>
          </div>
        </header>

        <section>
          <h2 className="text-lg font-bold text-neutral-950">{text.summary}</h2>
          <p className="mt-3 rounded-2xl border border-orange-200 bg-orange-50 p-4 text-sm leading-7 text-neutral-800">{data.directorSummaryText}</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-neutral-950">{text.kpi}</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
            <Kpi label={text.total} value={data.totalTickets} />
            <Kpi label={text.completed} value={data.completedTickets} note={`${data.completionRate}%`} />
            <Kpi label={text.unresolved} value={data.unresolvedTickets} />
            <Kpi label={text.problematic} value={data.problematicTickets} />
            <Kpi label={text.carried} value={data.waitingConfirmationTickets} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-neutral-950">{text.dynamics}</h2>
          <div className="mt-3 rounded-2xl border border-neutral-200 p-4">
            <div className="flex h-40 items-end gap-2">
              {data.weeklyTrend.map((point) => (
                <div key={point.iso} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                  <div className="w-full max-w-8 rounded-t bg-orange-500" style={{ height: Math.max(6, Math.round((point.count / maxTrend) * 116)) }} />
                  <span className="text-[9px] text-neutral-500">{point.label}</span>
                  <span className="text-[10px] font-semibold text-neutral-800">{point.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-neutral-950">{text.stores}</h2>
          <Table headers={["#", text.object, text.address, text.count]} rows={data.topProblemObjects.slice(0, 5).map((row, index) => [index + 1, row.name, row.subtitle ?? "-", row.count])} />
        </section>

        <section className="grid gap-5 md:grid-cols-2">
          <div>
            <h2 className="text-lg font-bold text-neutral-950">{text.workers}: TOP</h2>
            <Table headers={[text.worker, text.assigned, text.completed, text.efficiency]} rows={topWorkers.map((row) => [row.name, row.assigned, row.completed, `${row.efficiency}%`])} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-neutral-950">{text.workers}: LOW</h2>
            <Table headers={[text.worker, text.assigned, text.waiting, text.efficiency]} rows={lowWorkers.map((row) => [row.name, row.assigned, row.waitingConfirmation, `${row.efficiency}%`])} />
          </div>
        </section>

        <section>
          <h2 className="text-lg font-bold text-neutral-950">{text.recommendations}</h2>
          <div className="mt-3 space-y-2">
            {data.directorRecommendations.map((item, index) => (
              <p key={item} className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 text-sm leading-6 text-neutral-800"><strong>{index + 1}.</strong> {item}</p>
            ))}
          </div>
        </section>
      </article>
    </main>
  );
}

function Kpi({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-950">{value}</p>
      {note ? <p className="text-[11px] text-orange-700">{note}</p> : null}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead className="bg-neutral-100 text-[10px] uppercase tracking-wide text-neutral-500">
          <tr>{headers.map((header) => <th key={header} className="border-b border-neutral-200 px-3 py-2 font-bold">{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length ? rows.map((row, index) => (
            <tr key={index} className="odd:bg-white even:bg-neutral-50">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="border-b border-neutral-100 px-3 py-2 align-top text-neutral-800">{cell}</td>)}
            </tr>
          )) : <tr><td className="px-3 py-4 text-neutral-500" colSpan={headers.length}>{text.noData}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}