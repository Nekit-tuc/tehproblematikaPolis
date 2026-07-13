import Link from "next/link";
import { ArrowLeft, Download, RefreshCw, Send } from "lucide-react";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getWorkPlanById, getWorkPlanDispatches, getWorkPlanItems, type WorkPlan, type WorkPlanDispatch, type WorkPlanItem, type WorkPlanStatus } from "@/lib/supabase/work-plans";
import { cn, formatDate } from "@/lib/utils";
import { cancelWorkPlanAction, removeWorkPlanItemAction, resendWorkPlanToAllAction, retryFailedWorkPlanDispatchAction, sendWorkPlanAction, updateWorkPlanAction } from "./actions";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
};

const planStatusLabels: Record<WorkPlanStatus, string> = {
  draft: "Чернетка",
  sent: "Надіслано",
  partially_done: "Частково виконано",
  done: "Виконано",
  cancelled: "Скасовано",
};

const dispatchStatusLabels: Record<string, string> = {
  sent: "Надіслано",
  failed: "Помилка",
  skipped_no_telegram: "Без Telegram",
};

function safeDecode(value?: string | null) {
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function successMessage(value?: string) {
  if (!value) return null;
  if (value === "updated") return "План оновлено.";
  if (value === "item_removed") return "Заявку прибрано з плану.";
  if (value === "cancelled") return "План скасовано.";
  if (value.startsWith("sent_") || value.startsWith("retry_") || value.startsWith("resend_")) {
    const [mode, sent, failed, skipped] = value.split("_");
    const prefix = mode === "retry"
      ? "Повтор невдалих завершено"
      : mode === "resend"
        ? "Повторну розсилку всім завершено"
        : "Розсилку завершено";
    if (mode === "retry" && sent === "0" && failed === "0" && skipped === "0") return "Немає невдалих відправок для повтору.";
    return `${prefix}. Надіслано: ${sent ?? 0}, помилок: ${failed ?? 0}, без Telegram: ${skipped ?? 0}.`;
  }
  return null;
}

function groupItems(items: WorkPlanItem[]) {
  const groups = new Map<string, { title: string; items: WorkPlanItem[] }>();
  for (const item of items) {
    const key = item.worker_id ?? "unassigned";
    const title = item.worker?.name ?? "Без виконавця";
    const group = groups.get(key) ?? { title, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return Array.from(groups.entries()).map(([key, group]) => ({ key, ...group }));
}

function workerCount(items: WorkPlanItem[]) {
  return new Set(items.map((item) => item.worker_id).filter(Boolean)).size;
}

function retryableDispatchCount(dispatches: WorkPlanDispatch[]) {
  const latest = new Map<string, WorkPlanDispatch>();
  for (const dispatch of dispatches) {
    if (!dispatch.worker_id || latest.has(dispatch.worker_id)) continue;
    latest.set(dispatch.worker_id, dispatch);
  }
  return Array.from(latest.values()).filter((dispatch) => dispatch.status === "failed" || dispatch.status === "skipped_no_telegram").length;
}

function statusTone(status: string) {
  if (status === "sent" || status === "done") return "green";
  if (status === "draft" || status === "partially_done") return "orange";
  if (status === "failed" || status === "cancelled") return "red";
  return "gray";
}

export default async function WorkPlanDetailPage({ params, searchParams }: PageProps) {
  await requireRole(["admin", "management", "tech_manager"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [planResult, itemsResult, dispatchesResult] = await Promise.all([
    getWorkPlanById(id),
    getWorkPlanItems(id),
    getWorkPlanDispatches(id),
  ]);

  const plan = planResult.data;
  const items = itemsResult.data;
  const dispatches = dispatchesResult.data;
  const error = safeDecode(query.error) ?? planResult.error ?? itemsResult.error ?? dispatchesResult.error;
  const success = successMessage(query.success);

  if (!plan) {
    return (
      <div className="page-shell pb-28 md:pb-6">
        <Alert title="План не знайдено">Перевірте посилання або поверніться до списку планів.</Alert>
      </div>
    );
  }

  const isDraft = plan.status === "draft";
  const canResend = plan.status === "sent" || plan.status === "partially_done" || plan.status === "done";
  const retryableCount = retryableDispatchCount(dispatches);
  const grouped = groupItems(items);

  return (
    <div className="page-shell space-y-2.5 pb-20 md:space-y-6 md:pb-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="outline" size="sm" className="mb-2 min-h-8 rounded-lg text-[10px] md:rounded-md md:text-sm">
            <Link href="/work-planning"><ArrowLeft className="h-4 w-4" />До планування</Link>
          </Button>
          <h1 className="break-words text-[23px] font-semibold leading-tight tracking-[-0.03em] md:text-2xl">{plan.title}</h1>
          <p className="subtle">{plan.period_start} - {plan.period_end}</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
          <Button asChild variant="outline" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
            <Link href={`/work-planning/${plan.id}/export`}><Download className="h-4 w-4" />Експорт плану</Link>
          </Button>
          {isDraft ? (
            <form action={sendWorkPlanAction.bind(null, plan.id)}>
              <SubmitButton className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm" pendingText="Надсилається...">
                <Send className="h-4 w-4" />Надіслати план виконавцям
              </SubmitButton>
            </form>
          ) : null}
          {canResend && retryableCount > 0 ? (
            <form action={retryFailedWorkPlanDispatchAction.bind(null, plan.id)}>
              <SubmitButton className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm" pendingText="Повторюється...">
                <RefreshCw className="h-4 w-4" />Повторити невдалі
              </SubmitButton>
              <p className="mt-1 max-w-xs text-[10px] leading-4 text-muted-foreground">
                Повторить відправку тільки виконавцям, кому план не надіслався.
              </p>
            </form>
          ) : null}
          {canResend ? (
            <form action={resendWorkPlanToAllAction.bind(null, plan.id)}>
              <ConfirmSubmitButton
                type="submit"
                variant="outline"
                className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm"
                pendingText="Надсилається..."
                message="План уже надсилався. Ви точно хочете повторно надіслати його всім виконавцям?"
              >
                <Send className="h-4 w-4" />Надіслати повторно всім
              </ConfirmSubmitButton>
            </form>
          ) : null}
        </div>
      </div>

      {error ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="Дію не виконано"><span className="break-words whitespace-normal">{error}</span></Alert>
        </div>
      ) : null}
      {success ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="Готово"><span className="break-words whitespace-normal">{success}</span></Alert>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-5">
        <Metric label="Статус" value={planStatusLabels[plan.status]} tone={statusTone(plan.status)} />
        <Metric label="Заявок" value={String(items.length)} />
        <Metric label="Виконавців" value={String(workerCount(items))} />
        <Metric label="Створено" value={formatDate(plan.created_at)} />
        <Metric label="Надіслано" value={plan.sent_at ? formatDate(plan.sent_at) : "-"} />
      </div>

      {isDraft ? <DraftEditor plan={plan} /> : null}

      <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
        <CardHeader>
          <CardTitle>Заявки у плані</CardTitle>
          <CardDescription>Згруповано по виконавцях. Група без виконавця не надсилається в Telegram.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {grouped.length === 0 ? (
            <p className="text-sm text-muted-foreground">У плані немає заявок.</p>
          ) : grouped.map((group) => (
            <div key={group.key} className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="break-words text-sm font-semibold text-orange-200">{group.title}</h2>
                <Badge tone={group.key === "unassigned" ? "gray" : "orange"}>{group.items.length} заявок</Badge>
              </div>
              <div className="grid gap-2">
                {group.items.map((item) => <PlanItemCard key={item.id} item={item} plan={plan} />)}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <DispatchHistory dispatches={dispatches} />
    </div>
  );
}

function DraftEditor({ plan }: { plan: WorkPlan }) {
  return (
    <Card className="rounded-[17px] border-orange-500/20 bg-orange-950/10 md:rounded-lg">
      <CardHeader>
        <CardTitle>Редагування чернетки</CardTitle>
        <CardDescription>Після надсилання склад і параметри плану стануть доступні тільки для перегляду.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form action={updateWorkPlanAction.bind(null, plan.id)} className="grid gap-3 md:grid-cols-4">
          <Field label="Назва">
            <Input name="title" defaultValue={plan.title} required />
          </Field>
          <Field label="Період з">
            <Input name="period_start" type="date" defaultValue={plan.period_start} required />
          </Field>
          <Field label="Період по">
            <Input name="period_end" type="date" defaultValue={plan.period_end} required />
          </Field>
          <div className="flex items-end">
            <SubmitButton className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm" pendingText="Зберігається...">Зберегти</SubmitButton>
          </div>
          <div className="md:col-span-4">
            <Field label="Примітка">
              <Textarea name="notes" defaultValue={plan.notes ?? ""} className="min-h-20" />
            </Field>
          </div>
        </form>
        <form action={cancelWorkPlanAction.bind(null, plan.id)}>
          <SubmitButton variant="destructive" className="min-h-8 w-full rounded-lg text-[10px] md:w-auto md:rounded-md md:text-sm" pendingText="Скасовується...">
            Скасувати план
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function PlanItemCard({ item, plan }: { item: WorkPlanItem; plan: WorkPlan }) {
  const ticket = item.ticket;
  return (
    <div className={cn("grid gap-3 rounded-2xl border border-border bg-stone-950/30 p-3 text-sm md:grid-cols-[120px_1fr_130px_120px_160px] md:items-center md:rounded-lg")}>
      <div className="font-semibold text-orange-200">{ticket?.number ?? "-"}</div>
      <div className="min-w-0">
        <div className="break-words font-medium text-stone-100">{ticket?.object?.name ?? "-"}</div>
        <div className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{ticket?.title || ticket?.description || "-"}</div>
        <div className="mt-1 text-xs text-muted-foreground">{ticket?.category?.name ?? item.category ?? "-"}</div>
      </div>
      <Badge tone={ticket?.priority === "high" || ticket?.priority === "critical" ? "orange" : "gray"}>{ticket?.priority ? priorityLabels[ticket.priority] : "-"}</Badge>
      <Badge tone="gray">{ticket?.status ? statusLabels[ticket.status] : "-"}</Badge>
      <div className="grid gap-2 md:flex md:justify-end">
        {ticket ? (
          <Button asChild variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
            <Link href={`/tickets/${ticket.id}`}>Відкрити заявку</Link>
          </Button>
        ) : null}
        {plan.status === "draft" && ticket ? (
          <form action={removeWorkPlanItemAction.bind(null, plan.id)}>
            <input type="hidden" name="ticket_id" value={ticket.id} />
            <SubmitButton variant="outline" size="sm" className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm" pendingText="...">
              Прибрати
            </SubmitButton>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function DispatchHistory({ dispatches }: { dispatches: WorkPlanDispatch[] }) {
  return (
    <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader>
        <CardTitle>Історія надсилань</CardTitle>
        <CardDescription>Результати ручної Telegram-розсилки плану виконавцям.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {dispatches.length === 0 ? (
          <p className="text-sm text-muted-foreground">План ще не надсилали.</p>
        ) : dispatches.map((dispatch, index) => (
          <div key={dispatch.id} className="grid gap-2 rounded-2xl border border-border bg-stone-950/30 p-3 text-sm md:grid-cols-[90px_1fr_140px_160px_1.4fr] md:items-center md:rounded-lg">
            <div className="text-xs font-medium text-orange-200">Спроба {dispatches.length - index}</div>
            <div className="break-words font-medium text-stone-100">{dispatch.worker?.name ?? "Виконавець не знайдений"}</div>
            <Badge tone={statusTone(dispatch.status)}>{dispatchStatusLabels[dispatch.status] ?? dispatch.status}</Badge>
            <div className="text-xs text-muted-foreground">{formatDate(dispatch.sent_at)}</div>
            <div className="line-clamp-3 break-words text-xs text-muted-foreground">{dispatch.error ?? dispatch.message_id ?? "-"}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value, tone = "gray" }: { label: string; value: string; tone?: "gray" | "green" | "orange" | "red" }) {
  return (
    <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardContent className="p-3 md:p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="mt-2 break-words text-sm font-semibold text-stone-100">{value}</div>
        <div className="mt-2"><Badge tone={tone}>{label}</Badge></div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}
