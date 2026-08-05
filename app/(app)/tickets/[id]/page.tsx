import { Bot, BriefcaseBusiness, CalendarDays, Camera, CheckCircle2, ChevronRight, Clock, MapPin, MessageSquare, Send, Store, Tag, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { DirectorTicketPanel } from "@/components/tickets/director-ticket-panel";
import { MobilePhotoViewer } from "@/components/tickets/mobile-photo-viewer";
import { PhotoSubmitButton } from "@/components/tickets/photo-submit-button";
import { TicketHistoryAccordion } from "@/components/tickets/ticket-history-accordion";
import { canAddTicketPhoto, canConfirmTicket, canEditTicket, canHardDeleteTicket, canUnassignWorkerFromTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { photoTypeLabels } from "@/lib/photos";
import { getCategories, getRelatedTicketsBySourceGroup, getTicket, getTicketComments, getTicketHistory, getTicketPhotos } from "@/lib/supabase/queries";
import { getTicketRepeats, type TicketRepeat } from "@/lib/supabase/ticket-repeats";
import { getActiveWorkers, getWorkerById, getWorkersByCategory } from "@/lib/supabase/worker-queries";
import { createClient } from "@/lib/supabase/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { Category, PhotoType, Profile, TicketCommentWithAuthor, TicketHistory, TicketPhotoWithUrl, TicketStatus, TicketWithRelations, Worker, WorkerWithCategories } from "@/types/domain";
import {
  addTicketCommentAction,
  assignWorkerAction,
  confirmTicketAction,
  confirmWorkerCompletionAction,
  hardDeleteTicketAction,
  rejectTicketAction,
  returnWorkerCompletionAction,
  sendTicketToWorkerAction,
  unassignWorkerAction,
  updateTicketCategoryAction,
  updateTicketStatusAction,
  uploadTicketPhotosAction,
} from "./actions";

const photoGroups: PhotoType[] = ["before", "progress", "after"];
const mobileStatusOptions: TicketStatus[] = ["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled", "rejected"];

export default async function TicketDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photoError?: string; photoSuccess?: string; commentError?: string; commentSuccess?: string; statusError?: string; statusSuccess?: string; statusWarning?: string }>;
}) {
  const { profile } = await requireAuth();
  const { id } = await params;
  const query = await searchParams;
  const ticketResult = await getTicket(id);
  const ticket = ticketResult.data;
  if (!ticket && !ticketResult.error) notFound();
  let assignedWorker: Worker | WorkerWithCategories | null = null;
  let categories: Category[] = [];

  if (ticket?.assignee_worker_id) {
    const assignedWorkerLoad = await getWorkerById(ticket.assignee_worker_id);
    if (assignedWorkerLoad.error) console.error("[ticket-detail] load failed", { scope: "assigned_worker", error: assignedWorkerLoad.error });
    assignedWorker = assignedWorkerLoad.data;
  }

  if (ticket && canConfirmTicket(profile)) {
    const categoriesResult = await getCategories();
    if (categoriesResult.error) console.error("[ticket-detail] load failed", { scope: "categories", error: categoriesResult.error });
    categories = categoriesResult.data;
  }

  const error = ticketResult.error;

  return (
    <div className="page-shell space-y-3 pb-32 md:space-y-5 md:pb-10">
      {error ? <Alert title={"Не вдалося завантажити дані"}>{error}</Alert> : null}
      {query.photoError ? <Alert title={"Фото не завантажено"}>{decodeURIComponent(query.photoError)}</Alert> : null}
      {query.photoSuccess ? <Alert title={"Фото додано"}>{"Завантаження завершено успішно."}</Alert> : null}
      {query.commentError ? <Alert title={"Коментар не додано"}>{decodeURIComponent(query.commentError)}</Alert> : null}
      {query.commentSuccess ? <Alert title={"Коментар додано"}>{"Повідомлення збережено в заявці."}</Alert> : null}
      {query.statusError ? <Alert title={"Статус не змінено"}>{decodeURIComponent(query.statusError)}</Alert> : null}
      {query.statusSuccess ? <Alert title={"Статус оновлено"}>{"Новий статус заявки збережено."}</Alert> : null}
      {query.statusWarning ? <Alert title="Потрібна увага">{decodeURIComponent(query.statusWarning)}</Alert> : null}

      {!ticket ? (
        <Card className="rounded-[20px] border-white/10 bg-white/[0.04]"><CardContent className="pt-5 text-sm text-muted-foreground">{"Заявку не знайдено."}</CardContent></Card>
      ) : (
        <>
          <div className="md:hidden">
            <Suspense fallback={<DetailBlockFallback title="Заявка" />}>
              <MobileTicketDetails ticket={ticket} profile={profile} assignedWorker={assignedWorker} categories={categories} />
            </Suspense>
          </div>
          <div className="hidden space-y-5 md:block">
          <TicketHeroCard ticket={ticket} />
          <DirectorTicketPanel ticket={ticket} profile={profile} />
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
            <div className="order-2 min-w-0 space-y-3 md:space-y-5 lg:order-1">
              <TicketDescriptionCard ticket={ticket} assignedWorker={assignedWorker} />
              {canConfirmTicket(profile) ? (
                <Suspense fallback={<DetailBlockFallback title="Виконавець" />}>
                  <WorkerAssignmentSection ticket={ticket} profile={profile} assignedWorker={assignedWorker} />
                </Suspense>
              ) : null}
              <Suspense fallback={<DetailBlockFallback title="Фото" />}>
                <TicketPhotosSection ticket={ticket} profile={profile} />
              </Suspense>
              <Suspense fallback={<DetailBlockFallback title="Коментарі" />}>
                <TicketCommentsSection ticketId={ticket.id} />
              </Suspense>
            </div>
            <div className="order-1 min-w-0 space-y-3 md:space-y-5 lg:order-2">
              <TicketQuickActions ticket={ticket} profile={profile} categories={categories} />
              <Suspense fallback={<DetailBlockFallback title="Історія" />}>
                <TicketHistorySection ticketId={ticket.id} />
              </Suspense>
              <Suspense fallback={<DetailBlockFallback title="Пов'язані заявки" />}>
                <RelatedTicketsSection ticket={ticket} />
              </Suspense>
              {(ticket.repeat_count ?? 0) > 0 ? (
                <Suspense fallback={<DetailBlockFallback title="Дублі / повторні звернення" />}>
                  <TicketRepeatsSection ticket={ticket} />
                </Suspense>
              ) : null}
              {canHardDeleteTicket(profile) ? <TicketDangerZone ticketId={ticket.id} /> : null}
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}

function SoftCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <Card className={"min-w-0 rounded-[22px] border-white/[0.08] bg-[linear-gradient(145deg,rgba(255,255,255,0.065),rgba(255,255,255,0.025))] shadow-[0_12px_32px_rgba(0,0,0,0.28)] " + className}>{children}</Card>;
}

function DetailBlockFallback({ title }: { title: string }) {
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle title={title} />
        <div className="h-16 animate-pulse rounded-[14px] border border-white/[0.07] bg-white/[0.035]" />
      </CardContent>
    </SoftCard>
  );
}

function DetailBlockError({ title, error }: { title: string; error: string }) {
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle title={title} />
        <p className="break-words text-[12px] text-red-200">{error}</p>
      </CardContent>
    </SoftCard>
  );
}

async function MobileTicketDetails({
  ticket,
  profile,
  assignedWorker,
  categories,
}: {
  ticket: TicketWithRelations;
  profile: Profile;
  assignedWorker: Worker | WorkerWithCategories | null;
  categories: Category[];
}) {
  const [photosResult, historyResult, workersResult] = await Promise.all([
    getTicketPhotos(ticket.id),
    getTicketHistory(ticket.id),
    canConfirmTicket(profile) ? getActiveWorkers() : Promise.resolve({ data: [] as WorkerWithCategories[], error: null as string | null }),
  ]);

  if (photosResult.error) console.error("[ticket-detail-mobile] load failed", { scope: "photos", error: photosResult.error });
  if (historyResult.error) console.error("[ticket-detail-mobile] load failed", { scope: "history", error: historyResult.error });
  if (workersResult.error) console.error("[ticket-detail-mobile] load failed", { scope: "workers", error: workersResult.error });

  return (
    <div className="space-y-3">
      <MobileTicketMainCard ticket={ticket} profile={profile} assignedWorker={assignedWorker} />
      <MobileTicketSourceCard ticket={ticket} />
      <MobileTicketActionPanel ticket={ticket} profile={profile} workers={workersResult.data} categories={categories} />
      <MobileTicketPhotosCard photos={photosResult.data} />
      <TicketHistoryAccordion history={historyResult.data} />
      {canHardDeleteTicket(profile) ? <MobileDeleteTicketButton ticketId={ticket.id} /> : null}
    </div>
  );
}

function MobileTicketMainCard({ ticket, profile, assignedWorker }: { ticket: TicketWithRelations; profile: Profile; assignedWorker: Worker | WorkerWithCategories | null }) {
  const canReview = canConfirmTicket(profile) && ticket.status === "pending_review";
  return (
    <SoftCard className="overflow-hidden">
      <CardContent className="space-y-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-300">{ticket.number}</div>
            <h1 className="mt-1 line-clamp-3 break-words text-[18px] font-bold leading-6 text-zinc-50">{ticket.title || ticket.description}</h1>
          </div>
          <Badge tone="orange" className="shrink-0 rounded-full px-2 py-1 text-[10px]">{statusLabels[ticket.status]}</Badge>
        </div>

        <div className="space-y-1.5 text-[12px] leading-5 text-zinc-400">
          <div className="flex min-w-0 items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="min-w-0 truncate">{ticket.object?.name ?? "Об'єкт"} · {ticketAddress(ticket)}</span>
          </div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
            <span className="min-w-0 truncate">{shortCategoryName(ticket.category?.name)}</span>
            <span className="text-zinc-600">·</span>
            <span>{priorityLabels[ticket.priority]}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <BriefcaseBusiness className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="min-w-0 truncate">{workerDisplayName(assignedWorker, ticket.assignee_worker_id)}</span>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
            <span className="min-w-0 truncate">Створено {formatDate(ticket.created_at)}</span>
          </div>
        </div>

        {canReview ? (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <form action={confirmTicketAction.bind(null, ticket.id)}>
              <SubmitButton type="submit" pendingText="Підтверджуємо..." className="h-11 w-full rounded-xl bg-orange-500 px-2 text-[13px] font-semibold text-black hover:bg-orange-400">Підтвердити</SubmitButton>
            </form>
            <form action={rejectTicketAction.bind(null, ticket.id)}>
              <SubmitButton type="submit" pendingText="Відхиляємо..." variant="outline" className="h-11 w-full rounded-xl border-red-500/30 px-2 text-[13px] font-semibold text-red-300 hover:bg-red-500/10">Відхилити</SubmitButton>
            </form>
          </div>
        ) : null}
      </CardContent>
    </SoftCard>
  );
}

function MobileTicketSourceCard({ ticket }: { ticket: TicketWithRelations }) {
  if (!shouldShowMobileSource(ticket)) return null;

  const isDirector = ticket.source === "director_portal";
  const title = isDirector ? "Заявка від директора" : "Заявка AI / Telegram";
  const subtitle = isDirector
    ? [ticket.creator?.full_name, ticket.director_phone ?? ticket.creator?.phone].filter(Boolean).join(" · ") || "Дані директора уточнюються"
    : ticket.telegram_user_name || "Створено з групи Telegram";
  const objectSearch = ticket.object?.object_number || ticket.object?.address || ticket.object?.name || "";
  const href = objectSearch ? `/objects?q=${encodeURIComponent(objectSearch)}` : "/objects";

  return (
    <SoftCard>
      <CardContent className="p-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-300">
            {isDirector ? <Store className="h-5 w-5" /> : <Bot className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-zinc-100">{title}</div>
            <div className="mt-0.5 truncate text-[11px] text-zinc-400">{subtitle}</div>
            <div className="mt-0.5 truncate text-[11px] text-zinc-500">{ticket.object?.name ?? "Об'єкт"} · {ticketAddress(ticket)}</div>
          </div>
          <Link href={href} aria-label="Відкрити об'єкт" className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 text-zinc-300">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </SoftCard>
  );
}

function MobileTicketActionPanel({ ticket, profile, workers, categories }: { ticket: TicketWithRelations; profile: Profile; workers: WorkerWithCategories[]; categories: Category[] }) {
  const editable = canEditTicket(profile, ticket);
  const canManage = canConfirmTicket(profile);
  if (!editable && !canManage) return null;

  return (
    <SoftCard>
      <CardContent className="space-y-3 p-4">
        <SectionTitle icon={CheckCircle2} title="Що зробити?" />

        {editable ? (
          <form action={updateTicketStatusAction.bind(null, ticket.id)} className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400">Статус</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <MobileSelect name="status" defaultValue={ticket.status}>
                {mobileStatusOptions.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
              </MobileSelect>
              <SubmitButton type="submit" pendingText="..." className="h-10 rounded-xl px-3 text-[12px]">Зберегти</SubmitButton>
            </div>
          </form>
        ) : null}

        {canManage ? (
          <form action={assignWorkerAction.bind(null, ticket.id)} className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400">Виконавець</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <MobileSelect name="workerId" defaultValue={ticket.assignee_worker_id ?? ""} required>
                <option value="" disabled>Не призначено</option>
                {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
              </MobileSelect>
              <SubmitButton type="submit" pendingText="..." className="h-10 rounded-xl px-3 text-[12px]">{ticket.assignee_worker_id ? "Змінити" : "Призначити"}</SubmitButton>
            </div>
          </form>
        ) : null}

        {canManage && categories.length > 0 ? (
          <form action={updateTicketCategoryAction.bind(null, ticket.id)} className="space-y-1.5">
            <label className="text-[11px] font-semibold text-zinc-400">Категорія</label>
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <MobileSelect name="categoryId" defaultValue={ticket.category_id} required>
                {categories.map((category) => <option key={category.id} value={category.id}>{shortCategoryName(category.name)}</option>)}
              </MobileSelect>
              <SubmitButton type="submit" pendingText="..." className="h-10 rounded-xl px-3 text-[12px]">Зберегти</SubmitButton>
            </div>
          </form>
        ) : null}
      </CardContent>
    </SoftCard>
  );
}

function MobileSelect({ children, className = "", ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={"h-10 min-w-0 rounded-xl border border-white/10 bg-black/30 px-3 text-[12px] text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40 " + className}
    >
      {children}
    </select>
  );
}

function MobileTicketPhotosCard({ photos }: { photos: TicketPhotoWithUrl[] }) {
  const beforePhotos = photos.filter((photo) => photo.type === "before");
  const afterPhotos = photos.filter((photo) => photo.type === "after");
  if (beforePhotos.length === 0 && afterPhotos.length === 0) return null;

  return (
    <SoftCard>
      <CardContent className="space-y-3 p-4">
        <SectionTitle icon={Camera} title="Фото" />
        {beforePhotos.length > 0 ? <MobilePhotoViewer photos={beforePhotos} label="До" /> : null}
        {afterPhotos.length > 0 ? <MobilePhotoViewer photos={afterPhotos} label="Після" /> : null}
      </CardContent>
    </SoftCard>
  );
}

function MobileDeleteTicketButton({ ticketId }: { ticketId: string }) {
  return (
    <form action={hardDeleteTicketAction.bind(null, ticketId)} className="pt-1">
      <ConfirmSubmitButton
        type="submit"
        variant="outline"
        pendingText="Видаляємо..."
        className="h-12 w-full rounded-xl border-red-500/30 bg-red-950/10 text-[13px] font-semibold text-red-300 hover:bg-red-500/10"
        message="Ви точно хочете повністю видалити заявку? Цю дію не можна скасувати."
      >
        <Trash2 className="h-4 w-4" />
        Видалити заявку
      </ConfirmSubmitButton>
    </form>
  );
}

function shouldShowMobileSource(ticket: TicketWithRelations) {
  if (ticket.status !== "pending_review") return false;
  const source = (ticket.source ?? "").toLowerCase();
  return source === "director_portal" || source.includes("telegram") || source.includes("ai") || Boolean(ticket.telegram_chat_id || ticket.telegram_source_group_id);
}

function shortCategoryName(name?: string | null) {
  if (!name) return "Без категорії";
  const lower = name.toLowerCase();
  if (lower.includes("буд") && (lower.includes("звар") || lower.includes("ремонт"))) return "Буд-роботи / ремонт";
  return name.length > 30 ? `${name.slice(0, 27).trim()}...` : name;
}

async function WorkerAssignmentSection({ ticket, profile, assignedWorker }: { ticket: TicketWithRelations; profile: Profile; assignedWorker: Worker | WorkerWithCategories | null }) {
  const [workersLoad, recommendedWorkersLoad] = await Promise.allSettled([
    getActiveWorkers(),
    ticket.category_id ? getWorkersByCategory(ticket.category_id) : Promise.resolve({ data: [] as WorkerWithCategories[], error: null as string | null }),
  ]);

  const workersResult = workersLoad.status === "fulfilled" ? workersLoad.value : { data: [] as WorkerWithCategories[], error: String(workersLoad.reason) };
  const recommendedWorkersResult = recommendedWorkersLoad.status === "fulfilled" ? recommendedWorkersLoad.value : { data: [] as WorkerWithCategories[], error: String(recommendedWorkersLoad.reason) };

  if (workersResult.error) console.error("[ticket-detail] load failed", { scope: "workers", error: workersResult.error });
  if (recommendedWorkersResult.error) console.error("[ticket-detail] load failed", { scope: "recommended_workers", error: recommendedWorkersResult.error });

  return (
    <WorkerAssignmentCard
      ticketId={ticket.id}
      assignedWorkerId={ticket.assignee_worker_id}
      currentWorker={assignedWorker}
      workers={workersResult.data}
      recommendedWorkers={recommendedWorkersResult.data}
      status={ticket.status}
      assignedAt={ticket.assigned_at}
      sentAt={ticket.sent_to_worker_at}
      completedAt={ticket.worker_completed_at}
      canUnassign={canUnassignWorkerFromTicket(profile)}
    />
  );
}

async function TicketPhotosSection({ ticket, profile }: { ticket: TicketWithRelations; profile: Profile }) {
  const photosResult = await getTicketPhotos(ticket.id);
  if (photosResult.error) return <DetailBlockError title="Фото" error={photosResult.error} />;
  return <TicketPhotosCard ticket={ticket} profile={profile} photos={photosResult.data} />;
}

async function TicketCommentsSection({ ticketId }: { ticketId: string }) {
  const commentsResult = await getTicketComments(ticketId);
  if (commentsResult.error) return <DetailBlockError title="Коментарі" error={commentsResult.error} />;
  return <TicketCommentsCard ticketId={ticketId} comments={commentsResult.data} />;
}

async function TicketHistorySection({ ticketId }: { ticketId: string }) {
  const historyResult = await getTicketHistory(ticketId);
  if (historyResult.error) return <DetailBlockError title="Історія" error={historyResult.error} />;
  return <TicketHistoryCard history={historyResult.data} />;
}

async function RelatedTicketsSection({ ticket }: { ticket: TicketWithRelations }) {
  if (!ticket.telegram_source_group_id) return null;
  const relatedResult = await getRelatedTicketsBySourceGroup(ticket.telegram_source_group_id, ticket.id);
  if (relatedResult.error) return <DetailBlockError title="Пов'язані заявки" error={relatedResult.error} />;
  return relatedResult.data.length > 0 ? <RelatedTicketsCard tickets={relatedResult.data} /> : null;
}

async function TicketRepeatsSection({ ticket }: { ticket: TicketWithRelations }) {
  const repeatsResult = await getTicketRepeats(ticket.id, 5);
  if (repeatsResult.error) return <DetailBlockError title="Дублі / повторні звернення" error={repeatsResult.error} />;
  return <TicketRepeatsCard ticket={ticket} repeats={repeatsResult.data} />;
}

function SectionTitle({ icon: Icon, title, right }: { icon?: React.ElementType; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {Icon ? <Icon className="h-3.5 w-3.5 shrink-0 text-orange-300" /> : null}
        <h2 className="truncate text-[13px] font-semibold text-zinc-100 md:text-sm">{title}</h2>
      </div>
      {right}
    </div>
  );
}

function ticketAddress(ticket: TicketWithRelations) {
  return [ticket.object?.address, ticket.object?.city].filter(Boolean).join(" \u00B7 ") || ticket.object?.name || "-";
}

function TicketHeroCard({ ticket }: { ticket: TicketWithRelations }) {
  return (
    <SoftCard className="overflow-hidden">
      <CardContent className="relative p-3.5 md:p-4">
        <div className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-orange-400 via-orange-600 to-zinc-800" />
        <div className="flex min-w-0 items-start justify-between gap-3 pl-1">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-orange-300">{ticket.number}</div>
            <h1 className="mt-1.5 break-words text-[20px] font-bold leading-6 text-zinc-50 md:text-2xl md:leading-7">{ticket.title}</h1>
            <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[12px] text-zinc-400">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-zinc-500" />
              <span className="min-w-0 truncate">{ticket.object?.name ?? "-"} {"\u00B7"} {ticketAddress(ticket)}</span>
            </div>
          </div>
          {(ticket.repeat_count ?? 0) > 0 ? <Badge tone="orange" className="shrink-0 rounded-full px-2 py-1 text-[10px]">{"Повторна · "}{ticket.repeat_count}</Badge> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 pl-1">
          <Badge tone="orange" className="rounded-full px-2 py-1 text-[10px] md:text-xs">{statusLabels[ticket.status]}</Badge>
          <Badge tone={ticket.priority === "critical" || ticket.priority === "high" ? "red" : ticket.priority === "medium" ? "orange" : "gray"} className="rounded-full px-2 py-1 text-[10px] md:text-xs">{priorityLabels[ticket.priority]}</Badge>
          <Badge tone="gray" className="rounded-full px-2 py-1 text-[10px] md:text-xs"><Tag className="mr-1 h-3 w-3" />{ticket.category?.name ?? "-"}</Badge>
        </div>
      </CardContent>
    </SoftCard>
  );
}

function TicketQuickActions({ ticket, profile, categories }: { ticket: TicketWithRelations; profile: Profile; categories: Category[] }) {
  const canConfirm = canConfirmTicket(profile) && ticket.status === "pending_review" && ticket.source !== "director_portal";
  const editable = canEditTicket(profile, ticket);
  const canChangeCategory = canConfirmTicket(profile) && categories.length > 0;
  if (!canConfirm && !editable && !canChangeCategory) return null;
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5">
        <SectionTitle icon={CheckCircle2} title={"Швидкі дії"} />
        {canConfirm ? (
          <div className="grid grid-cols-2 gap-2">
            <form action={confirmTicketAction.bind(null, ticket.id)}><SubmitButton type="submit" pendingText="Підтверджуємо..." className="h-10 w-full rounded-[14px] bg-emerald-600 px-2 text-[11px] hover:bg-emerald-500 md:text-sm">{"Підтвердити"}</SubmitButton></form>
            <form action={rejectTicketAction.bind(null, ticket.id)}><SubmitButton type="submit" pendingText="Відхиляємо..." variant="destructive" className="h-10 w-full rounded-[14px] px-2 text-[11px] md:text-sm">{"Відхилити"}</SubmitButton></form>
          </div>
        ) : null}
        {editable ? (
          <form action={updateTicketStatusAction.bind(null, ticket.id)} className="grid grid-cols-2 gap-2">
            {(["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled"] as TicketStatus[]).map((status) => (
              <SubmitButton key={status} type="submit" name="status" value={status} pendingText="Оновлюємо..." variant={ticket.status === status ? "default" : "outline"} className="h-10 rounded-[14px] px-2 text-[10px] md:text-xs">{statusLabels[status]}</SubmitButton>
            ))}
          </form>
        ) : null}
        {canChangeCategory ? (
          <form action={updateTicketCategoryAction.bind(null, ticket.id)} className="grid gap-2">
            <div className="text-[11px] font-semibold text-zinc-400">Змінити категорію</div>
            <div className="grid gap-2 md:grid-cols-[1fr_auto]">
              <select name="categoryId" defaultValue={ticket.category_id} required className="h-10 w-full rounded-[14px] border border-white/[0.09] bg-black/25 px-3 text-[12px] text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40">
                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
              <SubmitButton type="submit" pendingText="Зберігаємо..." className="h-10 rounded-[14px] px-3 text-[12px]">Зберегти</SubmitButton>
            </div>
            <p className="text-[10px] leading-4 text-zinc-500">Категорія зміниться у заявці. План виконавця не змінюється автоматично.</p>
          </form>
        ) : null}
      </CardContent>
    </SoftCard>
  );
}

function TicketDescriptionCard({ ticket, assignedWorker }: { ticket: TicketWithRelations; assignedWorker: Worker | WorkerWithCategories | null }) {
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle icon={MessageSquare} title={"Опис"} />
        <p className="break-words text-[13px] leading-5 text-zinc-200 md:text-sm md:leading-6">{ticket.description}</p>
        <div className="grid gap-2 text-[11px] md:grid-cols-2 md:text-xs">
          <InlineInfo label={"Категорія"} value={ticket.category?.name ?? "-"} />
          <InlineInfo label={"Виконавець"} value={workerDisplayName(assignedWorker, ticket.assignee_worker_id)} />
          <InlineInfo label={"Об'єкт"} value={ticket.object?.name ?? "-"} />
          <InlineInfo label={"Адреса"} value={ticketAddress(ticket)} />
          <InlineInfo label={"Створено"} value={formatDate(ticket.created_at)} />
          <InlineInfo label={"Оновлено"} value={formatDate(ticket.updated_at)} />
        </div>
      </CardContent>
    </SoftCard>
  );
}

function InlineInfo({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-3 rounded-[13px] border border-white/[0.07] bg-black/20 px-3 py-2"><span className="shrink-0 text-zinc-500">{label}</span><span className="min-w-0 break-words text-right font-medium text-zinc-200">{value}</span></div>;
}

function TicketPhotosCard({ ticket, profile, photos }: { ticket: TicketWithRelations; profile: Profile; photos: TicketPhotoWithUrl[] }) {
  return (
    <SoftCard>
      <CardContent className="space-y-4 p-3.5 md:p-4">
        <SectionTitle icon={Camera} title={"Фото"} />
        <div className="grid gap-3 md:grid-cols-3">
          {photoGroups.map((type) => <PhotoGroup key={type} type={type} photos={photos.filter((photo) => photo.type === type)} canUpload={canAddTicketPhoto(profile, ticket, type)} action={uploadTicketPhotosAction.bind(null, ticket.id, type)} />)}
        </div>
      </CardContent>
    </SoftCard>
  );
}

function TicketCommentsCard({ ticketId, comments }: { ticketId: string; comments: TicketCommentWithAuthor[] }) {
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle icon={MessageSquare} title={"Коментарі"} />
        {comments.length === 0 ? <p className="text-[12px] text-zinc-500">{"Коментарів поки немає."}</p> : comments.map((comment) => <div key={comment.id} className="rounded-[13px] border border-white/[0.07] bg-black/20 p-3 text-[12px] md:text-sm"><div className="font-medium text-zinc-200">{comment.author?.full_name ?? "Користувач"}</div><p className="mt-1 break-words text-zinc-400">{comment.body}</p></div>)}
        <form action={addTicketCommentAction.bind(null, ticketId)} className="space-y-2"><Textarea name="body" required placeholder={"Додати коментар"} className="min-h-20 rounded-[14px] text-sm" /><SubmitButton type="submit" pendingText="Надсилаємо..." className="h-10 rounded-[14px] px-4 text-[12px]">{"Надіслати"}</SubmitButton></form>
      </CardContent>
    </SoftCard>
  );
}

function TicketHistoryCard({ history }: { history: TicketHistory[] }) {
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle icon={Clock} title={"Історія"} />
        {history.length === 0 ? <p className="text-[12px] text-zinc-500">{"Історія ще порожня."}</p> : history.slice(0, 6).map((item) => <div key={item.id} className="relative border-l border-orange-500/30 pl-3"><span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-orange-400" /><div className="break-words text-[12px] font-medium text-zinc-200 md:text-sm">{item.action}</div><div className="mt-0.5 text-[10px] text-zinc-500 md:text-xs">{item.actor?.full_name ?? "Система"} {"·"} {formatDate(item.created_at)}</div></div>)}
      </CardContent>
    </SoftCard>
  );
}

function RelatedTicketsCard({ tickets }: { tickets: TicketWithRelations[] }) {
  return <SoftCard><CardContent className="space-y-3 p-3.5 md:p-4"><SectionTitle title={"Пов'язані заявки"} />{tickets.map((relatedTicket) => <Link key={relatedTicket.id} href={"/tickets/" + relatedTicket.id} className="block rounded-[13px] border border-white/[0.07] bg-black/20 p-3 text-[12px] transition-colors hover:bg-white/[0.05]"><div className="font-medium text-orange-200">{relatedTicket.number}</div><div className="mt-1 line-clamp-2 break-words text-zinc-300">{relatedTicket.title}</div><div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="gray" className="text-[10px]">{relatedTicket.category?.name ?? "-"}</Badge><Badge tone="orange" className="text-[10px]">{statusLabels[relatedTicket.status]}</Badge></div></Link>)}</CardContent></SoftCard>;
}

function TicketRepeatsCard({ ticket, repeats }: { ticket: TicketWithRelations; repeats: TicketRepeat[] }) {
  return <SoftCard className="border-orange-500/20 bg-orange-500/[0.05]"><CardContent className="space-y-3 p-3.5 md:p-4"><SectionTitle title={"Дублі / повторні звернення"} right={<Badge tone="orange" className="rounded-full text-[10px]">{ticket.repeat_count}</Badge>} />{repeats.map((repeat) => <div key={repeat.id} className="rounded-[13px] border border-white/[0.07] bg-black/20 p-3 text-[12px]"><div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500"><span>{repeat.created_by_name ?? "Telegram"}</span><span>{formatDate(repeat.created_at)}</span></div><p className="mt-1.5 line-clamp-3 break-words text-zinc-300">{repeat.raw_text}</p></div>)}{(ticket.repeat_count ?? 0) > repeats.length ? <p className="text-[11px] text-zinc-500">{"Показано останні 5 з "}{ticket.repeat_count}</p> : null}</CardContent></SoftCard>;
}

function TicketDangerZone({ ticketId }: { ticketId: string }) {
  return <details className="rounded-[20px] border border-red-500/25 bg-red-950/10 p-3.5"><summary className="cursor-pointer list-none text-[13px] font-semibold text-red-200">{"Небезпечна дія"}</summary><div className="mt-3 space-y-3"><p className="text-[11px] leading-4 text-red-100/70">{"Цю дію неможливо скасувати."}</p><form action={hardDeleteTicketAction.bind(null, ticketId)}><ConfirmSubmitButton type="submit" variant="destructive" className="h-10 w-full rounded-[14px] text-[12px]" message={"Ви точно хочете повністю видалити заявку з бази? Цю дію не можна скасувати."}><Trash2 className="h-4 w-4" />{"Видалити заявку"}</ConfirmSubmitButton></form></div></details>;
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-stone-950/30 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function workerDisplayName(worker: Worker | WorkerWithCategories | null, workerId?: string | null) {
  if (worker?.name) return worker.name;
  return workerId ? "Виконавець не знайдений" : "Не призначено";
}

function workerCategories(worker: Worker | WorkerWithCategories | null) {
  return "categories" in (worker ?? {}) ? ((worker as WorkerWithCategories).categories ?? []) : [];
}

function WorkerAssignmentCard({
  ticketId,
  assignedWorkerId,
  currentWorker,
  workers,
  recommendedWorkers,
  status,
  assignedAt,
  sentAt,
  completedAt,
  canUnassign,
}: {
  ticketId: string;
  assignedWorkerId?: string | null;
  currentWorker: Worker | WorkerWithCategories | null;
  workers: WorkerWithCategories[];
  recommendedWorkers: WorkerWithCategories[];
  status: TicketStatus;
  assignedAt?: string | null;
  sentAt?: string | null;
  completedAt?: string | null;
  canUnassign: boolean;
}) {
  const recommendedIds = new Set(recommendedWorkers.map((worker) => worker.id));
  const categories = workerCategories(currentWorker);
  const sortedWorkers = [...recommendedWorkers, ...workers.filter((worker) => !recommendedIds.has(worker.id))];
  const initials = currentWorker?.name?.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "--";

  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle icon={BriefcaseBusiness} title={"Виконавець"} />
        <div className="rounded-[16px] border border-white/[0.07] bg-black/20 p-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-orange-400/25 bg-orange-500/15 text-[12px] font-bold text-orange-200">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="break-words text-[14px] font-semibold text-zinc-100">{workerDisplayName(currentWorker, assignedWorkerId)}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {currentWorker?.is_active !== undefined ? <Badge tone={currentWorker.is_active ? "green" : "gray"} className="rounded-full px-2 py-0.5 text-[10px]">{currentWorker.is_active ? "Активний" : "Неактивний"}</Badge> : null}
                {currentWorker?.telegram_username ? <Badge tone="gray" className="rounded-full px-2 py-0.5 text-[10px]">@{currentWorker.telegram_username}</Badge> : null}
                {currentWorker?.telegram_id ? <Badge tone="gray" className="rounded-full px-2 py-0.5 text-[10px]">Telegram ID: {currentWorker.telegram_id}</Badge> : null}
              </div>
              {categories.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{categories.map((category) => <Badge key={category.id} tone="orange" className="rounded-full px-2 py-0.5 text-[10px]">{category.name}</Badge>)}</div> : null}
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-3">
            <InlineInfo label={"Призначено"} value={formatDate(assignedAt)} />
            <InlineInfo label={"Telegram"} value={formatDate(sentAt)} />
            <InlineInfo label={"Відмітка"} value={formatDate(completedAt)} />
          </div>
        </div>

        <form action={assignWorkerAction.bind(null, ticketId)} className="grid gap-2 md:grid-cols-[1fr_auto]">
          <select name="workerId" required defaultValue={currentWorker?.id ?? recommendedWorkers[0]?.id ?? ""} className="h-10 w-full rounded-[14px] border border-white/[0.09] bg-black/25 px-3 text-[12px] text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40">
            <option value="">{"Оберіть виконавця"}</option>
            {sortedWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}{recommendedIds.has(worker.id) ? " ? recommended" : ""}</option>)}
          </select>
          <SubmitButton type="submit" pendingText="Призначаємо..." className="h-10 rounded-[14px] px-3 text-[12px]">{"Призначити"}</SubmitButton>
        </form>

        {currentWorker ? (
          <div className="grid grid-cols-2 gap-2">
            <form action={sendTicketToWorkerAction.bind(null, ticketId)}>
              <input type="hidden" name="workerId" value={currentWorker.id} />
              <SubmitButton type="submit" pendingText="Надсилаємо..." variant="outline" className="h-10 w-full rounded-[14px] px-2 text-[11px]"><Send className="h-3.5 w-3.5" />Telegram</SubmitButton>
            </form>
            {canUnassign ? (
              <form action={unassignWorkerAction.bind(null, ticketId)}>
                <ConfirmSubmitButton type="submit" variant="outline" className="h-10 w-full rounded-[14px] px-2 text-[11px]" message={"Зняти призначеного виконавця з цієї заявки?"}><UserX className="h-3.5 w-3.5" />{"Зняти"}</ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {status === "waiting_admin_confirmation" ? (
          <div className="rounded-[16px] border border-orange-500/25 bg-orange-500/10 p-3">
            <p className="text-[12px] font-medium text-orange-100">{"Виконавець позначив заявку виконаною."}</p>
            <div className="mt-3 grid gap-3">
              <form action={confirmWorkerCompletionAction.bind(null, ticketId)} className="grid gap-2">
                <select name="rating" defaultValue="5" className="h-10 w-full rounded-[14px] border border-white/[0.09] bg-black/25 px-3 text-[12px] text-zinc-100 outline-none">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select>
                <Textarea name="feedback" placeholder={"Коментар адміністратора"} className="min-h-16 rounded-[14px] text-sm" />
                <SubmitButton type="submit" pendingText="Підтверджуємо..." className="h-10 rounded-[14px] bg-emerald-600 text-[12px] hover:bg-emerald-500">{"Підтвердити виконання"}</SubmitButton>
              </form>
              <form action={returnWorkerCompletionAction.bind(null, ticketId)} className="grid gap-2">
                <Textarea name="feedback" required placeholder={"Що потрібно доробити?"} className="min-h-16 rounded-[14px] text-sm" />
                <SubmitButton type="submit" pendingText="Повертаємо..." variant="outline" className="h-10 rounded-[14px] text-[12px]">{"Повернути"}</SubmitButton>
              </form>
            </div>
          </div>
        ) : null}
      </CardContent>
    </SoftCard>
  );
}

function PhotoGroup({
  type,
  photos,
  canUpload,
  action,
}: {
  type: PhotoType;
  photos: TicketPhotoWithUrl[];
  canUpload: boolean;
  action: (formData: FormData) => void | Promise<void>;
}) {
  return (
    <section className="min-w-0 space-y-2 rounded-[16px] border border-white/[0.07] bg-black/20 p-2.5">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h3 className="truncate text-[11px] font-semibold uppercase tracking-wide text-orange-200">{photoTypeLabels[type]}</h3>
      </div>
      {photos.length === 0 ? (
        <div className="grid h-24 place-items-center rounded-[13px] border border-dashed border-orange-700/50 bg-black/20 text-[11px] text-zinc-500">{"Фото ще немає"}</div>
      ) : (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-1">
          {photos.map((photo) => (
            <a key={photo.id} href={photo.url ?? "#"} target="_blank" rel="noreferrer" className="group min-w-0 overflow-hidden rounded-[13px] border border-white/[0.08] bg-black/25">
              {photo.url ? <img src={photo.url} alt={photo.caption ?? photoTypeLabels[photo.type]} className="h-24 w-full object-cover transition-transform group-hover:scale-[1.02]" /> : <div className="grid h-24 place-items-center text-[11px] text-zinc-500">URL</div>}
              <div className="truncate px-2 py-1.5 text-[10px] text-zinc-500">{photo.caption ?? formatDate(photo.created_at)}</div>
            </a>
          ))}
        </div>
      )}
      {canUpload ? (
        <form action={action} className="grid gap-2">
          <input name="photos" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="w-full max-w-full text-[11px] text-zinc-500 file:mr-2 file:rounded-[10px] file:border-0 file:bg-zinc-800 file:px-2 file:py-1.5 file:text-[11px] file:text-zinc-200" />
          <PhotoSubmitButton />
        </form>
      ) : null}
    </section>
  );
}
