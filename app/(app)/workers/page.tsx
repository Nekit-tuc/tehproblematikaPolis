import { BriefcaseBusiness, Pencil, PowerOff } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { getCategories } from "@/lib/supabase/queries";
import { getWorkerStats, getWorkers } from "@/lib/supabase/worker-queries";
import type { Category, WorkerWithCategories } from "@/types/domain";
import { createWorkerAction, deactivateWorkerAction, updateWorkerAction } from "./actions";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [workersResult, categoriesResult, statsResult] = await Promise.all([getWorkers(), getCategories(), getWorkerStats()]);
  const error = params.error ? decodeURIComponent(params.error) : workersResult.error ?? categoriesResult.error ?? statsResult.error;
  const statsByWorker = new Map(statsResult.data.map((item) => [item.worker.id, item]));

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Виконавці</h1>
        <p className="subtle">Довідник майстрів, Telegram-контакти та спеціалізації по категоріях заявок.</p>
      </div>

      {error ? <Alert title="Не вдалося виконати дію">{error}</Alert> : null}
      {params.success ? <Alert title="Зміни збережено">Дані виконавця оновлено.</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-orange-300" />Новий виконавець</CardTitle>
          <CardDescription>Telegram ID потрібен, щоб надсилати виконавцю заявку з кнопкою “Виконав”.</CardDescription>
        </CardHeader>
        <CardContent>
          <WorkerForm categories={categoriesResult.data} action={createWorkerAction} submitLabel="Додати виконавця" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {workersResult.data.length === 0 ? (
          <Card><CardContent className="pt-5 text-sm text-muted-foreground">Виконавців поки немає.</CardContent></Card>
        ) : workersResult.data.map((worker) => {
          const stats = statsByWorker.get(worker.id);
          return (
            <Card key={worker.id} className={!worker.is_active ? "opacity-70" : undefined}>
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="break-words text-lg">{worker.name}</CardTitle>
                    <CardDescription>
                      {worker.telegram_username ? `@${worker.telegram_username}` : "Telegram username не вказано"} · ID: {worker.telegram_id || "-"}
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={worker.is_active ? "green" : "default"}>{worker.is_active ? "Активний" : "Неактивний"}</Badge>
                    <Badge tone="orange">{stats?.active ?? 0} активних</Badge>
                  </div>
                </div>
                <div className="grid gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                  <span>Всього: <b className="text-stone-200">{stats?.total ?? 0}</b></span>
                  <span>Виконано: <b className="text-stone-200">{stats?.done ?? 0}</b></span>
                  <span>На підтвердженні: <b className="text-stone-200">{stats?.waitingConfirmation ?? 0}</b></span>
                  <span>Оцінка: <b className="text-stone-200">{stats?.averageRating ? stats.averageRating.toFixed(1) : "-"}</b></span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(worker.categories ?? []).length === 0 ? (
                    <span className="text-sm text-muted-foreground">Категорії не призначені.</span>
                  ) : worker.categories?.map((category) => <Badge key={category.id}>{category.name}</Badge>)}
                </div>
                {worker.notes ? <p className="break-words text-sm text-muted-foreground">{worker.notes}</p> : null}
                <Button asChild variant="outline">
                  <Link href={`/workers/${worker.id}`}>Заявки виконавця</Link>
                </Button>
                <details className="rounded-lg border border-border bg-stone-950/30 p-3">
                  <summary className="cursor-pointer list-none text-sm font-medium text-orange-200">
                    <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Редагувати</span>
                  </summary>
                  <div className="mt-4">
                    <WorkerForm worker={worker} categories={categoriesResult.data} action={updateWorkerAction.bind(null, worker.id)} submitLabel="Зберегти" />
                    {worker.is_active ? (
                      <form action={deactivateWorkerAction.bind(null, worker.id)} className="mt-3">
                        <Button type="submit" variant="outline"><PowerOff className="h-4 w-4" />Деактивувати</Button>
                      </form>
                    ) : null}
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function WorkerForm({
  worker,
  categories,
  action,
  submitLabel,
}: {
  worker?: WorkerWithCategories;
  categories: Category[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
}) {
  const selected = new Set((worker?.categories ?? []).map((category) => category.id));
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="ПІБ / назва">
          <Input name="name" required defaultValue={worker?.name ?? ""} />
        </Field>
        <Field label="Телефон">
          <Input name="phone" defaultValue={worker?.phone ?? ""} />
        </Field>
        <Field label="Telegram username">
          <Input name="telegram_username" placeholder="username без @" defaultValue={worker?.telegram_username ?? ""} />
        </Field>
        <Field label="Telegram ID">
          <Input name="telegram_id" defaultValue={worker?.telegram_id ?? ""} />
        </Field>
      </div>
      <Field label="Нотатки">
        <Textarea name="notes" defaultValue={worker?.notes ?? ""} />
      </Field>
      <div className="space-y-2">
        <Label>Категорії</Label>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-2 rounded-md border border-border bg-stone-950/30 px-3 py-2 text-sm">
              <input name="categoryIds" type="checkbox" value={category.id} defaultChecked={selected.has(category.id)} className="h-4 w-4 accent-orange-500" />
              <span className="min-w-0 break-words">{category.name}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="is_active" type="checkbox" defaultChecked={worker?.is_active ?? true} className="h-4 w-4 accent-orange-500" />
        Активний
      </label>
      <Button type="submit">{submitLabel}</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
