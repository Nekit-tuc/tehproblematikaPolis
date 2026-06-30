import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { objectTypeLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { getObjects, getProfiles } from "@/lib/supabase/queries";
import type { CompanyObject, ObjectType } from "@/types/domain";
import { CreateObjectForm } from "./create-object-form";
import { ObjectRow } from "./object-row";

const objectTypes: ObjectType[] = ["store", "warehouse", "production", "office", "other"];

function getObjectNumber(object: CompanyObject) {
  return object.object_number || object.id.slice(0, 8);
}

function getObjectDistrict(object: CompanyObject) {
  return object.district ?? "";
}

function getObjectTypeLabel(type: CompanyObject["type"]) {
  return objectTypeLabels[type] ?? type;
}

function getNextObjectNumber(objects: CompanyObject[]) {
  const numericNumbers = objects
    .map((object) => object.object_number)
    .filter((value): value is string => typeof value === "string" && /^\d+$/.test(value.trim()));
  if (numericNumbers.length === 0) return "";

  const max = numericNumbers.reduce(
    (current, value) => {
      const number = Number.parseInt(value, 10);
      return number > current.number ? { number, width: value.length } : current;
    },
    { number: 0, width: 1 },
  );
  return String(max.number + 1).padStart(max.width, "0");
}

function getDistricts(objects: CompanyObject[]) {
  return [...new Set(objects.map((object) => getObjectDistrict(object).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "uk"));
}

function filterObjects(objects: CompanyObject[], filters: { q?: string; type?: string; status?: string; district?: string }) {
  const query = filters.q?.trim().toLowerCase();
  return objects.filter((object) => {
    if (filters.type && filters.type !== "all" && object.type !== filters.type) return false;
    if (filters.status === "active" && !object.is_active) return false;
    if (filters.status === "inactive" && object.is_active) return false;
    if (filters.district && filters.district !== "all" && getObjectDistrict(object) !== filters.district) return false;
    if (!query) return true;
    return [object.name, getObjectNumber(object), object.address, object.city, getObjectDistrict(object), ...(object.aliases ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export default async function ObjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; status?: string; district?: string; error?: string; success?: string }> }) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [objectsResult, profilesResult] = await Promise.all([getObjects(), getProfiles()]);
  const error = objectsResult.error ?? profilesResult.error ?? (params.error ? decodeURIComponent(params.error) : null);
  const filteredObjects = filterObjects(objectsResult.data, {
    q: params.q,
    type: params.type ?? "all",
    status: params.status ?? "active",
    district: params.district ?? "all",
  });
  const managers = profilesResult.data.filter((item) => item.role === "store_manager" || item.role === "management" || item.role === "tech_manager" || item.role === "admin");
  const canManage = profile.role === "admin";
  const nextObjectNumber = getNextObjectNumber(objectsResult.data);
  const districts = getDistricts(objectsResult.data);

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Об'єкти компанії</h1>
        <p className="subtle">Довідник магазинів, складів, виробництва, офісів та інших локацій.</p>
      </div>
      {error ? <Alert title="Помилка довідника об'єктів">{error}</Alert> : null}
      {params.success === "created" ? <Alert title="Об'єкт створено">Новий об'єкт додано до довідника.</Alert> : null}
      {params.success === "updated" ? <Alert title="Об'єкт оновлено">Зміни збережено.</Alert> : null}
      {params.success === "activated" ? <Alert title="Об'єкт активовано">Статус об'єкта змінено на активний.</Alert> : null}
      {params.success === "deactivated" ? <Alert title="Об'єкт деактивовано">Об'єкт приховано з активного довідника без видалення заявок.</Alert> : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Новий об'єкт</CardTitle>
            <CardDescription>Обов'язкові поля: назва, тип, номер, місто/район та адреса.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateObjectForm managers={managers} nextObjectNumber={nextObjectNumber} districts={districts} />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
          <CardDescription>Пошук працює по назві, номеру, адресі та місту.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-5">
            <Field label="Пошук"><Input name="q" defaultValue={params.q ?? ""} placeholder="Назва, номер, адреса, місто" /></Field>
            <Field label="Тип">
              <Select name="type" defaultValue={params.type ?? "all"}>
                <option value="all">Всі</option>
                {objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}
              </Select>
            </Field>
            <Field label="Статус">
              <Select name="status" defaultValue={params.status ?? "active"}>
                <option value="active">Активні</option>
                <option value="inactive">Неактивні</option>
                <option value="all">Всі</option>
              </Select>
            </Field>
            <Field label="Район">
              <Select name="district" defaultValue={params.district ?? "all"}>
                <option value="all">Всі райони</option>
                {districts.map((district) => <option key={district} value={district}>{district}</option>)}
              </Select>
            </Field>
            <div className="flex items-end gap-2">
              <Button type="submit">Застосувати</Button>
              <Button variant="outline" asChild><a href="/objects">Скинути</a></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Довідник об'єктів</CardTitle>
          <CardDescription>Знайдено: {filteredObjects.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredObjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">Об'єктів за цими фільтрами немає.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Назва</TH><TH>№</TH><TH>Тип</TH><TH>Місто / район</TH><TH>Адреса</TH><TH>Керуючий</TH><TH>Статус</TH>
                </TR>
              </THead>
              <TBody>
                {filteredObjects.map((object) => (
                  <ObjectRow key={object.id} object={object} managers={managers} canManage={canManage} districts={districts} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}
