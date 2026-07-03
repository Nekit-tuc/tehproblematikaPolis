import { BriefcaseBusiness, Camera, Clock, MessageSquare, Send } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { PhotoSubmitButton } from "@/components/tickets/photo-submit-button";
import { canAddTicketPhoto, canConfirmTicket, canEditTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { photoTypeLabels } from "@/lib/photos";
import { getRelatedTicketsBySourceGroup, getTicket, getTicketComments, getTicketHistory, getTicketPhotos } from "@/lib/supabase/queries";
import { getActiveWorkers, getWorkerById, getWorkersByCategory } from "@/lib/supabase/worker-queries";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { PhotoType, TicketPhotoWithUrl, TicketStatus, TicketWithRelations, Worker, WorkerWithCategories } from "@/types/domain";
import {
  addTicketCommentAction,
  assignWorkerAction,
  confirmTicketAction,
  confirmWorkerCompletionAction,
  rejectTicketAction,
  returnWorkerCompletionAction,
  sendTicketToWorkerAction,
  updateTicketStatusAction,
  uploadTicketPhotosAction,
} from "./actions";

const photoGroups: PhotoType[] = ["before", "progress", "after"];

export default async function TicketDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ photoError?: string; photoSuccess?: string; commentError?: string; commentSuccess?: string; statusError?: string; statusSuccess?: string }>;
}) {
  const { profile } = await requireAuth();
  const { id } = await params;
  const query = await searchParams;
  const [ticketResult, commentsResult, historyResult, photosResult] = await Promise.all([
    getTicket(id),
    getTicketComments(id),
    getTicketHistory(id),
    getTicketPhotos(id),
  ]);
  const ticket = ticketResult.data;
  if (!ticket && !ticketResult.error) notFound();
  let relatedResult = { data: [] as TicketWithRelations[], error: null as string | null };
  let workersResult = { data: [] as WorkerWithCategories[], error: null as string | null };
  let recommendedWorkersResult = { data: [] as WorkerWithCategories[], error: null as string | null };
  let assignedWorker: Worker | WorkerWithCategories | null = null;

  if (ticket) {
    try {
      relatedResult = ticket.telegram_source_group_id
        ? await getRelatedTicketsBySourceGroup(ticket.telegram_source_group_id, ticket.id)
        : { data: [], error: null };
    } catch (loadError) {
      console.error("[ticket-detail] load failed", { scope: "related_tickets", error: loadError });
    }

    try {
      workersResult = await getActiveWorkers();
      if (workersResult.error) console.error("[ticket-detail] load failed", { scope: "workers", error: workersResult.error });
    } catch (loadError) {
      console.error("[ticket-detail] load failed", { scope: "workers", error: loadError });
    }

    try {
      recommendedWorkersResult = ticket.category_id ? await getWorkersByCategory(ticket.category_id) : { data: [], error: null };
      if (recommendedWorkersResult.error) console.error("[ticket-detail] load failed", { scope: "recommended_workers", error: recommendedWorkersResult.error });
    } catch (loadError) {
      console.error("[ticket-detail] load failed", { scope: "recommended_workers", error: loadError });
    }

    if (ticket.assignee_worker_id) {
      try {
        const workerResult = await getWorkerById(ticket.assignee_worker_id);
        if (workerResult.error) console.error("[ticket-detail] load failed", { scope: "assigned_worker", error: workerResult.error });
        assignedWorker = workerResult.data;
      } catch (loadError) {
        console.error("[ticket-detail] load failed", { scope: "assigned_worker", error: loadError });
      }
    }
  }

  const error = ticketResult.error ?? commentsResult.error ?? historyResult.error ?? photosResult.error ?? relatedResult.error;

  return (
    <div className="page-shell space-y-6">
      {error ? <Alert title="Не вдалося завантажити всі дані заявки">{error}</Alert> : null}
      {query.photoError ? <Alert title="Фото не завантажено">{decodeURIComponent(query.photoError)}</Alert> : null}
      {query.photoSuccess ? <Alert title="Фото додано">Завантаження завершено успішно.</Alert> : null}
      {query.commentError ? <Alert title="Коментар не додано">{decodeURIComponent(query.commentError)}</Alert> : null}
      {query.commentSuccess ? <Alert title="Коментар додано">Повідомлення збережено в заявці.</Alert> : null}
      {query.statusError ? <Alert title="Статус не змінено">{decodeURIComponent(query.statusError)}</Alert> : null}
      {query.statusSuccess ? <Alert title="Статус оновлено">Новий статус заявки збережено.</Alert> : null}
      {!ticket ? (
        <Card><CardContent className="pt-5 text-sm text-muted-foreground">Заявку не знайдено.</CardContent></Card>
      ) : (
        <>
          <div className="mobile-gradient-card p-4 md:border-0 md:bg-transparent md:p-0 md:shadow-none flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-orange-300">{ticket.number}</p>
              <h1 className="mt-1 text-2xl font-semibold">{ticket.title}</h1>
              <p className="subtle">{ticket.object?.name ?? "-"} · {ticket.object?.city ?? "-"}, {ticket.object?.address ?? "-"}</p>
            </div>
            <div className="grid w-full gap-2 md:flex md:w-auto md:flex-wrap md:justify-end">
              <Badge tone="orange">{statusLabels[ticket.status]}</Badge>
              <Badge tone={ticket.priority === "critical" ? "red" : "default"}>{priorityLabels[ticket.priority]}</Badge>
              {canConfirmTicket(profile) && ticket.status === "pending_review" ? (
                <>
                  <form action={confirmTicketAction.bind(null, ticket.id)}>
                    <Button type="submit" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">Підтвердити заявку</Button>
                  </form>
                  <form action={rejectTicketAction.bind(null, ticket.id)}>
                    <Button type="submit" variant="destructive" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md">Відхилити заявку</Button>
                  </form>
                </>
              ) : null}
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
                <CardHeader><CardTitle>Опис робіт</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm leading-6 text-stone-300">{ticket.description}</p>
                  <div className="grid gap-3 md:grid-cols-3">
                    <Info label="Категорія" value={ticket.category?.name ?? "-"} />
                    <Info label="Виконавець" value={ticket.assignee?.full_name ?? "Не призначено"} />
                    <Info label="Термін" value={formatDate(ticket.due_at)} />
                  </div>
                </CardContent>
              </Card>
              {canEditTicket(profile, ticket) ? (
                <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
                  <CardHeader>
                    <CardTitle>Керування статусом</CardTitle>
                    <CardDescription>Швидка зміна етапу виконання заявки.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form action={updateTicketStatusAction.bind(null, ticket.id)} className="grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                      {(["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled"] as TicketStatus[]).map((status) => (
                        <Button key={status} type="submit" name="status" value={status} variant={ticket.status === status ? "default" : "outline"} className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
                          {statusLabels[status]}
                        </Button>
                      ))}
                    </form>
                  </CardContent>
                </Card>
              ) : null}
              {canConfirmTicket(profile) ? (
                <WorkerAssignmentCard
                  ticketId={ticket.id}
                  currentWorker={assignedWorker}
                  workers={workersResult.data}
                  recommendedWorkers={recommendedWorkersResult.data}
                  status={ticket.status}
                  assignedAt={ticket.assigned_at}
                  sentAt={ticket.sent_to_worker_at}
                  completedAt={ticket.worker_completed_at}
                />
              ) : null}
              {relatedResult.data.length > 0 ? (
                <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
                  <CardHeader>
                    <CardTitle>Пов'язані заявки з цього повідомлення</CardTitle>
                    <CardDescription>Ці заявки створені з того самого повідомлення Telegram-групи.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {relatedResult.data.map((relatedTicket) => (
                      <Link
                        key={relatedTicket.id}
                        href={`/tickets/${relatedTicket.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-stone-950/30 p-3 text-sm transition-colors hover:bg-stone-900/70"
                      >
                        <div>
                          <div className="font-medium text-orange-200">{relatedTicket.number} · {relatedTicket.title}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{relatedTicket.category?.name ?? "Без категорії"}</div>
                        </div>
                        <Badge tone={relatedTicket.status === "done" ? "green" : relatedTicket.status === "rejected" ? "red" : "orange"}>{statusLabels[relatedTicket.status]}</Badge>
                      </Link>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
              <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Camera className="h-4 w-4" />Фото заявки</CardTitle>
                  <CardDescription>Фото зберігаються в приватному Supabase Storage bucket `ticket-photos`.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {photoGroups.map((type) => (
                    <PhotoGroup
                      key={type}
                      type={type}
                      photos={photosResult.data.filter((photo) => photo.type === type)}
                      canUpload={canAddTicketPhoto(profile, ticket, type)}
                      action={uploadTicketPhotosAction.bind(null, ticket.id, type)}
                    />
                  ))}
                </CardContent>
              </Card>
              <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
                <CardHeader><CardTitle className="flex items-center gap-2"><MessageSquare className="h-4 w-4" />Коментарі</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  {commentsResult.data.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Коментарів поки немає.</p>
                  ) : commentsResult.data.map((comment) => (
                    <div key={comment.id} className="rounded-lg border border-border bg-stone-950/30 p-4 text-sm">
                      <div className="font-medium">{comment.author?.full_name ?? "Користувач"}</div>
                      <p className="mt-1 text-muted-foreground">{comment.body}</p>
                    </div>
                  ))}
                  <form action={addTicketCommentAction.bind(null, ticket.id)} className="space-y-3">
                    <Textarea name="body" required placeholder="Додати коментар для команди" />
                    <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Надіслати</Button>
                  </form>
                </CardContent>
              </Card>
            </div>
            <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-4 w-4" />Історія дій</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {historyResult.data.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Історія ще порожня.</p>
                ) : historyResult.data.map((item) => (
                  <div key={item.id} className="border-l border-orange-800 pl-4">
                    <div className="text-sm font-medium">{item.action}</div>
                    <div className="text-xs text-muted-foreground">{item.actor?.full_name ?? "Система"} · {formatDate(item.created_at)}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border bg-stone-950/30 p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="mt-1 text-sm font-medium">{value}</div></div>;
}

function WorkerAssignmentCard({
  ticketId,
  currentWorker,
  workers,
  recommendedWorkers,
  status,
  assignedAt,
  sentAt,
  completedAt,
}: {
  ticketId: string;
  currentWorker: Worker | WorkerWithCategories | null;
  workers: WorkerWithCategories[];
  recommendedWorkers: WorkerWithCategories[];
  status: TicketStatus;
  assignedAt?: string | null;
  sentAt?: string | null;
  completedAt?: string | null;
}) {
  const recommendedIds = new Set(recommendedWorkers.map((worker) => worker.id));
  const sortedWorkers = [
    ...recommendedWorkers,
    ...workers.filter((worker) => !recommendedIds.has(worker.id)),
  ];

  return (
    <Card className="rounded-3xl border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-4 w-4" />Виконавець</CardTitle>
        <CardDescription>Призначення майстра, надсилання заявки в Telegram і підтвердження виконання.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          <Info label="Поточний виконавець" value={currentWorker?.name ?? "Не призначено"} />
          <Info label="Призначено" value={formatDate(assignedAt)} />
          <Info label="Надіслано в Telegram" value={formatDate(sentAt)} />
        </div>

        <form action={assignWorkerAction.bind(null, ticketId)} className="grid gap-3 md:grid-cols-[1fr_auto]">
          <select
            name="workerId"
            required
            defaultValue={currentWorker?.id ?? recommendedWorkers[0]?.id ?? ""}
            className="h-11 w-full rounded-2xl border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:h-10 md:rounded-md"
          >
            <option value="">Оберіть виконавця</option>
            {sortedWorkers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}{recommendedIds.has(worker.id) ? " · рекомендовано" : ""}
              </option>
            ))}
          </select>
          <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Призначити</Button>
        </form>

        {currentWorker ? (
          <form action={sendTicketToWorkerAction.bind(null, ticketId)}>
            <input type="hidden" name="workerId" value={currentWorker.id} />
            <Button type="submit" variant="outline" className="min-h-11 w-full rounded-2xl md:min-h-0 md:w-auto md:rounded-md"><Send className="h-4 w-4" />Надіслати в Telegram</Button>
          </form>
        ) : null}

        {status === "waiting_admin_confirmation" ? (
          <div className="rounded-lg border border-orange-800/60 bg-orange-950/20 p-4">
            <p className="text-sm font-medium text-orange-100">Виконавець позначив заявку виконаною.</p>
            <p className="mt-1 text-xs text-muted-foreground">Час відмітки: {formatDate(completedAt)}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <form action={confirmWorkerCompletionAction.bind(null, ticketId)} className="space-y-3">
                <select name="rating" defaultValue="5" className="h-11 w-full rounded-2xl border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring md:h-10 md:rounded-md">
                  {[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}
                </select>
                <Textarea name="feedback" placeholder="Коментар адміністратора, якщо потрібно" />
                <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Підтвердити виконання</Button>
              </form>
              <form action={returnWorkerCompletionAction.bind(null, ticketId)} className="space-y-3">
                <Textarea name="feedback" required placeholder="Що потрібно доробити?" />
                <Button type="submit" variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Повернути виконавцю</Button>
              </form>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
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
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase text-orange-200">{photoTypeLabels[type]}</h3>
        {canUpload ? (
          <form action={action} className="flex flex-wrap items-center gap-2">
            <input
              name="photos"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              multiple
              className="max-w-72 text-sm text-muted-foreground file:mr-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-sm file:text-secondary-foreground"
            />
            <PhotoSubmitButton />
          </form>
        ) : null}
      </div>
      {photos.length === 0 ? (
        <div className="grid aspect-video place-items-center rounded-lg border border-dashed border-orange-800/70 bg-stone-950/40 text-sm text-muted-foreground">Фото ще немає</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {photos.map((photo) => (
            <a key={photo.id} href={photo.url ?? "#"} target="_blank" rel="noreferrer" className="group overflow-hidden rounded-lg border border-border bg-stone-950/40">
              {photo.url ? (
                <img src={photo.url} alt={photo.caption ?? photoTypeLabels[photo.type]} className="aspect-video w-full object-cover transition-transform group-hover:scale-[1.02]" />
              ) : (
                <div className="grid aspect-video place-items-center text-sm text-muted-foreground">URL недоступний</div>
              )}
              <div className="p-2 text-xs text-muted-foreground">{photo.caption ?? formatDate(photo.created_at)}</div>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
