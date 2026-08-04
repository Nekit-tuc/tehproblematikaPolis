import Link from "next/link";
import { ClipboardList, MapPin, Plus, Store, Tag } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApprovedDirector } from "@/lib/auth/server";
import { directorStatusToneForBadge } from "@/lib/director/director-ticket-status";
import { getDirectorObjects, getDirectorTickets } from "@/lib/supabase/director-queries";
import { formatDate } from "@/lib/utils";

export default async function DirectorTicketsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { profile } = await requireApprovedDirector();
  const params = await searchParams;
  const [objectsResult, ticketsResult] = await Promise.all([getDirectorObjects(profile.id), getDirectorTickets(profile.id)]);
  const tickets = ticketsResult.data;
  const error = objectsResult.error ?? ticketsResult.error;
  const hasObjects = objectsResult.data.length > 0;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 px-4 pb-32 pt-4 md:px-6 md:pt-6">
      <section className="space-y-2">
        <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Кабінет директора</p>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-zinc-50 md:text-3xl">Мої заявки</h1>
            <p className="mt-1 text-sm text-zinc-400">Заявки по магазинах, прив'язаних до вашого профілю.</p>
          </div>
          <Button asChild disabled={!hasObjects} className="h-10 shrink-0 rounded-2xl bg-orange-500 px-3 text-xs font-bold text-black hover:bg-orange-400">
            <Link href="/director/tickets/new"><Plus className="h-4 w-4" /> Нова</Link>
          </Button>
        </div>
      </section>

      {params.success === "created" ? <Alert title="Заявку створено">Заявку передано адміністратору на перевірку.</Alert> : null}
      {error ? <Alert title="Помилка">{error}</Alert> : null}
      {!hasObjects ? <Alert title="Магазини ще не підтверджені">Ваші магазини ще не підтверджені адміністратором.</Alert> : null}

      <Card className="border-white/10 bg-white/[0.035]">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base text-zinc-100">
            <Store className="h-4 w-4 text-orange-300" />
            Ваші магазини
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          {objectsResult.data.length === 0 ? <p className="text-sm text-zinc-400">До вашого профілю ще не прив'язано підтверджені магазини.</p> : null}
          {objectsResult.data.map((item) => (
            <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-semibold text-zinc-100">{item.object?.name ?? "Магазин"}</div>
              <div className="mt-1 flex items-start gap-2 text-xs text-zinc-400">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-orange-300" />
                {item.object?.address ?? "Адресу не вказано"}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-zinc-50">Заявки</h2>
          <Badge tone="orange" className="rounded-full px-3 py-1 text-xs">{tickets.length} заявок</Badge>
        </div>
        {tickets.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 text-sm text-zinc-400">
            Заявок поки немає. Створіть першу заявку через кнопку "Нова".
          </div>
        ) : null}
        <div className="grid gap-3">
          {tickets.map((ticket) => (
            <Link key={ticket.id} href={`/director/tickets/${ticket.id}`} className="block rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-4 transition active:scale-[0.99]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs font-bold text-orange-300">{ticket.number}</div>
                  <h3 className="mt-1 line-clamp-2 text-base font-bold text-zinc-50">{ticket.title}</h3>
                </div>
                <Badge tone={directorStatusToneForBadge(ticket.displayStatusInfo.tone)} className="shrink-0 rounded-full px-2 py-1 text-[10px]">
                  {ticket.displayStatus}
                </Badge>
              </div>
              <div className="mt-3 grid gap-1.5 text-xs text-zinc-400">
                <span className="flex min-w-0 items-center gap-2">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-orange-300" />
                  <span className="truncate">{ticket.object?.address ?? ticket.object?.name ?? "Магазин"}</span>
                </span>
                <span className="flex min-w-0 items-center gap-2">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-orange-300" />
                  <span className="truncate">{ticket.category?.name ?? "Без категорії"}</span>
                </span>
                {ticket.planLink ? (
                  <span className="flex min-w-0 items-center gap-2 text-orange-200">
                    <ClipboardList className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Додана в план: {ticket.planLink.planTitle}</span>
                  </span>
                ) : null}
                <span className="text-zinc-500">Створено: {formatDate(ticket.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
