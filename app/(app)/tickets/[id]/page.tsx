import { BriefcaseBusiness, CalendarDays, Camera, CheckCircle2, Clock, MapPin, MessageSquare, Send, Tag, Trash2, UserX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { PhotoSubmitButton } from "@/components/tickets/photo-submit-button";
import { canAddTicketPhoto, canConfirmTicket, canEditTicket, canHardDeleteTicket, canUnassignWorkerFromTicket } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";
import { photoTypeLabels } from "@/lib/photos";
import { getRelatedTicketsBySourceGroup, getTicket, getTicketComments, getTicketHistory, getTicketPhotos } from "@/lib/supabase/queries";
import { getTicketRepeats, type TicketRepeat } from "@/lib/supabase/ticket-repeats";
import { getActiveWorkers, getWorkerById, getWorkersByCategory } from "@/lib/supabase/worker-queries";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import type { PhotoType, Profile, TicketCommentWithAuthor, TicketHistory, TicketPhotoWithUrl, TicketStatus, TicketWithRelations, Worker, WorkerWithCategories } from "@/types/domain";
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
  const [ticketResult, commentsResult, historyResult, photosResult, repeatsResult] = await Promise.all([
    getTicket(id),
    getTicketComments(id),
    getTicketHistory(id),
    getTicketPhotos(id),
    getTicketRepeats(id, 5),
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

  const error = ticketResult.error ?? commentsResult.error ?? historyResult.error ?? photosResult.error ?? repeatsResult.error ?? relatedResult.error;

  return (
    <div className="page-shell space-y-3 pb-32 md:space-y-5 md:pb-10">
      {error ? <Alert title={"\u041D\u0435 \u0432\u0434\u0430\u043B\u043E\u0441\u044F \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0438\u0442\u0438 \u0434\u0430\u043D\u0456"}>{error}</Alert> : null}
      {query.photoError ? <Alert title={"\u0424\u043E\u0442\u043E \u043D\u0435 \u0437\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043E"}>{decodeURIComponent(query.photoError)}</Alert> : null}
      {query.photoSuccess ? <Alert title={"\u0424\u043E\u0442\u043E \u0434\u043E\u0434\u0430\u043D\u043E"}>{"\u0417\u0430\u0432\u0430\u043D\u0442\u0430\u0436\u0435\u043D\u043D\u044F \u0437\u0430\u0432\u0435\u0440\u0448\u0435\u043D\u043E \u0443\u0441\u043F\u0456\u0448\u043D\u043E."}</Alert> : null}
      {query.commentError ? <Alert title={"\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440 \u043D\u0435 \u0434\u043E\u0434\u0430\u043D\u043E"}>{decodeURIComponent(query.commentError)}</Alert> : null}
      {query.commentSuccess ? <Alert title={"\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440 \u0434\u043E\u0434\u0430\u043D\u043E"}>{"\u041F\u043E\u0432\u0456\u0434\u043E\u043C\u043B\u0435\u043D\u043D\u044F \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E \u0432 \u0437\u0430\u044F\u0432\u0446\u0456."}</Alert> : null}
      {query.statusError ? <Alert title={"\u0421\u0442\u0430\u0442\u0443\u0441 \u043D\u0435 \u0437\u043C\u0456\u043D\u0435\u043D\u043E"}>{decodeURIComponent(query.statusError)}</Alert> : null}
      {query.statusSuccess ? <Alert title={"\u0421\u0442\u0430\u0442\u0443\u0441 \u043E\u043D\u043E\u0432\u043B\u0435\u043D\u043E"}>{"\u041D\u043E\u0432\u0438\u0439 \u0441\u0442\u0430\u0442\u0443\u0441 \u0437\u0430\u044F\u0432\u043A\u0438 \u0437\u0431\u0435\u0440\u0435\u0436\u0435\u043D\u043E."}</Alert> : null}

      {!ticket ? (
        <Card className="rounded-[20px] border-white/10 bg-white/[0.04]"><CardContent className="pt-5 text-sm text-muted-foreground">{"\u0417\u0430\u044F\u0432\u043A\u0443 \u043D\u0435 \u0437\u043D\u0430\u0439\u0434\u0435\u043D\u043E."}</CardContent></Card>
      ) : (
        <>
          <TicketHeroCard ticket={ticket} />
          <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-5">
            <div className="order-2 min-w-0 space-y-3 md:space-y-5 lg:order-1">
              <TicketDescriptionCard ticket={ticket} assignedWorker={assignedWorker} />
              {canConfirmTicket(profile) ? (
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
              ) : null}
              <TicketPhotosCard ticket={ticket} profile={profile} photos={photosResult.data} />
              <TicketCommentsCard ticketId={ticket.id} comments={commentsResult.data} />
            </div>
            <div className="order-1 min-w-0 space-y-3 md:space-y-5 lg:order-2">
              <TicketQuickActions ticket={ticket} profile={profile} />
              <TicketHistoryCard history={historyResult.data} />
              {relatedResult.data.length > 0 ? <RelatedTicketsCard tickets={relatedResult.data} /> : null}
              {(ticket.repeat_count ?? 0) > 0 ? <TicketRepeatsCard ticket={ticket} repeats={repeatsResult.data} /> : null}
              {canHardDeleteTicket(profile) ? <TicketDangerZone ticketId={ticket.id} /> : null}
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
          {(ticket.repeat_count ?? 0) > 0 ? <Badge tone="orange" className="shrink-0 rounded-full px-2 py-1 text-[10px]">{"\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0430 \u00B7 "}{ticket.repeat_count}</Badge> : null}
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

function TicketQuickActions({ ticket, profile }: { ticket: TicketWithRelations; profile: Profile }) {
  const canConfirm = canConfirmTicket(profile) && ticket.status === "pending_review";
  const editable = canEditTicket(profile, ticket);
  if (!canConfirm && !editable) return null;
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5">
        <SectionTitle icon={CheckCircle2} title={"\u0428\u0432\u0438\u0434\u043A\u0456 \u0434\u0456\u0457"} />
        {canConfirm ? (
          <div className="grid grid-cols-2 gap-2">
            <form action={confirmTicketAction.bind(null, ticket.id)}><Button type="submit" className="h-10 w-full rounded-[14px] bg-emerald-600 px-2 text-[11px] hover:bg-emerald-500 md:text-sm">{"\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438"}</Button></form>
            <form action={rejectTicketAction.bind(null, ticket.id)}><Button type="submit" variant="destructive" className="h-10 w-full rounded-[14px] px-2 text-[11px] md:text-sm">{"\u0412\u0456\u0434\u0445\u0438\u043B\u0438\u0442\u0438"}</Button></form>
          </div>
        ) : null}
        {editable ? (
          <form action={updateTicketStatusAction.bind(null, ticket.id)} className="grid grid-cols-2 gap-2">
            {(["new", "assigned", "in_progress", "waiting", "waiting_admin_confirmation", "done", "cancelled"] as TicketStatus[]).map((status) => (
              <Button key={status} type="submit" name="status" value={status} variant={ticket.status === status ? "default" : "outline"} className="h-10 rounded-[14px] px-2 text-[10px] md:text-xs">{statusLabels[status]}</Button>
            ))}
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
        <SectionTitle icon={MessageSquare} title={"\u041E\u043F\u0438\u0441"} />
        <p className="break-words text-[13px] leading-5 text-zinc-200 md:text-sm md:leading-6">{ticket.description}</p>
        <div className="grid gap-2 text-[11px] md:grid-cols-2 md:text-xs">
          <InlineInfo label={"\u041A\u0430\u0442\u0435\u0433\u043E\u0440\u0456\u044F"} value={ticket.category?.name ?? "-"} />
          <InlineInfo label={"\u0412\u0438\u043A\u043E\u043D\u0430\u0432\u0435\u0446\u044C"} value={workerDisplayName(assignedWorker, ticket.assignee_worker_id)} />
          <InlineInfo label={"\u041E\u0431\u2019\u0454\u043A\u0442"} value={ticket.object?.name ?? "-"} />
          <InlineInfo label={"\u0410\u0434\u0440\u0435\u0441\u0430"} value={ticketAddress(ticket)} />
          <InlineInfo label={"\u0421\u0442\u0432\u043E\u0440\u0435\u043D\u043E"} value={formatDate(ticket.created_at)} />
          <InlineInfo label={"\u041E\u043D\u043E\u0432\u043B\u0435\u043D\u043E"} value={formatDate(ticket.updated_at)} />
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
        <SectionTitle icon={Camera} title={"\u0424\u043E\u0442\u043E"} />
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
        <SectionTitle icon={MessageSquare} title={"\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456"} />
        {comments.length === 0 ? <p className="text-[12px] text-zinc-500">{"\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440\u0456\u0432 \u043F\u043E\u043A\u0438 \u043D\u0435\u043C\u0430\u0454."}</p> : comments.map((comment) => <div key={comment.id} className="rounded-[13px] border border-white/[0.07] bg-black/20 p-3 text-[12px] md:text-sm"><div className="font-medium text-zinc-200">{comment.author?.full_name ?? "\u041A\u043E\u0440\u0438\u0441\u0442\u0443\u0432\u0430\u0447"}</div><p className="mt-1 break-words text-zinc-400">{comment.body}</p></div>)}
        <form action={addTicketCommentAction.bind(null, ticketId)} className="space-y-2"><Textarea name="body" required placeholder={"\u0414\u043E\u0434\u0430\u0442\u0438 \u043A\u043E\u043C\u0435\u043D\u0442\u0430\u0440"} className="min-h-20 rounded-[14px] text-sm" /><Button type="submit" className="h-10 rounded-[14px] px-4 text-[12px]">{"\u041D\u0430\u0434\u0456\u0441\u043B\u0430\u0442\u0438"}</Button></form>
      </CardContent>
    </SoftCard>
  );
}

function TicketHistoryCard({ history }: { history: TicketHistory[] }) {
  return (
    <SoftCard>
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <SectionTitle icon={Clock} title={"\u0406\u0441\u0442\u043E\u0440\u0456\u044F"} />
        {history.length === 0 ? <p className="text-[12px] text-zinc-500">{"\u0406\u0441\u0442\u043E\u0440\u0456\u044F \u0449\u0435 \u043F\u043E\u0440\u043E\u0436\u043D\u044F."}</p> : history.slice(0, 6).map((item) => <div key={item.id} className="relative border-l border-orange-500/30 pl-3"><span className="absolute -left-[4px] top-1.5 h-2 w-2 rounded-full bg-orange-400" /><div className="break-words text-[12px] font-medium text-zinc-200 md:text-sm">{item.action}</div><div className="mt-0.5 text-[10px] text-zinc-500 md:text-xs">{item.actor?.full_name ?? "\u0421\u0438\u0441\u0442\u0435\u043C\u0430"} {"\u00B7"} {formatDate(item.created_at)}</div></div>)}
      </CardContent>
    </SoftCard>
  );
}

function RelatedTicketsCard({ tickets }: { tickets: TicketWithRelations[] }) {
  return <SoftCard><CardContent className="space-y-3 p-3.5 md:p-4"><SectionTitle title={"\u041F\u043E\u0432\u2019\u044F\u0437\u0430\u043D\u0456 \u0437\u0430\u044F\u0432\u043A\u0438"} />{tickets.map((relatedTicket) => <Link key={relatedTicket.id} href={"/tickets/" + relatedTicket.id} className="block rounded-[13px] border border-white/[0.07] bg-black/20 p-3 text-[12px] transition-colors hover:bg-white/[0.05]"><div className="font-medium text-orange-200">{relatedTicket.number}</div><div className="mt-1 line-clamp-2 break-words text-zinc-300">{relatedTicket.title}</div><div className="mt-2 flex flex-wrap gap-1.5"><Badge tone="gray" className="text-[10px]">{relatedTicket.category?.name ?? "-"}</Badge><Badge tone="orange" className="text-[10px]">{statusLabels[relatedTicket.status]}</Badge></div></Link>)}</CardContent></SoftCard>;
}

function TicketRepeatsCard({ ticket, repeats }: { ticket: TicketWithRelations; repeats: TicketRepeat[] }) {
  return <SoftCard className="border-orange-500/20 bg-orange-500/[0.05]"><CardContent className="space-y-3 p-3.5 md:p-4"><SectionTitle title={"\u041F\u043E\u0432\u0442\u043E\u0440\u043D\u0456 \u0437\u0432\u0435\u0440\u043D\u0435\u043D\u043D\u044F"} right={<Badge tone="orange" className="rounded-full text-[10px]">{ticket.repeat_count}</Badge>} />{repeats.map((repeat) => <div key={repeat.id} className="rounded-[13px] border border-white/[0.07] bg-black/20 p-3 text-[12px]"><div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-500"><span>{repeat.created_by_name ?? "Telegram"}</span><span>{formatDate(repeat.created_at)}</span></div><p className="mt-1.5 line-clamp-3 break-words text-zinc-300">{repeat.raw_text}</p></div>)}{(ticket.repeat_count ?? 0) > repeats.length ? <p className="text-[11px] text-zinc-500">{"\u041F\u043E\u043A\u0430\u0437\u0430\u043D\u043E \u043E\u0441\u0442\u0430\u043D\u043D\u0456 5 \u0437 "}{ticket.repeat_count}</p> : null}</CardContent></SoftCard>;
}

function TicketDangerZone({ ticketId }: { ticketId: string }) {
  return <details className="rounded-[20px] border border-red-500/25 bg-red-950/10 p-3.5"><summary className="cursor-pointer list-none text-[13px] font-semibold text-red-200">{"\u041D\u0435\u0431\u0435\u0437\u043F\u0435\u0447\u043D\u0430 \u0434\u0456\u044F"}</summary><div className="mt-3 space-y-3"><p className="text-[11px] leading-4 text-red-100/70">{"\u0426\u044E \u0434\u0456\u044E \u043D\u0435\u043C\u043E\u0436\u043B\u0438\u0432\u043E \u0441\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438."}</p><form action={hardDeleteTicketAction.bind(null, ticketId)}><ConfirmSubmitButton type="submit" variant="destructive" className="h-10 w-full rounded-[14px] text-[12px]" message={"\u0412\u0438 \u0442\u043E\u0447\u043D\u043E \u0445\u043E\u0447\u0435\u0442\u0435 \u043F\u043E\u0432\u043D\u0456\u0441\u0442\u044E \u0432\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u0437\u0430\u044F\u0432\u043A\u0443 \u0437 \u0431\u0430\u0437\u0438? \u0426\u044E \u0434\u0456\u044E \u043D\u0435 \u043C\u043E\u0436\u043D\u0430 \u0441\u043A\u0430\u0441\u0443\u0432\u0430\u0442\u0438."}><Trash2 className="h-4 w-4" />{"\u0412\u0438\u0434\u0430\u043B\u0438\u0442\u0438 \u0437\u0430\u044F\u0432\u043A\u0443"}</ConfirmSubmitButton></form></div></details>;
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
        <SectionTitle icon={BriefcaseBusiness} title={"\u0412\u0438\u043A\u043E\u043D\u0430\u0432\u0435\u0446\u044C"} />
        <div className="rounded-[16px] border border-white/[0.07] bg-black/20 p-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-orange-400/25 bg-orange-500/15 text-[12px] font-bold text-orange-200">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="break-words text-[14px] font-semibold text-zinc-100">{workerDisplayName(currentWorker, assignedWorkerId)}</div>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {currentWorker?.is_active !== undefined ? <Badge tone={currentWorker.is_active ? "green" : "gray"} className="rounded-full px-2 py-0.5 text-[10px]">{currentWorker.is_active ? "\u0410\u043A\u0442\u0438\u0432\u043D\u0438\u0439" : "\u041D\u0435\u0430\u043A\u0442\u0438\u0432\u043D\u0438\u0439"}</Badge> : null}
                {currentWorker?.telegram_username ? <Badge tone="gray" className="rounded-full px-2 py-0.5 text-[10px]">@{currentWorker.telegram_username}</Badge> : null}
                {currentWorker?.telegram_id ? <Badge tone="gray" className="rounded-full px-2 py-0.5 text-[10px]">Telegram ID: {currentWorker.telegram_id}</Badge> : null}
              </div>
              {categories.length > 0 ? <div className="mt-2 flex flex-wrap gap-1.5">{categories.map((category) => <Badge key={category.id} tone="orange" className="rounded-full px-2 py-0.5 text-[10px]">{category.name}</Badge>)}</div> : null}
            </div>
          </div>
          <div className="mt-3 grid gap-2 text-[11px] md:grid-cols-3">
            <InlineInfo label={"\u041F\u0440\u0438\u0437\u043D\u0430\u0447\u0435\u043D\u043E"} value={formatDate(assignedAt)} />
            <InlineInfo label={"Telegram"} value={formatDate(sentAt)} />
            <InlineInfo label={"\u0412\u0456\u0434\u043C\u0456\u0442\u043A\u0430"} value={formatDate(completedAt)} />
          </div>
        </div>

        <form action={assignWorkerAction.bind(null, ticketId)} className="grid gap-2 md:grid-cols-[1fr_auto]">
          <select name="workerId" required defaultValue={currentWorker?.id ?? recommendedWorkers[0]?.id ?? ""} className="h-10 w-full rounded-[14px] border border-white/[0.09] bg-black/25 px-3 text-[12px] text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40">
            <option value="">{"\u041E\u0431\u0435\u0440\u0456\u0442\u044C \u0432\u0438\u043A\u043E\u043D\u0430\u0432\u0446\u044F"}</option>
            {sortedWorkers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}{recommendedIds.has(worker.id) ? " ? recommended" : ""}</option>)}
          </select>
          <Button type="submit" className="h-10 rounded-[14px] px-3 text-[12px]">{"\u041F\u0440\u0438\u0437\u043D\u0430\u0447\u0438\u0442\u0438"}</Button>
        </form>

        {currentWorker ? (
          <div className="grid grid-cols-2 gap-2">
            <form action={sendTicketToWorkerAction.bind(null, ticketId)}>
              <input type="hidden" name="workerId" value={currentWorker.id} />
              <Button type="submit" variant="outline" className="h-10 w-full rounded-[14px] px-2 text-[11px]"><Send className="h-3.5 w-3.5" />Telegram</Button>
            </form>
            {canUnassign ? (
              <form action={unassignWorkerAction.bind(null, ticketId)}>
                <ConfirmSubmitButton type="submit" variant="outline" className="h-10 w-full rounded-[14px] px-2 text-[11px]" message={"\u0417\u043D\u044F\u0442\u0438 \u043F\u0440\u0438\u0437\u043D\u0430\u0447\u0435\u043D\u043E\u0433\u043E \u0432\u0438\u043A\u043E\u043D\u0430\u0432\u0446\u044F \u0437 \u0446\u0456\u0454\u0457 \u0437\u0430\u044F\u0432\u043A\u0438?"}><UserX className="h-3.5 w-3.5" />{"\u0417\u043D\u044F\u0442\u0438"}</ConfirmSubmitButton>
              </form>
            ) : null}
          </div>
        ) : null}

        {status === "waiting_admin_confirmation" ? (
          <div className="rounded-[16px] border border-orange-500/25 bg-orange-500/10 p-3">
            <p className="text-[12px] font-medium text-orange-100">{"\u0412\u0438\u043A\u043E\u043D\u0430\u0432\u0435\u0446\u044C \u043F\u043E\u0437\u043D\u0430\u0447\u0438\u0432 \u0437\u0430\u044F\u0432\u043A\u0443 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043E\u044E."}</p>
            <div className="mt-3 grid gap-3">
              <form action={confirmWorkerCompletionAction.bind(null, ticketId)} className="grid gap-2">
                <select name="rating" defaultValue="5" className="h-10 w-full rounded-[14px] border border-white/[0.09] bg-black/25 px-3 text-[12px] text-zinc-100 outline-none">{[5, 4, 3, 2, 1].map((rating) => <option key={rating} value={rating}>{rating} / 5</option>)}</select>
                <Textarea name="feedback" placeholder={"\u041A\u043E\u043C\u0435\u043D\u0442\u0430\u0440 \u0430\u0434\u043C\u0456\u043D\u0456\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0430"} className="min-h-16 rounded-[14px] text-sm" />
                <Button type="submit" className="h-10 rounded-[14px] bg-emerald-600 text-[12px] hover:bg-emerald-500">{"\u041F\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0438\u0442\u0438 \u0432\u0438\u043A\u043E\u043D\u0430\u043D\u043D\u044F"}</Button>
              </form>
              <form action={returnWorkerCompletionAction.bind(null, ticketId)} className="grid gap-2">
                <Textarea name="feedback" required placeholder={"\u0429\u043E \u043F\u043E\u0442\u0440\u0456\u0431\u043D\u043E \u0434\u043E\u0440\u043E\u0431\u0438\u0442\u0438?"} className="min-h-16 rounded-[14px] text-sm" />
                <Button type="submit" variant="outline" className="h-10 rounded-[14px] text-[12px]">{"\u041F\u043E\u0432\u0435\u0440\u043D\u0443\u0442\u0438"}</Button>
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
        <div className="grid h-24 place-items-center rounded-[13px] border border-dashed border-orange-700/50 bg-black/20 text-[11px] text-zinc-500">{"\u0424\u043E\u0442\u043E \u0449\u0435 \u043D\u0435\u043C\u0430\u0454"}</div>
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
