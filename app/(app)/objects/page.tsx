import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { objectTypeLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { getObjects, getProfiles } from "@/lib/supabase/queries";
import type { CompanyObject, ObjectType, Profile } from "@/types/domain";
import { CreateObjectForm } from "./create-object-form";
import { setObjectActiveAction, updateObjectAction } from "./actions";
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
        <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
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
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Застосувати</Button>
              <Button variant="outline" asChild className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md"><a href="/objects">Скинути</a></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-3 md:hidden">
        {filteredObjects.length === 0 ? (
          <div className="mobile-card p-4 text-sm text-stone-500">Об'єктів за цими фільтрами немає.</div>
        ) : (
          filteredObjects.map((object) => (
            <MobileObjectCard key={object.id} object={object} managers={managers} canManage={canManage} districts={districts} />
          ))
        )}
      </div>

      <Card className="hidden md:block">
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

function MobileObjectCard({ object, managers, canManage, districts }: { object: CompanyObject; managers: Profile[]; canManage: boolean; districts: string[] }) {
  const manager = managers.find((item) => item.id === object.manager_id);

  return (
    <div className="mobile-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-orange-300">№ {getObjectNumber(object)}</div>
          <h2 className="mt-1 text-base font-semibold">{object.name}</h2>
          <p className="mt-1 text-sm text-stone-400">{object.address}</p>
          <p className="mt-1 text-xs text-stone-500">{object.city}{getObjectDistrict(object) ? ` · ${getObjectDistrict(object)}` : ""}</p>
        </div>
        <Badge tone={object.is_active ? "green" : "gray"}>{object.is_active ? "Активний" : "Неактивний"}</Badge>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
        <Info label="Тип" value={getObjectTypeLabel(object.type)} />
        <Info label="Керуючий" value={manager?.full_name ?? "-"} />
      </div>
      {canManage ? (
        <div className="mt-4 space-y-2">
          <form action={setObjectActiveAction.bind(null, object.id, !object.is_active)}>
            <Button type="submit" variant="outline" className="min-h-11 w-full rounded-2xl">
              {object.is_active ? "Зробити неактивним" : "Активувати"}
            </Button>
          </form>
          <details className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-orange-200">Редагувати</summary>
            <form action={updateObjectAction.bind(null, object.id)} className="mt-4 grid gap-3">
              <Field label="Назва"><Input name="name" required defaultValue={object.name} /></Field>
              <Field label="Тип"><Select name="type" required defaultValue={object.type}>{objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}</Select></Field>
              <Field label="Номер"><Input name="object_number" required defaultValue={getObjectNumber(object)} /></Field>
              <Field label="Місто"><Input name="city" required defaultValue={object.city} /></Field>
              <Field label="Район">
                <Select name="district" defaultValue={getObjectDistrict(object)}>
                  <option value="">Не вибрано</option>
                  {districts.map((district) => <option key={district} value={district}>{district}</option>)}
                </Select>
              </Field>
              <Field label="Інший район"><Input name="other_district" /></Field>
              <Field label="Адреса"><Input name="address" required defaultValue={object.address} /></Field>
              <Field label="Аліаси"><textarea name="aliases" defaultValue={object.aliases?.join("\n") ?? ""} className="min-h-28 w-full rounded-2xl border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
              <Field label="Керуючий">
                <Select name="manager_id" defaultValue={object.manager_id ?? ""}>
                  <option value="">Не призначено</option>
                  {managers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input name="is_active" type="checkbox" defaultChecked={object.is_active} className="h-4 w-4 accent-orange-500" />
                Активний
              </label>
              <Button type="submit" className="min-h-11 rounded-2xl">Зберегти</Button>
            </form>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 truncate text-sm">{value}</div>
    </div>
  );
}
