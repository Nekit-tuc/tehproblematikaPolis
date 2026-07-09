import { ArrowLeft, BriefcaseBusiness, Pencil, Plus, PowerOff, Trash2 } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { getCategories } from "@/lib/supabase/queries";
import { getWorkerStats, getWorkers } from "@/lib/supabase/worker-queries";
import type { Category, WorkerWithCategories } from "@/types/domain";
import { createWorkerAction, deactivateWorkerAction, deleteOrDeactivateWorkerAction, updateWorkerAction } from "./actions";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; addWorker?: string; view?: string }>;
}) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [workersResult, categoriesResult, statsResult] = await Promise.all([getWorkers(), getCategories(), getWorkerStats()]);
  const error = params.error ? decodeURIComponent(params.error) : workersResult.error ?? categoriesResult.error ?? statsResult.error;
  const statsByWorker = new Map(statsResult.data.map((item) => [item.worker.id, item]));
  const isCreatingWorker = params.addWorker === "1";
  const canDeleteWorkers = profile.role === "admin";
  const mobileView = params.view === "table" ? "table" : "cards";
  const viewHref = (view: "cards" | "table") => {
    const next = new URLSearchParams();
    if (view === "table") next.set("view", "table");
    const search = next.toString();
    return search ? `/workers?${search}` : "/workers";
  };

  return (
    <div className="page-shell space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Виконавці</h1>
          <p className="subtle">Довідник майстрів, Telegram-контакти та спеціалізації по категоріях заявок.</p>
        </div>
        {!isCreatingWorker ? (
          <Button asChild className="min-h-11 w-full rounded-2xl md:w-auto md:rounded-md">
            <Link href="/workers?addWorker=1"><Plus className="h-4 w-4" />Додати виконавця</Link>
          </Button>
        ) : null}
      </div>

      {error ? <Alert title="Не вдалося виконати дію">{error}</Alert> : null}
      {params.success === "deleted" ? <Alert title="Виконавця видалено">Запис виконавця та службові зв'язки видалено з бази.</Alert> : null}
      {params.success === "deactivated" ? <Alert title="Виконавця деактивовано">У виконавця є пов'язані заявки, тому фізичне видалення не виконувалось.</Alert> : null}
      {params.success && !["deleted", "deactivated"].includes(params.success) ? <Alert title="Зміни збережено">Дані виконавця оновлено.</Alert> : null}

      {isCreatingWorker ? (
      <Card className="rounded-3xl border-orange-500/30 bg-stone-950/80 shadow-2xl shadow-black/40 md:rounded-lg">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-orange-300" />Новий виконавець</CardTitle>
              <CardDescription>
                Щоб підключити Telegram, виконавець має відкрити бота і натиснути /start. Telegram username використовується для прив'язки, Telegram ID - для надсилання заявок.
              </CardDescription>
            </div>
            <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl md:w-auto md:rounded-md">
              <Link href="/workers"><ArrowLeft className="h-4 w-4" />Скасувати</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-28 md:pb-6">
          <WorkerForm categories={categoriesResult.data} action={createWorkerAction} submitLabel="Додати виконавця" cancelHref="/workers" />
        </CardContent>
      </Card>
      ) : (
      <>
      <Card className="border-dashed border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-orange-300" />Додавання виконавця</CardTitle>
          <CardDescription>
            Форма створення прихована, щоб не займати робочу область. Натисніть кнопку зверху, коли потрібно додати нового виконавця.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="min-h-11 w-full rounded-2xl md:w-auto md:rounded-md">
            <Link href="/workers?addWorker=1"><Plus className="h-4 w-4" />Додати виконавця</Link>
          </Button>
        </CardContent>
      </Card>

      <details className="mobile-card p-3 md:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-orange-200">
          Вигляд
          <span className="text-xs text-stone-500">{mobileView === "table" ? "Таблиця" : "Картки"}</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild variant={mobileView === "cards" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
            <Link href={viewHref("cards")}>Картки</Link>
          </Button>
          <Button asChild variant={mobileView === "table" ? "default" : "outline"} size="sm" className="min-h-10 rounded-2xl">
            <Link href={viewHref("table")}>Таблиця</Link>
          </Button>
        </div>
      </details>

      {mobileView === "table" ? (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] md:hidden">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="bg-white/[0.04] text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Виконавець</th>
                <th className="px-3 py-3">Telegram</th>
                <th className="px-3 py-3">Статус</th>
                <th className="px-3 py-3">Активні</th>
                <th className="px-3 py-3">Категорії</th>
                <th className="px-3 py-3 text-right">Дії</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {workersResult.data.map((worker) => {
                const stats = statsByWorker.get(worker.id);
                return (
                  <tr key={worker.id}>
                    <td className="max-w-[170px] px-3 py-3"><div className="line-clamp-2 break-words font-semibold">{worker.name}</div></td>
                    <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{worker.telegram_username ? `@${worker.telegram_username}` : "-"}</div></td>
                    <td className="px-3 py-3"><Badge tone={worker.is_active ? "green" : "default"}>{worker.is_active ? "Активний" : "Неактивний"}</Badge></td>
                    <td className="px-3 py-3">{stats?.active ?? 0}</td>
                    <td className="max-w-[220px] px-3 py-3"><div className="line-clamp-2 break-words">{worker.categories?.map((category) => category.name).join(", ") || "-"}</div></td>
                    <td className="px-3 py-3 text-right">
                      <Button asChild variant="outline" size="sm" className="rounded-2xl">
                        <Link href={`/workers/${worker.id}`}>Заявки</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className={mobileView === "table" ? "hidden gap-4 md:grid xl:grid-cols-2" : "grid gap-4 xl:grid-cols-2"}>
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
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                      <span className="break-words">{worker.telegram_username ? `@${worker.telegram_username}` : "Telegram username не вказано"}</span>
                      <span className="text-stone-600">·</span>
                      <span>ID: {worker.telegram_id || "-"}</span>
                      <TelegramConnectionBadge worker={worker} />
                    </div>
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
                {canDeleteWorkers ? (
                  <form action={deleteOrDeactivateWorkerAction.bind(null, worker.id)} className="border-t border-white/10 pt-4">
                    <ConfirmSubmitButton
                      type="submit"
                      variant="destructive"
                      className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md"
                      message="Ви точно хочете видалити виконавця? Якщо в нього є заявки, він буде деактивований."
                    >
                      <Trash2 className="h-4 w-4" />Видалити виконавця
                    </ConfirmSubmitButton>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Якщо є пов'язані заявки, запис не видаляється, а виконавець деактивується.
                    </p>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

function TelegramConnectionBadge({ worker }: { worker: WorkerWithCategories }) {
  if (worker.telegram_id) return <Badge tone="green">Підключено</Badge>;
  if (worker.telegram_username) return <Badge tone="orange">Очікує підключення</Badge>;
  return <Badge>Username не вказано</Badge>;
}

function WorkerForm({
  worker,
  categories,
  action,
  submitLabel,
  cancelHref,
}: {
  worker?: WorkerWithCategories;
  categories: Category[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  cancelHref?: string;
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
      <div className="grid gap-2 md:flex md:flex-wrap">
        <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">{submitLabel}</Button>
        {cancelHref ? (
          <Button asChild type="button" variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
            <Link href={cancelHref}>Скасувати</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
