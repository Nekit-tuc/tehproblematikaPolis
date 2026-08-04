import Link from "next/link";
import { requireApprovedDirector } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { parseDirectorTicketFilters, ticketPeriodLabel } from "@/lib/reports/director-export-filters";
import { getDirectorTicketsReport } from "@/lib/supabase/director-ticket-reports";
import { formatDate } from "@/lib/utils";

type Params = Record<string, string | string[] | undefined>;

export default async function DirectorTicketsPrintPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { profile } = await requireApprovedDirector();
  const params = await searchParams;
  const filters = parseDirectorTicketFilters(params);
  const result = await measureAsync("director-tickets:print", () => getDirectorTicketsReport(profile.id, { ...filters, limit: 2000 }));
  const tickets = result.data;

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="no-print mb-4 flex gap-2">
        <button id="print-button" type="button" className="rounded border border-black px-3 py-1 text-sm">Друкувати</button>
        <Link href="/director/tickets" className="rounded border border-black px-3 py-1 text-sm">Назад</Link>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-button')?.addEventListener('click',()=>window.print());" }} />
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Заявки директора</h1>
        <p className="text-sm">Директор: {profile.full_name}</p>
        <p className="text-sm">Період: {ticketPeriodLabel(filters)}</p>
        <p className="text-sm">Дата формування: {formatDate(new Date().toISOString())}</p>
        <p className="text-sm">Кількість заявок: {tickets.length}</p>
      </header>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {["№", "Заявка", "Дата створення", "Дата виконання", "Магазин", "Адреса", "Категорія", "Виконавець", "Статус", "Акт", "Опис"].map((header) => (
              <th key={header} className="border border-black p-1 text-left">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tickets.map((ticket, index) => (
            <tr key={ticket.id}>
              <td className="border border-black p-1">{index + 1}</td>
              <td className="border border-black p-1">{ticket.number}</td>
              <td className="border border-black p-1">{formatDate(ticket.created_at)}</td>
              <td className="border border-black p-1">{ticket.completed_at ? formatDate(ticket.completed_at) : ""}</td>
              <td className="border border-black p-1">{ticket.object?.name}</td>
              <td className="border border-black p-1">{ticket.object?.address}</td>
              <td className="border border-black p-1">{ticket.category?.name}</td>
              <td className="border border-black p-1">{ticket.worker?.name}</td>
              <td className="border border-black p-1">{ticket.displayStatus}</td>
              <td className="border border-black p-1">{ticket.workCompletionAct?.act_number ?? ""}</td>
              <td className="border border-black p-1">{ticket.description || ticket.title}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {tickets.length === 0 ? <p className="mt-4 text-sm">Заявок за вибраними фільтрами не знайдено.</p> : null}
    </main>
  );
}
