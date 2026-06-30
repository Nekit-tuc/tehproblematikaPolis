"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { objectTypeLabels } from "@/lib/labels";
import type { ObjectType, Profile } from "@/types/domain";
import { createObjectAction } from "./actions";

const objectTypes: ObjectType[] = ["store", "warehouse", "production", "office", "other"];

type FormState = {
  name: string;
  type: ObjectType;
  objectNumber: string;
  city: string;
  district: string;
  address: string;
  aliases: string;
  managerId: string;
  isActive: boolean;
};

function initialState(nextObjectNumber: string): FormState {
  return {
    name: "",
    type: "store",
    objectNumber: nextObjectNumber,
    city: "",
    district: "",
    address: "",
    aliases: "",
    managerId: "",
    isActive: true,
  };
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function stripStreetPrefix(value: string) {
  return value.replace(/\b(вул\.?|вулиця|просп\.?|проспект|пров\.?|провулок)\b/giu, "").replace(/\s+/g, " ").trim();
}

function compact(value: string) {
  return stripStreetPrefix(value).replace(/[,\s.:-]+/g, "");
}

function withCommaVariant(value: string) {
  return stripStreetPrefix(value).replace(/\s+(\d[\w/-]*)$/u, ", $1");
}

function caseVariant(value: string) {
  const normalized = stripStreetPrefix(value);
  const replacements: Array<[RegExp, string]> = [
    [/\bВільський шлях\b/giu, "Вільського шляху"],
    [/\bКиївське шосе\b/giu, "Київського шосе"],
    [/\bНебесна сотня\b/giu, "Небесної сотні"],
    [/\bВелика Бердичівська\b/giu, "Великої Бердичівської"],
    [/\bМала Бердичівська\b/giu, "Малої Бердичівської"],
    [/\bХлібна\b/giu, "Хлібної"],
    [/\bЧуднівська\b/giu, "Чуднівської"],
  ];
  return replacements.reduce((result, [from, to]) => result.replace(from, to), normalized);
}

function generateAliases(name: string, address: string) {
  const cleanAddress = stripStreetPrefix(address);
  return unique([
    name,
    cleanAddress,
    cleanAddress.replace(/,/g, ""),
    compact(cleanAddress),
    withCommaVariant(cleanAddress),
    caseVariant(cleanAddress),
  ]).join("\n");
}

export function CreateObjectForm({ managers, nextObjectNumber }: { managers: Profile[]; nextObjectNumber: string }) {
  const [form, setForm] = useState<FormState>(() => initialState(nextObjectNumber));

  useEffect(() => {
    setForm(initialState(nextObjectNumber));
  }, [nextObjectNumber]);

  const canGenerateAliases = useMemo(() => form.name.trim().length > 0 || form.address.trim().length > 0, [form.name, form.address]);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <form action={createObjectAction} className="grid gap-4 md:grid-cols-3" autoComplete="off">
      <Field label="Назва">
        <Input name="name" required value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Магазин Полісся 01" autoComplete="off" />
      </Field>
      <Field label="Тип об'єкта">
        <Select name="type" required value={form.type} onChange={(event) => setField("type", event.target.value as ObjectType)}>
          {objectTypes.map((type) => (
            <option key={type} value={type}>
              {objectTypeLabels[type] ?? type}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Номер об'єкта / магазину">
        <Input
          name="object_number"
          required
          value={form.objectNumber}
          onChange={(event) => setField("objectNumber", event.target.value)}
          placeholder="001 або WH-01"
          autoComplete="off"
        />
      </Field>
      <Field label="Місто">
        <Input name="city" required value={form.city} onChange={(event) => setField("city", event.target.value)} placeholder="Житомир" autoComplete="off" />
      </Field>
      <Field label="Район">
        <Input name="district" value={form.district} onChange={(event) => setField("district", event.target.value)} placeholder="Центр" autoComplete="off" />
      </Field>
      <Field label="Адреса">
        <Input name="address" required value={form.address} onChange={(event) => setField("address", event.target.value)} placeholder="вул. Київська, 12" autoComplete="off" />
      </Field>
      <div className="space-y-2 md:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Аліаси / варіанти написання</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => setField("aliases", generateAliases(form.name, form.address))} disabled={!canGenerateAliases}>
            Згенерувати аліаси
          </Button>
        </div>
        <Textarea
          name="aliases"
          value={form.aliases}
          onChange={(event) => setField("aliases", event.target.value)}
          placeholder={"Вільський шлях 115\nВільський115\nВільського шляху 115"}
          className="min-h-24"
          autoComplete="off"
        />
      </div>
      <Field label="Відповідальний керуючий">
        <Select name="manager_id" value={form.managerId} onChange={(event) => setField("managerId", event.target.value)}>
          <option value="">Не призначено</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.full_name}
            </option>
          ))}
        </Select>
      </Field>
      <label className="flex items-center gap-2 pt-7 text-sm text-stone-200">
        <input name="is_active" type="checkbox" checked={form.isActive} onChange={(event) => setField("isActive", event.target.checked)} className="h-4 w-4 accent-orange-500" />
        Активний
      </label>
      <div className="flex items-end">
        <Button type="submit">Створити об'єкт</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
      {children}
    </select>
  );
}
