import Link from "next/link";
import { requireRole } from "@/lib/auth/server";
import { measureAsync } from "@/lib/performance";
import { actPeriodLabel, parseActFilters } from "@/lib/reports/director-export-filters";
import { getAdminActs } from "@/lib/supabase/work-completion-acts";
import { formatDate } from "@/lib/utils";

type Params = Record<string, string | string[] | undefined>;

export default async function AdminActsPrintPage({ searchParams }: { searchParams: Promise<Params> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const filters = parseActFilters(params, "this_week");
  const result = await measureAsync("admin-acts:print", () => getAdminActs({ ...filters, limit: 2000 }));
  const acts = result.data;

  return (
    <main className="min-h-screen bg-white p-6 text-black">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; } }`}</style>
      <div className="no-print mb-4 flex gap-2">
        <button id="print-button" type="button" className="rounded border border-black px-3 py-1 text-sm">Друкувати</button>
        <Link href="/tickets/acts" className="rounded border border-black px-3 py-1 text-sm">Назад</Link>
      </div>
      <script dangerouslySetInnerHTML={{ __html: "document.getElementById('print-button')?.addEventListener('click',()=>window.print());" }} />
      <header className="mb-6">
        <h1 className="text-2xl font-bold">Акти виконаних робіт</h1>
        <p className="text-sm">Адмінський звіт</p>
        <p className="text-sm">Період: {actPeriodLabel(filters, "this_week")}</p>
        <p className="text-sm">Дата формування: {formatDate(new Date().toISOString())}</p>
        <p className="text-sm">Кількість актів: {acts.length}</p>
      </header>
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            {["№", "Акт", "Заявка", "Директор", "Телефон", "Дата виконання", "Об'єкт", "Адреса", "Категорія", "Виконавець", "Опис"].map((header) => (
              <th key={header} className="border border-black p-1 text-left">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {acts.map((act, index) => (
            <tr key={act.id}>
              <td className="border border-black p-1">{index + 1}</td>
              <td className="border border-black p-1">{act.act_number}</td>
              <td className="border border-black p-1">{act.ticket?.number}</td>
              <td className="border border-black p-1">{act.director?.full_name}</td>
              <td className="border border-black p-1">{act.ticket?.director_phone ?? act.director?.phone}</td>
              <td className="border border-black p-1">{formatDate(act.completed_at)}</td>
              <td className="border border-black p-1">{act.object?.name}</td>
              <td className="border border-black p-1">{act.object?.address}</td>
              <td className="border border-black p-1">{act.ticket?.category?.name}</td>
              <td className="border border-black p-1">{act.worker?.name}</td>
              <td className="border border-black p-1">{act.work_description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {acts.length === 0 ? <p className="mt-4 text-sm">Актів за вибраний період не знайдено.</p> : null}
    </main>
  );
}
