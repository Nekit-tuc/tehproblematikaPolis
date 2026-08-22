import { AlertTriangle, CheckCircle2, Store, XCircle } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { canConfirmTicket } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getAutoWorkPlanRoutePreview } from "@/lib/supabase/work-plans";
import { getWorkCompletionActForTicket } from "@/lib/supabase/work-completion-acts";
import { formatDate } from "@/lib/utils";
import type { Profile, TicketWithRelations } from "@/types/domain";
import { confirmDirectorTicketAction, rejectDirectorTicketAction } from "@/app/(app)/tickets/[id]/director-actions";

type DirectorTicketPanelProps = {
  ticket: TicketWithRelations;
  profile: Profile;
  returnTo: string;
};

async function getDirectorName(profileId?: string | null) {
  if (!profileId) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("full_name, phone").eq("id", profileId).maybeSingle();
  return data as { full_name?: string | null; phone?: string | null } | null;
}

function objectHref(ticket: TicketWithRelations) {
  const query = ticket.object?.object_number || ticket.object?.address || ticket.object?.name || "";
  return query ? `/objects?q=${encodeURIComponent(query)}` : "/objects";
}

function confirmationLabel(ticket: TicketWithRelations) {
  return ticket.admin_confirmed_at ? "Підтверджена" : "Очікує перевірки";
}

export async function DirectorTicketPanel({ ticket, profile, returnTo }: DirectorTicketPanelProps) {
  if (ticket.source !== "director_portal") return null;
  const [director, actResult] = await Promise.all([getDirectorName(ticket.director_profile_id), getWorkCompletionActForTicket(ticket.id)]);
  const act = actResult.data;
  const canModerate = canConfirmTicket(profile) && ticket.status === "pending_review";
  const directorPhone = ticket.director_phone || director?.phone || "Не вказано";
  const routePreview = getAutoWorkPlanRoutePreview({ categoryName: ticket.category?.name, worker: ticket.worker });

  return (
    <Card className="rounded-[22px] border-orange-400/20 bg-orange-500/[0.06] shadow-[0_12px_32px_rgba(0,0,0,0.28)]">
      <CardContent className="space-y-3 p-3.5 md:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-orange-200">
              <Store className="h-4 w-4 shrink-0" />
              Заявка від директора
            </div>
            <p className="mt-1 text-[12px] text-zinc-400">Джерело: Кабінет директора</p>
          </div>
          <Badge tone={ticket.admin_confirmed_at ? "green" : "orange"} className="shrink-0 rounded-full px-2 py-1 text-[10px]">
            {confirmationLabel(ticket)}
          </Badge>
        </div>

        {ticket.object?.needs_admin_review ? (
          <div className="rounded-[16px] border border-amber-400/25 bg-amber-500/10 p-3 text-[12px] leading-5 text-amber-100">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Об'єкт створений директором і потребує заповнення в адмін-системі.</span>
            </div>
          </div>
        ) : null}

        <div className="grid gap-2 text-[11px] md:grid-cols-2 md:text-xs">
          <Info label="Директор" value={director?.full_name ?? "Не вказано"} />
          <Info label="Телефон" value={directorPhone} />
          <Info label="Магазин" value={ticket.object?.name ?? "-"} />
          <Info label="Адреса" value={ticket.object?.address ?? "-"} />
          <Info label="Створено" value={formatDate(ticket.created_at)} />
          <Info label="Категорія" value={ticket.category?.name ?? "-"} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="h-9 rounded-[14px] px-3 text-[12px]">
            <Link href={objectHref(ticket)}>Відкрити об'єкт</Link>
          </Button>
        </div>

        {canModerate ? (
          <div className="grid gap-3 rounded-[16px] border border-white/[0.08] bg-black/20 p-3">
            <div className="space-y-1">
              <div className="text-[13px] font-semibold text-zinc-100">Підтвердження заявки</div>
              <p className="text-[12px] leading-5 text-zinc-400">
                Після підтвердження система автоматично додасть заявку в план за категорією. Перед підтвердженням перевірте категорію і за потреби змініть її у блоці дій заявки.
              </p>
            </div>

            <div className="grid gap-2 text-[11px] md:grid-cols-2 md:text-xs">
              <Info label="Категорія" value={ticket.category?.name ?? "Не вибрано"} />
              <Info label="Ручний виконавець" value={ticket.worker?.name ?? "Не призначено"} />
            </div>

            {routePreview.found ? (
              <div className="rounded-[14px] border border-emerald-400/20 bg-emerald-500/10 p-3 text-[12px] leading-5 text-emerald-100">
                Після підтвердження заявка буде додана в план: <span className="font-semibold">{routePreview.workerName} — {routePreview.planTitle}</span>.
                {routePreview.source === "manual_worker" ? <span className="mt-1 block text-emerald-100/75">Використовується ручне призначення виконавця.</span> : null}
              </div>
            ) : (
              <div className="rounded-[14px] border border-amber-400/25 bg-amber-500/10 p-3 text-[12px] leading-5 text-amber-100">
                Для цієї категорії не знайдено план або виконавця. Заявку можна підтвердити, але вона не буде автоматично додана в план.
              </div>
            )}

            <form action={confirmDirectorTicketAction.bind(null, ticket.id)}>
              <input type="hidden" name="returnTo" value={returnTo} />
              <SubmitButton type="submit" pendingText="Підтверджуємо..." className="h-11 w-full rounded-[14px] bg-orange-500 px-3 text-[12px] font-semibold text-black hover:bg-orange-400 md:text-sm">
                <CheckCircle2 className="h-4 w-4" />
                Підтвердити і додати в план
              </SubmitButton>
            </form>

            <div className="grid gap-2 md:grid-cols-2">
              <form action={confirmDirectorTicketAction.bind(null, ticket.id)} className="grid gap-1.5">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="planningMode" value="no_plan" />
                <SubmitButton type="submit" pendingText="Підтверджуємо..." variant="outline" className="h-10 w-full rounded-[14px] border-white/10 px-2 text-[11px] text-zinc-200 hover:bg-white/5 md:text-xs">
                  Підтвердити без плану
                </SubmitButton>
                <p className="text-[10px] leading-4 text-zinc-500">Використовуйте тільки для нестандартних випадків.</p>
              </form>
              <form action={rejectDirectorTicketAction.bind(null, ticket.id)} className="grid gap-1.5">
                <input type="hidden" name="returnTo" value={returnTo} />
                <input type="hidden" name="reason" value="" />
                <SubmitButton type="submit" pendingText="Відхиляємо..." variant="outline" className="h-10 w-full rounded-[14px] border-red-500/30 px-2 text-[11px] text-red-300 hover:bg-red-500/10 md:text-xs">
                  <XCircle className="h-3.5 w-3.5" />
                  Відхилити
                </SubmitButton>
              </form>
            </div>
          </div>
        ) : null}

        {!act && ticket.status === "waiting_admin_confirmation" ? (
          <div className="rounded-[16px] border border-amber-400/25 bg-amber-500/10 p-3 text-[12px] leading-5 text-amber-100">
            Очікує підтвердження виконання директором. Після підтвердження буде створено акт виконаних робіт.
          </div>
        ) : null}

        {act ? (
          <div className="rounded-[16px] border border-emerald-400/20 bg-emerald-500/10 p-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[13px] font-semibold text-emerald-100">Акт виконаних робіт</div>
                <div className="mt-1 text-[12px] text-zinc-400">{act.act_number} · {formatDate(act.confirmed_at)}</div>
              </div>
              <Button asChild variant="outline" className="h-9 rounded-[14px] px-3 text-[12px]">
                <Link href={`/tickets/${ticket.id}/act/export`}>Завантажити акт Excel</Link>
              </Button>
            </div>
            {act.director_comment ? <p className="mt-2 text-[12px] leading-5 text-zinc-300">{act.director_comment}</p> : null}
            {act.photos && act.photos.length > 0 ? <div className="mt-2 text-[11px] text-zinc-500">Фото до акту: {act.photos.length}</div> : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3 rounded-[13px] border border-white/[0.07] bg-black/20 px-3 py-2">
      <span className="shrink-0 text-zinc-500">{label}</span>
      <span className="min-w-0 break-words text-right font-medium text-zinc-200">{value}</span>
    </div>
  );
}
