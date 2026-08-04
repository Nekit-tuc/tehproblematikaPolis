import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BriefcaseBusiness, ClipboardList, Download, FileCheck2, MapPin, Tag } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireApprovedDirector } from "@/lib/auth/server";
import { directorStatusToneForBadge } from "@/lib/director/director-ticket-status";
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
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-32 pt-4 md:px-6 md:pt-6">
      <Button asChild variant="ghost" className="h-9 rounded-2xl px-2 text-xs text-zinc-300">
        <Link href="/director/tickets"><ArrowLeft className="h-4 w-4" /> Назад</Link>
      </Button>

      {query.success === "act_created" ? <Alert title="Акт створено">Виконання підтверджено, заявку переведено у статус "Виконана".</Alert> : null}
      {query.success === "act_exists" ? <Alert title="Акт уже існує">Для цієї заявки акт виконаних робіт уже створено.</Alert> : null}
      {query.error ? <Alert title="Не вдалося виконати дію">{decodeURIComponent(query.error)}</Alert> : null}
      {actResult.error ? <Alert title="Не вдалося завантажити акт">{actResult.error}</Alert> : null}

      <section className="rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-orange-300">{ticket.number}</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-50">{ticket.title}</h1>
          </div>
          <Badge tone={directorStatusToneForBadge(ticket.displayStatusInfo.tone)} className="rounded-full px-3 py-1 text-xs">
            {ticket.displayStatus}
          </Badge>
        </div>
        <p className="mt-3 text-sm text-zinc-400">Створено: {formatDate(ticket.created_at)}</p>
      </section>

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader>
          <CardTitle className="text-base text-zinc-100">Деталі заявки</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-zinc-300">
          <div className="flex gap-2">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
            <span>{ticket.object?.address ?? ticket.object?.name ?? "Магазин"}</span>
          </div>
          <div className="flex gap-2">
            <Tag className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
            <span>{ticket.category?.name ?? "Без категорії"}</span>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/20 p-3 leading-6">{ticket.description}</div>
          <div className="text-xs text-zinc-500">Телефон: {ticket.director_phone ?? "Не вказано"}</div>
        </CardContent>
      </Card>

      {ticket.planLink ? (
        <Card className="border-orange-400/20 bg-orange-500/[0.06]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
              <ClipboardList className="h-4 w-4 text-orange-300" />
              Заявка додана в план виконання
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-zinc-300">
            <div>{ticket.planLink.planTitle}</div>
            <div className="text-xs text-zinc-500">Період: {formatDate(ticket.planLink.periodStart)} - {formatDate(ticket.planLink.periodEnd)}</div>
          </CardContent>
        </Card>
      ) : null}

      {ticket.sent_to_worker_at ? (
        <Card className="border-white/10 bg-white/[0.035]">
          <CardContent className="flex items-start gap-2 p-4 text-sm text-zinc-300">
            <BriefcaseBusiness className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" />
            <div>
              <div className="font-semibold text-zinc-100">Передана виконавцю</div>
              <div className="mt-1 text-xs text-zinc-500">{formatDate(ticket.sent_to_worker_at)}</div>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <FileCheck2 className="h-4 w-4 text-orange-300" />
            Акт виконаних робіт
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {!canConfirmCompletion && !act ? (
            <p className="text-sm text-zinc-400">Акт буде доступний після виконання заявки виконавцем.</p>
          ) : null}

          {canConfirmCompletion ? (
            <form action={confirmDirectorWorkCompletionAction.bind(null, ticket.id)} className="space-y-3 rounded-2xl border border-orange-400/20 bg-orange-500/[0.06] p-3">
              <div className="grid gap-2 text-xs text-zinc-300 md:grid-cols-2">
                <Info label="Номер заявки" value={ticket.number} />
                <Info label="Магазин" value={ticket.object?.name ?? "Магазин"} />
                <Info label="Адреса" value={ticket.object?.address ?? "-"} />
                <Info label="Категорія" value={ticket.category?.name ?? "-"} />
                <Info label="Виконавець" value={ticket.worker?.name ?? "Не вказано"} />
                <Info label="Дата виконання" value={formatDate(ticket.worker_completed_at)} />
              </div>
              <Textarea name="directorComment" placeholder="Коментар директора до акту (необов'язково)" className="min-h-24 rounded-2xl text-sm" />
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-300">Фото до акту, до 5 файлів</label>
                <input name="photos" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple className="w-full text-xs text-zinc-400 file:mr-3 file:rounded-xl file:border-0 file:bg-zinc-800 file:px-3 file:py-2 file:text-xs file:text-zinc-100" />
              </div>
              <SubmitButton type="submit" pendingText="Створюємо акт..." className="h-11 w-full rounded-2xl bg-orange-500 font-bold text-black hover:bg-orange-400">
                Підтвердити виконання
              </SubmitButton>
            </form>
          ) : null}

          {act ? (
            <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.08] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-emerald-100">{act.act_number}</div>
                  <div className="mt-1 text-xs text-zinc-400">Підтверджено: {formatDate(act.confirmed_at)}</div>
                </div>
                <Button asChild className="h-9 rounded-2xl bg-orange-500 px-3 text-xs font-bold text-black hover:bg-orange-400">
                  <Link href={`/director/tickets/${ticket.id}/act/export`}><Download className="h-3.5 w-3.5" /> Акт Excel</Link>
                </Button>
              </div>
              {act.director_comment ? <p className="text-sm leading-6 text-zinc-300">{act.director_comment}</p> : null}
              {act.photos && act.photos.length > 0 ? <p className="text-xs text-zinc-500">Фото до акту: {act.photos.length}</p> : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{label}</div>
      <div className="mt-1 break-words text-zinc-100">{value}</div>
    </div>
  );
}
