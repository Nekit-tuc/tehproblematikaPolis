import type React from "react";
import { LogOut } from "lucide-react";
import { logoutAction } from "@/app/login/actions";
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
import { updateCategoryAction } from "./actions";

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
      {params.success === "category-updated" ? <Alert title="Категорію оновлено">Зміни збережено.</Alert> : null}

      <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
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

      <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
        <CardHeader>
          <CardTitle>Системні категорії заявок</CardTitle>
          <CardDescription className="max-w-full whitespace-normal break-words">
            У системі використовується фіксований довідник із 7 активних категорій. Нові категорії не додаються вручну, щоб не ламати AI-класифікацію, звіти та виконавців.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-stone-400">
          Можна уточнювати опис категорій, але назви та активність залишаються системними.
        </CardContent>
      </Card>

      <div className="space-y-3 md:hidden">
        <div className="text-sm text-stone-400">Категорії заявок · {categoriesResult.data.length}</div>
        {categoriesResult.data.length === 0 ? (
          <div className="mobile-card p-3 text-sm text-stone-500">Категорій поки немає.</div>
        ) : (
          categoriesResult.data.map((category) => <MobileCategoryCard key={category.id} category={category} />)
        )}
      </div>

      <Card className="hidden md:block">
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

      <Card className="rounded-[17px] border-red-500/20 bg-red-500/[0.05] md:rounded-[17px]">
        <CardHeader className="space-y-1 pb-3">
          <div className="flex items-center gap-2">
            <LogOut className="h-4 w-4 text-red-300" />
            <CardTitle className="text-[14px] text-stone-100">Сесія</CardTitle>
          </div>
          <CardDescription className="max-w-full whitespace-normal break-words text-[11px] leading-relaxed text-stone-400">
            Вийти з поточного акаунта на цьому пристрої. Після виходу потрібно буде знову увійти в систему.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={logoutAction}>
            <Button type="submit" variant="destructive" size="sm" className="h-9 rounded-2xl px-3 text-[11px]">
              <LogOut className="h-3.5 w-3.5" />
              Вийти з акаунта
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function CategoryRow({ category }: { category: Category }) {
  return (
    <>
      <TR>
        <TD className="min-w-0 break-words font-medium">{category.name}</TD>
        <TD className="min-w-0 max-w-md whitespace-normal break-words text-sm text-stone-300">{category.description ?? "-"}</TD>
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

function MobileCategoryCard({ category }: { category: Category }) {
  return (
    <div className="mobile-card max-w-full p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-sm font-semibold text-stone-100">{category.name}</h2>
          <p className="mt-1 max-w-full whitespace-normal break-words text-xs leading-5 text-stone-400">{category.description ?? "Без опису"}</p>
        </div>
        <Badge tone={category.is_active ? "green" : "gray"}>{category.is_active ? "Активна" : "Неактивна"}</Badge>
      </div>
      <details className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-2.5">
        <summary className="cursor-pointer list-none text-sm font-medium text-orange-200">Редагувати</summary>
        <div className="mt-3">
          <CategoryForm action={updateCategoryAction.bind(null, category.id)} category={category} submitLabel="Зберегти" compact />
        </div>
      </details>
    </div>
  );
}

function CategoryForm({
  action,
  category,
  submitLabel,
  compact = false,
}: {
  action: (formData: FormData) => void | Promise<void>;
  category?: Category;
  submitLabel: string;
  compact?: boolean;
}) {
  return (
    <form action={action} className={compact ? "grid gap-3 text-sm" : "grid gap-4 md:grid-cols-[1fr_1.5fr_auto_auto]"}>
      <Field label="Назва"><Input name="name" required readOnly={Boolean(category)} defaultValue={category?.name ?? ""} placeholder="Електрика" className={compact ? "min-h-10 rounded-2xl text-sm" : ""} /></Field>
      <Field label="Опис"><Input name="description" defaultValue={category?.description ?? ""} placeholder="Короткий опис категорії" className={compact ? "min-h-10 rounded-2xl text-sm" : ""} /></Field>
      <div className={`text-sm text-stone-400 ${compact ? "" : "pt-7"}`}>Системна активна категорія</div>
      <div className="flex items-end">
        <Button type="submit" className={compact ? "min-h-10 w-full rounded-2xl text-sm" : ""}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
