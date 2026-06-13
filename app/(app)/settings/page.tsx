import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TD, TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { requireRole } from "@/lib/auth/server";
import { getAllCategories } from "@/lib/supabase/queries";
import type { Category } from "@/types/domain";
import { createCategoryAction, updateCategoryAction } from "./actions";

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireRole(["admin"]);
  const params = await searchParams;
  const categoriesResult = await getAllCategories();
  const error = categoriesResult.error ?? (params.error ? decodeURIComponent(params.error) : null);

  return (
    <div className="page-shell max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Налаштування</h1>
        <p className="subtle">Базові параметри компанії, SLA, інтеграцій та довідники системи.</p>
      </div>

      {error ? <Alert title="Помилка налаштувань">{error}</Alert> : null}
      {params.success === "category-created" ? <Alert title="Категорію створено">Нова категорія доступна при створенні заявки.</Alert> : null}
      {params.success === "category-updated" ? <Alert title="Категорію оновлено">Зміни збережено.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Параметри системи</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Field label="Назва компанії"><Input defaultValue="Polissya" /></Field>
          <Field label="Базовий SLA, год"><Input defaultValue="24" /></Field>
          <Field label="Storage bucket"><Input defaultValue="ticket-photos" /></Field>
          <Field label="Email підтримки"><Input defaultValue="service@polissya.local" /></Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Нова категорія</CardTitle>
          <CardDescription>Категорії використовуються у заявках та звітах.</CardDescription>
        </CardHeader>
        <CardContent>
          <CategoryForm action={createCategoryAction} submitLabel="Створити категорію" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Категорії заявок</CardTitle>
          <CardDescription>Знайдено: {categoriesResult.data.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {categoriesResult.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">Категорій поки немає.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Назва</TH>
                  <TH>Опис</TH>
                  <TH>Статус</TH>
                  <TH>Дії</TH>
                </TR>
              </THead>
              <TBody>
                {categoriesResult.data.map((category) => (
                  <CategoryRow key={category.id} category={category} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <>
      <TR>
        <TD className="font-medium">{category.name}</TD>
        <TD>{category.description ?? "-"}</TD>
        <TD><Badge tone={category.is_active ? "green" : "gray"}>{category.is_active ? "Активна" : "Неактивна"}</Badge></TD>
        <TD><details className="min-w-32"><summary className="cursor-pointer text-orange-200">Редагувати</summary></details></TD>
      </TR>
      <TR>
        <TD colSpan={4} className="bg-stone-950/20">
          <details>
            <summary className="cursor-pointer py-2 text-sm text-orange-200">Форма редагування: {category.name}</summary>
            <div className="py-3">
              <CategoryForm action={updateCategoryAction.bind(null, category.id)} category={category} submitLabel="Зберегти зміни" />
            </div>
          </details>
        </TD>
      </TR>
    </>
  );
}

function CategoryForm({
  action,
  category,
  submitLabel,
}: {
  action: (formData: FormData) => void | Promise<void>;
  category?: Category;
  submitLabel: string;
}) {
  return (
    <form action={action} className="grid gap-4 md:grid-cols-[1fr_1.5fr_auto_auto]">
      <Field label="Назва"><Input name="name" required defaultValue={category?.name ?? ""} placeholder="Електрика" /></Field>
      <Field label="Опис"><Input name="description" defaultValue={category?.description ?? ""} placeholder="Короткий опис категорії" /></Field>
      <label className="flex items-center gap-2 pt-7 text-sm text-stone-200">
        <input name="is_active" type="checkbox" defaultChecked={category?.is_active ?? true} className="h-4 w-4 accent-orange-500" />
        Активна
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
