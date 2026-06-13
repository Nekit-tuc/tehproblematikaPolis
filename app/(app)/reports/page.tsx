import { Download, FileSpreadsheet } from "lucide-react";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requireRole } from "@/lib/auth/server";
import { filterTickets, type ReportFilters } from "@/lib/reports/analytics";
import { objectTypeLabels, priorityLabels, statusLabels } from "@/lib/labels";
import { getCategories, getObjects, getProfiles, getTickets } from "@/lib/supabase/queries";
import type { TicketPriority, TicketStatus } from "@/types/domain";

function filtersFromSearch(searchParams: Record<string, string | undefined>): ReportFilters {
  return {
    from: searchParams.from,
    to: searchParams.to,
    status: (searchParams.status ?? "") as TicketStatus | "",
    categoryId: searchParams.categoryId,
    objectId: searchParams.objectId,
    assigneeId: searchParams.assigneeId,
    priority: (searchParams.priority ?? "") as TicketPriority | "",
  };
}

function queryString(filters: ReportFilters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const filters = filtersFromSearch(params);
  const [ticketsResult, objectsResult, profilesResult, categoriesResult] = await Promise.all([
    getTickets(),
    getObjects(),
    getProfiles(),
    getCategories(),
  ]);
  const error = ticketsResult.error ?? objectsResult.error ?? profilesResult.error ?? categoriesResult.error;
  const filteredTickets = filterTickets(ticketsResult.data, filters);
  const exportHref = `/reports/export${queryString(filters) ? `?${queryString(filters)}` : ""}`;
  const reports = [
    { title: "Загальний звіт по заявках", description: `${filteredTickets.length} заявок у вибірці.` },
    { title: "Звіт по магазинах", description: `${objectsResult.data.length} об'єктів у довіднику.` },
    { title: "Звіт по виконавцях", description: `${profilesResult.data.length} користувачів у системі.` },
    { title: "Звіт по категоріях", description: `${categoriesResult.data.length} категорій.` },
  ];

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Excel-звіти</h1>
          <p className="subtle">Фільтрація та експорт аналітики по заявках, об'єктах, виконавцях і категоріях.</p>
        </div>
        <Button asChild>
          <a href={exportHref}><Download className="h-4 w-4" />Експорт Excel</a>
        </Button>
      </div>
      {error ? <Alert title="Не вдалося підготувати дані для звітів">{error}</Alert> : null}
      <Card>
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
          <CardDescription>Фільтри застосовуються і до перегляду, і до Excel-файлу.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
            <Field label="Від"><Input name="from" type="date" defaultValue={filters.from} /></Field>
            <Field label="До"><Input name="to" type="date" defaultValue={filters.to} /></Field>
            <Field label="Статус">
              <Select name="status" defaultValue={filters.status ?? ""}>
                <option value="">Усі</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <Field label="Категорія">
              <Select name="categoryId" defaultValue={filters.categoryId ?? ""}>
                <option value="">Усі</option>
                {categoriesResult.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </Select>
            </Field>
            <Field label="Об'єкт">
              <Select name="objectId" defaultValue={filters.objectId ?? ""}>
                <option value="">Усі</option>
                {objectsResult.data.map((object) => <option key={object.id} value={object.id}>{object.name} · {objectTypeLabels[object.type]}</option>)}
              </Select>
            </Field>
            <Field label="Виконавець">
              <Select name="assigneeId" defaultValue={filters.assigneeId ?? ""}>
                <option value="">Усі</option>
                {profilesResult.data.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Пріоритет">
              <Select name="priority" defaultValue={filters.priority ?? ""}>
                <option value="">Усі</option>
                {Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </Select>
            </Field>
            <div className="flex items-end gap-2 md:col-span-2">
              <Button type="submit">Застосувати</Button>
              <Button variant="outline" asChild><a href="/reports">Скинути</a></Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {reports.map((report) => (
          <Card key={report.title}>
            <CardHeader>
              <FileSpreadsheet className="h-6 w-6 text-orange-300" />
              <CardTitle>{report.title}</CardTitle>
              <CardDescription>{report.description}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}
