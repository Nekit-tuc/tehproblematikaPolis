import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { objectTypeLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { getObjects, getProfiles } from "@/lib/supabase/queries";
import type { CompanyObject, ObjectType, Profile } from "@/types/domain";
import { createObjectAction, updateObjectAction } from "./actions";

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

function filterObjects(objects: CompanyObject[], filters: { q?: string; type?: string; status?: string }) {
  const query = filters.q?.trim().toLowerCase();
  return objects.filter((object) => {
    if (filters.type && filters.type !== "all" && object.type !== filters.type) return false;
    if (filters.status === "active" && !object.is_active) return false;
    if (filters.status === "inactive" && object.is_active) return false;
    if (!query) return true;
    return [object.name, getObjectNumber(object), object.address, object.city, getObjectDistrict(object), ...(object.aliases ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export default async function ObjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; status?: string; error?: string; success?: string }> }) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [objectsResult, profilesResult] = await Promise.all([getObjects(), getProfiles()]);
  const error = objectsResult.error ?? profilesResult.error ?? (params.error ? decodeURIComponent(params.error) : null);
  const filteredObjects = filterObjects(objectsResult.data, {
    q: params.q,
    type: params.type ?? "all",
    status: params.status ?? "active",
  });
  const managers = profilesResult.data.filter((item) => item.role === "store_manager" || item.role === "management" || item.role === "tech_manager" || item.role === "admin");
  const canManage = profile.role === "admin";

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Об'єкти компанії</h1>
        <p className="subtle">Довідник магазинів, складів, виробництва, офісів та інших локацій.</p>
      </div>
      {error ? <Alert title="Помилка довідника об'єктів">{error}</Alert> : null}
      {params.success === "created" ? <Alert title="Об'єкт створено">Новий об'єкт додано до довідника.</Alert> : null}
      {params.success === "updated" ? <Alert title="Об'єкт оновлено">Зміни збережено.</Alert> : null}

      {canManage ? (
        <Card>
          <CardHeader>
            <CardTitle>Новий об'єкт</CardTitle>
            <CardDescription>Обов'язкові поля: назва, тип, номер, місто/район та адреса.</CardDescription>
          </CardHeader>
          <CardContent>
            <ObjectForm action={createObjectAction} managers={managers} submitLabel="Створити об'єкт" />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Фільтри</CardTitle>
          <CardDescription>Пошук працює по назві, номеру, адресі та місту.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-4">
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
                  <TH>Назва</TH><TH>№</TH><TH>Тип</TH><TH>Місто / район</TH><TH>Адреса</TH><TH>Керуючий</TH><TH>Статус</TH><TH>Дії</TH>
                </TR>
              </THead>
              <TBody>
                {filteredObjects.map((object) => (
                  <ObjectRow key={object.id} object={object} managers={managers} canManage={canManage} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ObjectRow({ object, managers, canManage }: { object: CompanyObject; managers: Profile[]; canManage: boolean }) {
  const manager = managers.find((item) => item.id === object.manager_id);
  return (
    <>
      <TR>
        <TD className="font-medium">{object.name}</TD>
        <TD>{getObjectNumber(object)}</TD>
        <TD>{getObjectTypeLabel(object.type)}</TD>
        <TD>{object.city}{getObjectDistrict(object) ? ` / ${getObjectDistrict(object)}` : ""}</TD>
        <TD>{object.address}</TD>
        <TD>{manager?.full_name ?? "-"}</TD>
        <TD><Badge tone={object.is_active ? "green" : "gray"}>{object.is_active ? "Активний" : "Неактивний"}</Badge></TD>
        <TD>{canManage ? <details className="min-w-32"><summary className="cursor-pointer text-orange-200">Редагувати</summary></details> : "-"}</TD>
      </TR>
      {canManage ? (
        <TR>
          <TD colSpan={8} className="bg-stone-950/20">
            <details>
              <summary className="cursor-pointer py-2 text-sm text-orange-200">Форма редагування: {object.name}</summary>
              <div className="py-3">
                <ObjectForm action={updateObjectAction.bind(null, object.id)} object={object} managers={managers} submitLabel="Зберегти зміни" />
              </div>
            </details>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

function ObjectForm({
  action,
  object,
  managers,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  object?: CompanyObject;
  managers: Profile[];
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-3">
      <Field label="Назва"><Input name="name" required defaultValue={object?.name ?? ""} placeholder="Магазин Полісся 01" /></Field>
      <Field label="Тип об'єкта">
        <Select name="type" required defaultValue={object?.type ?? "store"}>
          {objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}
        </Select>
      </Field>
      <Field label="Номер об'єкта / магазину"><Input name="object_number" required defaultValue={object ? getObjectNumber(object) : ""} placeholder="001 або WH-01" /></Field>
      <Field label="Місто"><Input name="city" required defaultValue={object?.city ?? ""} placeholder="Житомир" /></Field>
      <Field label="Район"><Input name="district" defaultValue={object ? getObjectDistrict(object) : ""} placeholder="Центр" /></Field>
      <Field label="Адреса"><Input name="address" required defaultValue={object?.address ?? ""} placeholder="вул. Київська, 12" /></Field>
      <Field label="Аліаси / варіанти написання">
        <Textarea
          name="aliases"
          defaultValue={object?.aliases?.join("\n") ?? ""}
          placeholder={"Вільський шлях 115\nВільський115\nВільського шляху 115"}
          className="min-h-24"
        />
      </Field>
      <Field label="Відповідальний керуючий">
        <Select name="manager_id" defaultValue={object?.manager_id ?? ""}>
          <option value="">Не призначено</option>
          {managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.full_name}</option>)}
        </Select>
      </Field>
      <label className="flex items-center gap-2 pt-7 text-sm text-stone-200">
        <input name="is_active" type="checkbox" defaultChecked={object?.is_active ?? true} className="h-4 w-4 accent-orange-500" />
        Активний
      </label>
      <div className="flex items-end">
        <Button type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}
