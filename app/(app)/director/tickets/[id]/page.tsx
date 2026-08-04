import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, CalendarCheck2, Download, FileCheck2, MapPin, Send, Tag } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { DirectorStatusBadge } from "@/components/director/director-status-badge";
import { DirectorGlassCard, DirectorPageShell } from "@/components/director/director-shell";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorTicket } from "@/lib/supabase/director-queries";
import { getWorkCompletionActForTicket } from "@/lib/supabase/work-completion-acts";
import { formatDate } from "@/lib/utils";
import { confirmDirectorWorkCompletionAction } from "./actions";

export default async function DirectorTicketDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const { profile } = await requireApprovedDirector();
  const { id } = await params;
  const query = await searchParams;
  const result = await getDirectorTicket(profile.id, id);
  if (!result.data) notFound();
  const ticket = result.data;
  const actResult = await getWorkCompletionActForTicket(ticket.id);
  const act = actResult.data;
  const canConfirmCompletion = ticket.status === "waiting_admin_confirmation" && !act;

  return (
    <DirectorPageShell className="max-w-[480px] md:max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" className="h-10 rounded-2xl px-2 text-xs text-zinc-300">
          <Link href="/director/tickets"><ArrowLeft className="h-4 w-4" /> Назад</Link>
        </Button>
        <DirectorStatusBadge label={ticket.displayStatus} tone={ticket.displayStatusInfo.tone} />
      </div>

      {query.success === "act_created" ? <Alert title="Акт створено">Виконання підтверджено, заявку переведено у статус “Виконана”.</Alert> : null}
      {query.success === "act_exists" ? <Alert title="Акт уже існує">Для цієї заявки акт виконаних робіт уже створено.</Alert> : null}
      {query.error ? <Alert title="Не вдалося виконати дію">{decodeURIComponent(query.error)}</Alert> : null}
      {actResult.error ? <Alert title="Не вдалося завантажити акт">{actResult.error}</Alert> : null}

      <DirectorGlassCard className="overflow-hidden p-4">
        <div className="absolute" />
        <p className="text-xs font-black text-orange-300">{ticket.number}</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-zinc-50">{ticket.title}</h1>
        <p className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm leading-6 text-zinc-300">{ticket.description}</p>
        <div className="mt-4 grid gap-2 text-sm text-zinc-300">
          <InfoLine icon={<MapPin className="h-4 w-4" />} label={ticket.object?.address ?? ticket.object?.name ?? "Магазин"} />
          <InfoLine icon={<Tag className="h-4 w-4" />} label={ticket.category?.name ?? "Без категорії"} />
          <InfoLine icon={<BriefcaseBusiness className="h-4 w-4" />} label={ticket.worker?.name ? `Виконавець: ${ticket.worker.name}` : "Виконавця ще не призначено"} />
        </div>
      </DirectorGlassCard>

      <DirectorGlassCard className="p-4">
        <h2 className="text-lg font-black text-zinc-50">Хронологія</h2>
        <div className="mt-3 space-y-3">
          <TimelineItem done title="Створено" value={formatDate(ticket.created_at)} />
          <TimelineItem done={Boolean(ticket.admin_confirmed_at)} title="Підтверджено адміністратором" value={formatDate(ticket.admin_confirmed_at)} />
          <TimelineItem done={Boolean(ticket.planLink)} title="Додано в план" value={ticket.planLink ? ticket.planLink.planTitle : "Очікує планування"} />
          <TimelineItem done={Boolean(ticket.sent_to_worker_at)} title="Передано виконавцю" value={formatDate(ticket.sent_to_worker_at)} />
          <TimelineItem done={Boolean(ticket.worker_completed_at || ticket.completed_at)} title="Виконано" value={formatDate(ticket.worker_completed_at ?? ticket.completed_at)} />
          <TimelineItem done={Boolean(act)} title="Акт створено" value={act?.act_number ?? "Поки немає"} />
        </div>
      </DirectorGlassCard>

      {ticket.planLink ? (
        <DirectorGlassCard className="border-orange-400/20 bg-orange-500/[0.07] p-4">
          <div className="flex items-center gap-2">
            <CalendarCheck2 className="h-5 w-5 text-orange-300" />
            <h2 className="text-lg font-black text-zinc-50">Заявка додана в план виконання</h2>
          </div>
          <p className="mt-2 text-sm text-zinc-300">{ticket.planLink.planTitle}</p>
          <p className="mt-1 text-xs text-zinc-500">Період: {formatDate(ticket.planLink.periodStart)} - {formatDate(ticket.planLink.periodEnd)}</p>
        </DirectorGlassCard>
      ) : null}

      <DirectorGlassCard className="p-4">
        <div className="flex items-center gap-2">
          <FileCheck2 className="h-5 w-5 text-orange-300" />
          <h2 className="text-lg font-black text-zinc-50">Акт виконаних робіт</h2>
        </div>

        {!canConfirmCompletion && !act ? (
          <p className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4 text-sm text-zinc-400">
            Акт буде доступний після виконання заявки виконавцем.
          </p>
        ) : null}

        {canConfirmCompletion ? (
          <form action={confirmDirectorWorkCompletionAction.bind(null, ticket.id)} className="mt-4 space-y-3 rounded-[22px] border border-orange-400/20 bg-orange-500/[0.08] p-3">
            <div className="grid gap-2 text-xs text-zinc-300">
              <Mini label="Номер заявки" value={ticket.number} />
              <Mini label="Магазин" value={ticket.object?.name ?? "Магазин"} />
              <Mini label="Адреса" value={ticket.object?.address ?? "-"} />
              <Mini label="Категорія" value={ticket.category?.name ?? "-"} />
              <Mini label="Виконавець" value={ticket.worker?.name ?? "Не вказано"} />
              <Mini label="Дата виконання" value={formatDate(ticket.worker_completed_at)} />
            </div>
            <Textarea name="directorComment" placeholder="Коментар директора до акту (необов'язково)" className="min-h-24 rounded-2xl border-white/10 bg-black/30 text-sm text-zinc-100" />
            <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">
              Фото до акту, до 5 файлів
              <input name="photos" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="w-full text-xs text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:text-zinc-100" />
            </label>
            <SubmitButton type="submit" pendingText="Створюємо акт..." className="h-12 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-orange-500 font-black text-black hover:from-amber-300 hover:to-orange-400">
              <Send className="h-4 w-4" />
              Підтвердити виконання
            </SubmitButton>
          </form>
        ) : null}

        {act ? (
          <div className="mt-4 rounded-[22px] border border-emerald-400/20 bg-emerald-500/[0.08] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-base font-black text-emerald-100">{act.act_number}</div>
                <div className="mt-1 text-xs text-zinc-400">Підтверджено: {formatDate(act.confirmed_at)}</div>
              </div>
              <Button asChild className="h-10 rounded-2xl bg-orange-500 px-3 text-xs font-black text-black hover:bg-orange-400">
                <Link href={`/director/tickets/${ticket.id}/act/export`}><Download className="h-3.5 w-3.5" /> Excel</Link>
              </Button>
            </div>
            {act.director_comment ? <p className="mt-3 text-sm leading-6 text-zinc-300">{act.director_comment}</p> : null}
            {act.photos && act.photos.length > 0 ? <p className="mt-3 text-xs text-zinc-500">Фото до акту: {act.photos.length}</p> : null}
          </div>
        ) : null}
      </DirectorGlassCard>
    </DirectorPageShell>
  );
}

function InfoLine({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
      <span className="mt-0.5 shrink-0 text-orange-300">{icon}</span>
      <span className="min-w-0 break-words">{label}</span>
    </div>
  );
}

function TimelineItem({ done, title, value }: { done: boolean; title: string; value?: string | null }) {
  return (
    <div className="grid grid-cols-[auto_1fr] gap-3">
      <span className={done ? "mt-1 h-3 w-3 rounded-full bg-orange-400 shadow-[0_0_18px_rgba(245,158,11,0.5)]" : "mt-1 h-3 w-3 rounded-full bg-zinc-700"} />
      <div>
        <div className="text-sm font-semibold text-zinc-100">{title}</div>
        <div className="mt-0.5 text-xs text-zinc-500">{value || "-"}</div>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-zinc-100">{value}</div>
    </div>
  );
}
