"use client";

import type React from "react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TD, TR } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { objectTypeLabels } from "@/lib/labels";
import type { CompanyObject, ObjectType, Profile } from "@/types/domain";
import { deactivateObjectAction, setObjectActiveAction, updateObjectAction } from "./actions";

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

function ReviewBadges({ object }: { object: CompanyObject }) {
  return (
    <>
      {object.source === "director_registration" ? <Badge tone="orange">Створено директором</Badge> : null}
      {object.needs_admin_review ? <Badge tone="red">Потребує заповнення</Badge> : null}
    </>
  );
}

export function ObjectRow({ object, managers, canManage, districts }: { object: CompanyObject; managers: Profile[]; canManage: boolean; districts: string[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const rowId = `object-row-${object.id}`;
  const manager = managers.find((item) => item.id === object.manager_id);

  function toggleEdit() {
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen) window.setTimeout(() => document.getElementById(rowId)?.scrollIntoView({ behavior: "smooth", block: "center" }), 80);
  }

  return (
    <>
      <TR id={rowId}>
        <TD className="min-w-56 font-medium">
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <button type="button" onClick={toggleEdit} className="inline-flex min-w-0 items-center gap-2 rounded-md text-left text-stone-100 transition-colors hover:text-orange-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-expanded={isOpen}>
                <span className="shrink-0 text-xs text-orange-200">{isOpen ? "▼" : "▶"}</span>
                <span className="break-words">{object.name}</span>
              </button>
            ) : (
              object.name
            )}
            <ReviewBadges object={object} />
            {canManage ? <Button type="button" variant="outline" size="sm" onClick={toggleEdit} className="h-8 shrink-0 px-2 text-xs">Редагувати</Button> : null}
          </div>
        </TD>
        <TD>{getObjectNumber(object)}</TD>
        <TD>{getObjectTypeLabel(object.type)}</TD>
        <TD>{object.city}{getObjectDistrict(object) ? ` / ${getObjectDistrict(object)}` : ""}</TD>
        <TD>{object.address}</TD>
        <TD>{manager?.full_name ?? "-"}</TD>
        <TD>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={object.is_active ? "green" : "gray"}>{object.is_active ? "Активний" : "Неактивний"}</Badge>
            {canManage ? (
              <form action={setObjectActiveAction.bind(null, object.id, !object.is_active)}>
                <Button type="submit" variant="outline" size="sm" className="h-8 px-2 text-xs">{object.is_active ? "Зробити неактивним" : "Активувати"}</Button>
              </form>
            ) : null}
          </div>
        </TD>
      </TR>
      {canManage && isOpen ? (
        <TR>
          <TD colSpan={7} className="bg-stone-950/20">
            <div className="py-3">
              <div className="mb-3 flex flex-wrap items-center gap-2 text-sm font-medium text-orange-200">
                <span>▼</span>
                <span>Форма редагування: {object.name}</span>
                <ReviewBadges object={object} />
              </div>
              <ObjectForm action={updateObjectAction.bind(null, object.id)} object={object} managers={managers} districts={districts} submitLabel="Зберегти зміни" />
            </div>
          </TD>
        </TR>
      ) : null}
    </>
  );
}

function ObjectForm({ action, object, managers, districts, submitLabel }: { action: (formData: FormData) => void | Promise<void>; object: CompanyObject; managers: Profile[]; districts: string[]; submitLabel: string }) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-3">
      <Field label="Назва"><Input name="name" required defaultValue={object.name} placeholder="Магазин Полісся 01" /></Field>
      <Field label="Тип об'єкта"><Select name="type" required defaultValue={object.type}>{objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}</Select></Field>
      <Field label="Номер об'єкта / магазину"><Input name="object_number" required defaultValue={getObjectNumber(object)} placeholder="001 або WH-01" /></Field>
      <Field label="Місто"><Input name="city" required defaultValue={object.city} placeholder="Житомир" /></Field>
      <Field label="Район"><Select name="district" defaultValue={getObjectDistrict(object)}><option value="">Не вибрано</option>{districts.map((district) => <option key={district} value={district}>{district}</option>)}</Select></Field>
      <Field label="Інший район"><Input name="other_district" placeholder="Новий район" /></Field>
      <Field label="Адреса"><Input name="address" required defaultValue={object.address} placeholder="вул. Київська, 12" /></Field>
      <Field label="Аліаси / варіанти написання"><Textarea name="aliases" defaultValue={object.aliases?.join("\n") ?? ""} placeholder={"Вільський шлях 115\nВільський115\nВільського шляху 115"} className="min-h-24" /></Field>
      <Field label="Відповідальний керуючий"><Select name="manager_id" defaultValue={object.manager_id ?? ""}><option value="">Не призначено</option>{managers.map((manager) => <option key={manager.id} value={manager.id}>{manager.full_name}</option>)}</Select></Field>
      <label className="flex items-center gap-2 pt-7 text-sm text-stone-200"><input name="is_active" type="checkbox" defaultChecked={object.is_active} className="h-4 w-4 accent-orange-500" />Активний</label>
      <label className="flex items-center gap-2 pt-7 text-sm text-stone-200"><input name="needs_admin_review" type="checkbox" defaultChecked={Boolean(object.needs_admin_review)} className="h-4 w-4 accent-orange-500" />Потребує заповнення</label>
      <Field label="Примітка адміністратора"><Textarea name="admin_note" defaultValue={object.admin_note ?? ""} placeholder="Внутрішня примітка для об'єкта" className="min-h-20" /></Field>
      <div className="flex items-end"><Button type="submit">{submitLabel}</Button></div>
      {object.is_active ? (
        <div className="flex items-end">
          <Button type="submit" variant="destructive" formAction={deactivateObjectAction.bind(null, object.id)} formNoValidate onClick={(event) => { if (!window.confirm("Ви точно хочете деактивувати цей об'єкт?")) event.preventDefault(); }}>Деактивувати об'єкт</Button>
        </div>
      ) : null}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}