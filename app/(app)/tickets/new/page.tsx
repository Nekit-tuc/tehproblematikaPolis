import { Alert } from "@/components/ui/alert";
import type React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getCategories, getObjects, getProfiles } from "@/lib/supabase/queries";
import { requireRole } from "@/lib/auth/server";
import { createTicketAction } from "./actions";

const errorLabels: Record<string, string> = {
  "supabase-env": "Supabase не підключений. Заповніть .env.local перед створенням заявки.",
  validation: "Заповніть назву, опис, об'єкт, категорію та пріоритет.",
  "validation-length": "Назва має містити мінімум 3 символи, опис - мінімум 10 символів.",
  object: "Керуючий об'єктом може створювати заявки тільки для свого об'єкта.",
  "object-missing": "Обраний об'єкт не знайдено або він неактивний.",
  "category-missing": "Обрану категорію не знайдено або вона неактивна.",
};

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { profile } = await requireRole(["admin", "tech_manager", "store_manager"]);
  const [{ data: objects, error: objectsError }, { data: categories, error: categoriesError }, { data: profiles, error: profilesError }] =
    await Promise.all([getObjects(), getCategories(), getProfiles()]);
  const { error: errorCode } = await searchParams;
  const loadError = objectsError ?? categoriesError ?? profilesError;
  const submitError = errorCode ? errorLabels[errorCode] ?? decodeURIComponent(errorCode) : null;
  const activeObjects = objects.filter((object) => object.is_active);
  const hasCategories = categories.length > 0;
  const hasObjects = activeObjects.length > 0;
  const canSubmit = hasCategories && hasObjects && !loadError;
  const canShowAdminHints = profile.role === "admin";

  return (
    <div className="page-shell max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Нова заявка</h1>
        <p className="subtle">Створення технічного звернення з прив'язкою до об'єкта.</p>
      </div>
      {loadError ? <Alert title="Не вдалося завантажити довідники">{loadError}</Alert> : null}
      {submitError ? <Alert title="Заявку не створено">{submitError}</Alert> : null}
      {!hasCategories && canShowAdminHints ? (
        <Alert title="Немає активних категорій">Додайте категорії в налаштуваннях або застосуйте міграцію з базовими категоріями.</Alert>
      ) : null}
      {!hasObjects && canShowAdminHints ? (
        <Alert title="Немає активних об'єктів">Додайте хоча б один активний об'єкт у довіднику об'єктів.</Alert>
      ) : null}
      <Card>
        <CardHeader><CardTitle>Деталі заявки</CardTitle></CardHeader>
        <CardContent>
          <form action={createTicketAction} className="grid gap-4 md:grid-cols-2">
            <Field label="Назва"><Input name="title" required placeholder="Наприклад: не працює кондиціонер" /></Field>
            <Field label="Категорія">
              <select name="category_id" required className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="">Оберіть категорію</option>
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </Field>
            <Field label="Об'єкт">
              <select name="object_id" required className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="">Оберіть об'єкт</option>
                {activeObjects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
              </select>
            </Field>
            <Field label="Пріоритет">
              <select name="priority" required defaultValue="medium" className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="low">Низький</option>
                <option value="medium">Середній</option>
                <option value="high">Високий</option>
                <option value="critical">Критичний</option>
              </select>
            </Field>
            <Field label="Виконавець">
              <select name="assigned_to" className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">
                <option value="">Не призначено</option>
                {profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.full_name}</option>)}
              </select>
            </Field>
            <Field label="Термін виконання"><Input name="due_at" type="datetime-local" /></Field>
            <div className="md:col-span-2">
              <Field label="Опис"><Textarea name="description" required placeholder="Що сталося, де саме, які симптоми." /></Field>
            </div>
            <div className="md:col-span-2">
              <Field label="Фото проблеми">
                <Input name="before_photos" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple />
                <p className="text-xs text-muted-foreground">До 5 фото, jpg/jpeg/png/webp, максимум 8 MB кожне. Тип фото: ДО.</p>
              </Field>
            </div>
            <div className="md:col-span-2 flex justify-end gap-2">
              <Button variant="outline" type="reset">Очистити</Button>
              <Button type="submit" disabled={!canSubmit}>Створити заявку</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
