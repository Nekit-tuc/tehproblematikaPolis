"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { CalendarDays, Check, ChevronRight, ClipboardList, Layers3, MapPin, MessageSquarePlus, PencilLine, Search, UserRound, UsersRound, X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus } from "@/types/domain";
import { quickAddTicketCommentAction, quickAssignWorkerAction, quickUnassignWorkerAction, quickUpdateTicketCategoryAction, quickUpdateTicketStatusAction, type QuickTicketActionResult } from "./quick-ticket-actions";

export type QuickTicketData = {
  id: string;
  number: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
  objectName: string;
  objectAddress: string;
  categoryId: string;
  categoryName: string;
  assigneeWorkerId: string | null;
  assigneeWorkerName: string | null;
  repeatCount: number;
  lastRepeatAt: string | null;
};

export type QuickTicketWorker = {
  id: string;
  name: string;
  categories: string[];
};

export type QuickTicketCategory = {
  id: string;
  name: string;
  description: string | null;
};

type QuickMode = "overview" | "status" | "worker" | "category" | "comment";

type QuickTicketModalProps = {
  workPlanId: string;
  ticket: QuickTicketData;
  workers: QuickTicketWorker[];
  categories: QuickTicketCategory[];
  returnTo: string;
  permissions: {
    canChangeStatus: boolean;
    canAssignWorker: boolean;
    canChangeCategory: boolean;
    canComment: boolean;
  };
};

function ticketDetailHref(ticketId: string, returnTo: string) {
  return `/tickets/${ticketId}?returnTo=${encodeURIComponent(returnTo)}`;
}

const statusOptions: Array<{ value: TicketStatus; label: string; hint: string }> = [
  { value: "new", label: "Нова / відкрита", hint: "Заявка очікує старту" },
  { value: "assigned", label: "Призначена", hint: "Закріплена за виконавцем" },
  { value: "in_progress", label: "В роботі", hint: "Роботи виконуються" },
  { value: "waiting", label: "Очікує", hint: "Пауза або матеріали" },
  { value: "waiting_admin_confirmation", label: "На перевірці", hint: "Очікує підтвердження адміністратора" },
  { value: "done", label: "Виконана", hint: "Роботу завершено" },
  { value: "cancelled", label: "Скасована", hint: "Заявку знято з роботи" },
];

const statusLabels: Record<TicketStatus, string> = {
  pending_review: "AI Review",
  new: "Відкрита",
  assigned: "Призначена",
  in_progress: "В роботі",
  waiting: "Очікує",
  waiting_admin_confirmation: "На перевірці",
  done: "Виконана",
  cancelled: "Скасована",
  rejected: "Відхилена",
};

const priorityLabels: Record<TicketPriority, string> = {
  low: "Низький",
  medium: "Середній",
  high: "Високий",
  critical: "Критичний",
};

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("") || "?";
}

function priorityClass(priority: TicketPriority) {
  if (priority === "critical") return "border-red-400/25 bg-red-500/15 text-red-200";
  if (priority === "high") return "border-orange-400/25 bg-orange-500/15 text-orange-200";
  if (priority === "medium") return "border-amber-400/25 bg-amber-500/12 text-amber-200";
  return "border-emerald-400/20 bg-emerald-500/10 text-emerald-200";
}

function statusClass(status: TicketStatus) {
  if (status === "done") return "border-emerald-400/25 bg-emerald-500/12 text-emerald-200";
  if (status === "waiting_admin_confirmation" || status === "waiting") return "border-amber-400/25 bg-amber-500/12 text-amber-200";
  if (status === "cancelled" || status === "rejected") return "border-red-400/25 bg-red-500/12 text-red-200";
  if (status === "in_progress" || status === "assigned") return "border-sky-400/25 bg-sky-500/12 text-sky-200";
  return "border-orange-400/25 bg-orange-500/12 text-orange-200";
}

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex min-h-7 items-center rounded-full border px-2.5 text-[11px] font-semibold", className)}>{children}</span>;
}

function InfoCard({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="min-w-0 rounded-[18px] border border-white/[0.09] bg-white/[0.045] p-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-zinc-500">
        <Icon className="h-3.5 w-3.5 text-orange-300" />
        {label}
      </div>
      <div className="min-w-0 break-words text-[13px] leading-5 text-zinc-100">{value}</div>
    </div>
  );
}

function ActionRow({ icon: Icon, title, subtitle, onClick }: { icon: React.ComponentType<{ className?: string }>; title: string; subtitle: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-3 rounded-[18px] border border-white/[0.09] bg-white/[0.04] p-3 text-left transition active:border-orange-400/40 active:bg-orange-500/10">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-orange-400/20 bg-orange-500/12 text-orange-300">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-zinc-100">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-zinc-500" />
    </button>
  );
}

export function QuickTicketModalButton({ workPlanId, ticket, workers, categories, returnTo, permissions }: QuickTicketModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<QuickMode>("overview");
  const [message, setMessage] = useState<QuickTicketActionResult | null>(null);
  const [status, setStatus] = useState<TicketStatus>(ticket.status);
  const [workerId, setWorkerId] = useState(ticket.assigneeWorkerId ?? "");
  const [categoryId, setCategoryId] = useState(ticket.categoryId);
  const [categoryName, setCategoryName] = useState(ticket.categoryName);
  const [commentLength, setCommentLength] = useState(0);
  const [workerSearch, setWorkerSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const detailHref = ticketDetailHref(ticket.id, returnTo);

  const selectedWorker = workers.find((worker) => worker.id === workerId) ?? null;
  const filteredWorkers = useMemo(() => {
    const query = workerSearch.trim().toLowerCase();
    if (!query) return workers;
    return workers.filter((worker) => `${worker.name} ${worker.categories.join(" ")}`.toLowerCase().includes(query));
  }, [workerSearch, workers]);
  const filteredCategories = useMemo(() => {
    const query = categorySearch.trim().toLowerCase();
    if (!query) return categories;
    return categories.filter((category) => `${category.name} ${category.description ?? ""}`.toLowerCase().includes(query));
  }, [categorySearch, categories]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
    setMode("overview");
    setMessage(null);
  }

  function runAction(action: () => Promise<QuickTicketActionResult>, afterSuccess?: () => void) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage(result);
      if (result.ok) {
        afterSuccess?.();
        router.refresh();
      }
    });
  }

  function handleStatusSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextStatus = formData.get("status") as TicketStatus;
    runAction(() => quickUpdateTicketStatusAction(workPlanId, ticket.id, formData), () => {
      setStatus(nextStatus);
      setMode("overview");
    });
  }

  function handleCommentSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    runAction(() => quickAddTicketCommentAction(workPlanId, ticket.id, formData), () => {
      form.reset();
      setCommentLength(0);
      setMode("overview");
    });
  }

  function handleWorkerSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextWorkerId = String(formData.get("workerId") ?? "");
    runAction(() => quickAssignWorkerAction(workPlanId, ticket.id, formData), () => {
      setWorkerId(nextWorkerId);
      setMode("overview");
    });
  }

  function handleUnassign() {
    runAction(() => quickUnassignWorkerAction(workPlanId, ticket.id), () => {
      setWorkerId("");
      setMode("overview");
    });
  }

  function handleCategorySubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const nextCategoryId = String(formData.get("categoryId") ?? "");
    const nextCategory = categories.find((category) => category.id === nextCategoryId);
    runAction(() => quickUpdateTicketCategoryAction(workPlanId, ticket.id, formData), () => {
      setCategoryId(nextCategoryId);
      setCategoryName(nextCategory?.name ?? categoryName);
      setMode("overview");
    });
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-[10px] border border-white/[0.08] bg-white/[0.035] px-3 text-[10px] font-medium text-zinc-100 transition active:bg-orange-500/10 md:hidden">
        <ClipboardList className="h-3 w-3" />
        Відкрити заявку
      </button>
      <Link href={detailHref} className="hidden h-8 items-center justify-center gap-1.5 rounded-md border border-white/[0.08] bg-white/[0.035] px-3 text-sm font-medium text-zinc-100 transition hover:bg-white/[0.06] md:inline-flex">
        <ClipboardList className="h-3.5 w-3.5" />
        Відкрити заявку
      </Link>

      {open ? (
        <div className="fixed inset-0 z-[140] md:hidden" role="dialog" aria-modal="true" aria-labelledby={`quick-ticket-title-${ticket.id}`}>
          <button type="button" aria-label="Закрити" className="absolute inset-0 z-[141] bg-black/75 backdrop-blur-sm" onClick={close} />
          <div className="absolute inset-x-0 bottom-0 z-[142] max-h-[92dvh] overflow-y-auto overscroll-contain rounded-t-[30px] border-t border-white/[0.13] bg-[#070707]/98 shadow-[0_-28px_80px_rgba(0,0,0,0.75)]">
            <div className="sticky top-0 z-10 border-b border-white/[0.08] bg-[#070707]/95 px-4 pb-3 pt-3 backdrop-blur">
              <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-white/20" />
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-gradient-to-br from-orange-400 to-orange-700 text-black shadow-[0_12px_34px_rgba(249,115,22,0.28)]">
                  <ClipboardList className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-orange-300">{ticket.number}</p>
                  <h2 id={`quick-ticket-title-${ticket.id}`} className="mt-1 line-clamp-2 text-[20px] font-bold leading-[1.12] tracking-[-0.03em] text-zinc-50">
                    {ticket.title || ticket.description || "Заявка без назви"}
                  </h2>
                  <p className="mt-1 flex items-center gap-1.5 text-[11px] text-zinc-500">
                    <CalendarDays className="h-3 w-3" />
                    {formatDate(ticket.createdAt)}
                  </p>
                </div>
                <button type="button" onClick={close} aria-label="Закрити" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.06] text-zinc-200">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge className={statusClass(status)}>{statusLabels[status]}</Badge>
                <Badge className={priorityClass(ticket.priority)}>{priorityLabels[ticket.priority]}</Badge>
                <Badge className="border-white/[0.1] bg-white/[0.05] text-zinc-200">{categoryName}</Badge>
              </div>
            </div>

            <div className="space-y-4 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+96px)]">
              {message ? (
                <div className={cn("rounded-[16px] border px-3 py-2 text-[12px]", message.ok ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-200" : "border-red-400/20 bg-red-500/10 text-red-200")}>
                  {message.message}
                </div>
              ) : null}

              {mode === "overview" ? (
                <>
                  <div className="grid gap-2">
                    <InfoCard icon={MapPin} label="Об'єкт / адреса" value={<>{ticket.objectName}<span className="mt-1 block text-[12px] text-zinc-500">{ticket.objectAddress || "Адресу не вказано"}</span></>} />
                    <InfoCard icon={PencilLine} label="Опис" value={ticket.description || ticket.title || "Опис не вказано"} />
                    <div className="grid grid-cols-2 gap-2">
                      <InfoCard icon={UserRound} label="Виконавець" value={workerId ? selectedWorker?.name ?? ticket.assigneeWorkerName ?? "Виконавець не знайдений" : "Не призначено"} />
                      <InfoCard icon={Layers3} label="Категорія" value={categoryName} />
                      <InfoCard icon={CalendarDays} label="Створено" value={formatDate(ticket.createdAt)} />
                      <InfoCard icon={UsersRound} label="Повтори" value={ticket.repeatCount > 0 ? `${ticket.repeatCount}${ticket.lastRepeatAt ? ` · ${formatDate(ticket.lastRepeatAt)}` : ""}` : "Немає"} />
                    </div>
                  </div>

                  <section className="space-y-2">
                    <h3 className="text-[14px] font-semibold text-zinc-100">Швидкі дії</h3>
                    {permissions.canChangeStatus ? <ActionRow icon={PencilLine} title="Змінити статус" subtitle="Відкрита → В роботі, Виконана..." onClick={() => setMode("status")} /> : null}
                    {permissions.canAssignWorker ? <ActionRow icon={UsersRound} title="Призначити виконавця" subtitle="Змінити або зняти виконавця" onClick={() => setMode("worker")} /> : null}
                    {permissions.canChangeCategory ? <ActionRow icon={Layers3} title="Змінити категорію" subtitle="Змінити напрямок робіт" onClick={() => setMode("category")} /> : null}
                    {permissions.canComment ? <ActionRow icon={MessageSquarePlus} title="Додати коментар" subtitle="Залишити коментар по заявці" onClick={() => setMode("comment")} /> : null}
                  </section>
                </>
              ) : null}

              {mode === "status" ? (
                <form onSubmit={handleStatusSubmit} className="space-y-3 rounded-[20px] border border-white/[0.09] bg-white/[0.04] p-3">
                  <div>
                    <h3 className="text-[16px] font-semibold text-zinc-50">Швидка зміна статусу</h3>
                    <p className="mt-1 text-[12px] text-zinc-500">Оберіть новий статус</p>
                  </div>
                  <div className="space-y-2">
                    {statusOptions.map((option) => (
                      <label key={option.value} className="flex items-center gap-3 rounded-[16px] border border-white/[0.08] bg-black/20 p-3">
                        <input type="radio" name="status" value={option.value} defaultChecked={option.value === status} className="h-4 w-4 accent-orange-500" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold text-zinc-100">{option.label}</span>
                          <span className="block text-[11px] text-zinc-500">{option.hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setMode("overview")} className="h-11 rounded-[16px] border border-white/[0.1] bg-white/[0.04] text-[13px] font-semibold text-zinc-200">Скасувати</button>
                    <button type="submit" disabled={isPending} className="h-11 rounded-[16px] bg-gradient-to-r from-orange-500 to-orange-400 text-[13px] font-bold text-black disabled:opacity-60">{isPending ? "Зберігається..." : "Зберегти"}</button>
                  </div>
                </form>
              ) : null}

              {mode === "comment" ? (
                <form onSubmit={handleCommentSubmit} className="space-y-3 rounded-[20px] border border-white/[0.09] bg-white/[0.04] p-3">
                  <div>
                    <h3 className="text-[16px] font-semibold text-zinc-50">Додати коментар</h3>
                    <p className="mt-1 text-[12px] text-zinc-500">Коротко зафіксуйте стан робіт або домовленість.</p>
                  </div>
                  <textarea name="body" maxLength={500} onChange={(event) => setCommentLength(event.target.value.length)} placeholder="Введіть коментар..." className="min-h-32 w-full resize-none rounded-[16px] border border-white/[0.1] bg-black/30 px-3 py-3 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-orange-400/40" />
                  <div className="flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{commentLength}/500</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setMode("overview")} className="h-11 rounded-[16px] border border-white/[0.1] bg-white/[0.04] text-[13px] font-semibold text-zinc-200">Скасувати</button>
                    <button type="submit" disabled={isPending} className="h-11 rounded-[16px] bg-gradient-to-r from-orange-500 to-orange-400 text-[13px] font-bold text-black disabled:opacity-60">{isPending ? "Додається..." : "Додати коментар"}</button>
                  </div>
                </form>
              ) : null}

              {mode === "category" ? (
                <form onSubmit={handleCategorySubmit} className="space-y-3 rounded-[20px] border border-white/[0.09] bg-white/[0.04] p-3">
                  <div>
                    <h3 className="text-[16px] font-semibold text-zinc-50">Змінити категорію</h3>
                    <p className="mt-1 text-[12px] text-zinc-500">Оберіть нову категорію заявки</p>
                  </div>
                  <label className="flex h-11 items-center gap-2 rounded-[16px] border border-white/[0.1] bg-black/30 px-3">
                    <Search className="h-4 w-4 text-zinc-500" />
                    <input value={categorySearch} onChange={(event) => setCategorySearch(event.target.value)} placeholder="Пошук категорії..." className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600" />
                  </label>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {filteredCategories.map((category) => (
                      <label key={category.id} className="flex items-center gap-3 rounded-[16px] border border-white/[0.08] bg-black/20 p-3">
                        <input type="radio" name="categoryId" value={category.id} defaultChecked={category.id === categoryId} className="sr-only peer" />
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(249,115,22,0.45)]" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-zinc-100">{category.name}</span>
                          {category.description ? <span className="block line-clamp-1 text-[11px] text-zinc-500">{category.description}</span> : null}
                        </span>
                        <Check className="h-4 w-4 text-transparent peer-checked:text-orange-300" />
                      </label>
                    ))}
                    {filteredCategories.length === 0 ? <p className="rounded-[16px] border border-dashed border-white/[0.1] p-3 text-[12px] text-zinc-500">Категорій не знайдено.</p> : null}
                  </div>
                  <p className="text-[11px] leading-4 text-zinc-500">Категорія зміниться у заявці. План виконавця не змінюється автоматично.</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={() => setMode("overview")} className="h-11 rounded-[16px] border border-white/[0.1] bg-white/[0.04] text-[13px] font-semibold text-zinc-200">Скасувати</button>
                    <button type="submit" disabled={isPending} className="h-11 rounded-[16px] bg-gradient-to-r from-orange-500 to-orange-400 text-[13px] font-bold text-black disabled:opacity-60">{isPending ? "Зберігається..." : "Зберегти"}</button>
                  </div>
                </form>
              ) : null}

              {mode === "worker" ? (
                <form onSubmit={handleWorkerSubmit} className="space-y-3 rounded-[20px] border border-white/[0.09] bg-white/[0.04] p-3">
                  <div>
                    <h3 className="text-[16px] font-semibold text-zinc-50">Призначити виконавця</h3>
                    <p className="mt-1 text-[12px] text-zinc-500">Виберіть активного виконавця з довідника.</p>
                  </div>
                  <label className="flex h-11 items-center gap-2 rounded-[16px] border border-white/[0.1] bg-black/30 px-3">
                    <Search className="h-4 w-4 text-zinc-500" />
                    <input value={workerSearch} onChange={(event) => setWorkerSearch(event.target.value)} placeholder="Пошук виконавця..." className="min-w-0 flex-1 bg-transparent text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600" />
                  </label>
                  <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                    {filteredWorkers.map((worker) => (
                      <label key={worker.id} className="flex items-center gap-3 rounded-[16px] border border-white/[0.08] bg-black/20 p-3">
                        <input type="radio" name="workerId" value={worker.id} defaultChecked={worker.id === workerId} className="sr-only peer" />
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] border border-orange-400/25 bg-orange-500/12 text-[12px] font-bold text-orange-200">{initials(worker.name)}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold text-zinc-100">{worker.name}</span>
                          <span className="block truncate text-[11px] text-zinc-500">{worker.categories.length ? worker.categories.join(", ") : "Без категорій"}</span>
                        </span>
                        <Check className="h-4 w-4 text-transparent peer-checked:text-orange-300" />
                      </label>
                    ))}
                    {filteredWorkers.length === 0 ? <p className="rounded-[16px] border border-dashed border-white/[0.1] p-3 text-[12px] text-zinc-500">Виконавців не знайдено.</p> : null}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button type="button" onClick={handleUnassign} disabled={isPending || !workerId} className="h-11 rounded-[16px] border border-red-400/20 bg-red-500/10 text-[13px] font-semibold text-red-200 disabled:opacity-45">Зняти виконавця</button>
                    <button type="submit" disabled={isPending} className="h-11 rounded-[16px] bg-gradient-to-r from-orange-500 to-orange-400 text-[13px] font-bold text-black disabled:opacity-60">{isPending ? "Зберігається..." : "Зберегти"}</button>
                  </div>
                  <button type="button" onClick={() => setMode("overview")} className="h-10 w-full rounded-[15px] border border-white/[0.1] bg-white/[0.04] text-[12px] font-semibold text-zinc-300">Назад</button>
                </form>
              ) : null}
            </div>

            <div className="fixed inset-x-0 bottom-0 z-[143] grid grid-cols-2 gap-2 border-t border-white/[0.1] bg-[#070707]/95 px-4 pb-[calc(env(safe-area-inset-bottom)+12px)] pt-3 backdrop-blur md:hidden">
              <Link href={detailHref} className="inline-flex h-12 items-center justify-center rounded-[18px] border border-white/[0.12] bg-white/[0.06] text-[12px] font-semibold text-zinc-100">
                Перейти на сторінку
              </Link>
              <button type="button" onClick={close} className="h-12 rounded-[18px] bg-gradient-to-r from-orange-500 to-orange-400 text-[13px] font-bold text-black shadow-[0_12px_32px_rgba(249,115,22,0.26)]">
                Закрити
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
