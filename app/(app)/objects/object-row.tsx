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
import type { DirectorOption, ObjectDirectorLink, ObjectWithDirectorLinks } from "@/lib/supabase/object-director-sync";
import type { CompanyObject, ObjectType, Profile } from "@/types/domain";
import { approveDirectorObjectLinkFromObjectsAction, deactivateObjectAction, linkDirectorToObjectAction, rejectDirectorObjectLinkFromObjectsAction, setObjectActiveAction, setPrimaryDirectorForObjectAction, unlinkDirectorFromObjectAction, updateObjectAction } from "./actions";

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

function statusLabel(status?: string | null) {
  if (status === "approved") return "Підтверджено";
  if (status === "rejected") return "Відхилено";
  return "Очікує";
}

function directorOptionLabel(director: DirectorOption) {
  const status = director.approval_status ?? "approved";
  const linkLabel = director.activeLinkCount > 0 ? `${director.activeLinkCount} об'єкт.` : "без об'єкта";
  return [director.full_name, director.phone, statusLabel(status), linkLabel].filter(Boolean).join(" · ");
}

export function ObjectRow({ object, managers, directors, canManage, canManageDirectorLinks, districts }: { object: ObjectWithDirectorLinks; managers: Profile[]; directors: DirectorOption[]; canManage: boolean; canManageDirectorLinks: boolean; districts: string[] }) {
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
        <TD><DirectorLinksCell object={object} directors={directors} canManageDirectorLinks={canManageDirectorLinks} /></TD>
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
          <TD colSpan={8} className="bg-stone-950/20">
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

function DirectorLinksCell({ object, directors, canManageDirectorLinks }: { object: ObjectWithDirectorLinks; directors: DirectorOption[]; canManageDirectorLinks: boolean }) {
  return (
    <div className="min-w-72 space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {object.approvedDirectorLinks.length === 0 ? <Badge tone="gray">Без директора</Badge> : null}
        {object.pendingDirectorLinks.length > 0 ? <Badge tone="orange">Очікує підтвердження</Badge> : null}
      </div>
      <div className="space-y-1.5">
        {object.directorLinks.length > 0 ? object.directorLinks.map((link) => <DirectorLinkRow key={link.id} link={link} objectId={object.id} canManageDirectorLinks={canManageDirectorLinks} />) : <div className="text-xs text-stone-500">Немає прив'язок</div>}
      </div>
      {canManageDirectorLinks ? <DirectorLinkForm objectId={object.id} directors={directors} /> : null}
    </div>
  );
}

function DirectorLinkRow({ link, objectId, canManageDirectorLinks }: { link: ObjectDirectorLink; objectId: string; canManageDirectorLinks: boolean }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-medium text-stone-100">{link.director?.full_name ?? "Директор"}</span>
        <span className="text-stone-500">{link.phone ?? link.director?.phone ?? "без телефону"}</span>
        <Badge tone={link.approvalStatus === "approved" ? "green" : link.approvalStatus === "rejected" ? "red" : "orange"}>{statusLabel(link.approvalStatus)}</Badge>
        {link.isPrimary ? <Badge tone="orange">Primary</Badge> : null}
      </div>
      {canManageDirectorLinks ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {link.approvalStatus === "pending" ? (
            <form action={approveDirectorObjectLinkFromObjectsAction}>
              <input type="hidden" name="linkId" value={link.id} />
              <input type="hidden" name="objectId" value={objectId} />
              <input type="hidden" name="isPrimary" value={link.isPrimary ? "on" : ""} />
              <Button type="submit" variant="outline" size="sm" className="h-7 px-2 text-[11px]">Підтвердити</Button>
            </form>
          ) : null}
          {link.approvalStatus === "approved" && !link.isPrimary ? (
            <form action={setPrimaryDirectorForObjectAction}>
              <input type="hidden" name="linkId" value={link.id} />
              <input type="hidden" name="objectId" value={objectId} />
              <Button type="submit" variant="outline" size="sm" className="h-7 px-2 text-[11px]">Primary</Button>
            </form>
          ) : null}
          {link.approvalStatus !== "rejected" ? (
            <form action={unlinkDirectorFromObjectAction}>
              <input type="hidden" name="directorProfileId" value={link.profileId} />
              <input type="hidden" name="objectId" value={objectId} />
              <Button type="submit" variant="outline" size="sm" className="h-7 px-2 text-[11px]">Відв'язати</Button>
            </form>
          ) : null}
          {link.approvalStatus === "pending" ? (
            <form action={rejectDirectorObjectLinkFromObjectsAction} className="flex gap-1">
              <input type="hidden" name="linkId" value={link.id} />
              <input type="hidden" name="objectId" value={objectId} />
              <Input name="note" placeholder="Причина" className="h-7 w-24 px-2 text-[11px]" />
              <Button type="submit" variant="outline" size="sm" className="h-7 px-2 text-[11px]">Відхилити</Button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function DirectorLinkForm({ objectId, directors }: { objectId: string; directors: DirectorOption[] }) {
  return (
    <form action={linkDirectorToObjectAction} className="grid gap-1.5">
      <input type="hidden" name="objectId" value={objectId} />
      <Select name="directorProfileId" required defaultValue="">
        <option value="" disabled>Прив'язати / змінити директора</option>
        {directors.map((director) => <option key={director.id} value={director.id}>{directorOptionLabel(director)}</option>)}
      </Select>
      <div className="flex flex-wrap items-center gap-2">
        <Input name="phone" placeholder="Телефон" className="h-8 max-w-36 px-2 text-xs" />
        <label className="flex items-center gap-1 text-[11px] text-stone-300"><input name="isPrimary" type="checkbox" defaultChecked className="h-4 w-4 accent-orange-500" />Primary</label>
        <Button type="submit" size="sm" className="h-8 px-2 text-xs">Прив'язати</Button>
      </div>
    </form>
  );
}
