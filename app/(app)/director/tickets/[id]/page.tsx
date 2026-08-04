import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, MapPin, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorTicket } from "@/lib/supabase/director-queries";
import { formatDate } from "@/lib/utils";

export default async function DirectorTicketDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireApprovedDirector();
  const { id } = await params;
  const result = await getDirectorTicket(profile.id, id);
  if (!result.data) notFound();
  const ticket = result.data;
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-32 pt-4 md:px-6 md:pt-6">
      <Button asChild variant="ghost" className="h-9 rounded-2xl px-2 text-xs text-zinc-300"><Link href="/director/tickets"><ArrowLeft className="h-4 w-4" /> Назад</Link></Button>
      <section className="rounded-3xl border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.07),rgba(255,255,255,0.025))] p-5"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-orange-300">{ticket.number}</p><h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-50">{ticket.title}</h1></div><Badge tone={ticket.status === "done" ? "green" : ticket.status === "rejected" ? "red" : "orange"} className="rounded-full px-3 py-1 text-xs">{ticket.displayStatus}</Badge></div><p className="mt-3 text-sm text-zinc-400">Створено: {formatDate(ticket.created_at)}</p></section>
      <Card className="border-white/10 bg-white/[0.035]"><CardHeader><CardTitle className="text-base text-zinc-100">Деталі</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-zinc-300"><div className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /> <span>{ticket.object?.address ?? ticket.object?.name ?? "Магазин"}</span></div><div className="flex gap-2"><Tag className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /> <span>{ticket.category?.name ?? "Без категорії"}</span></div><div className="rounded-2xl border border-white/10 bg-black/20 p-3 leading-6">{ticket.description}</div><div className="text-xs text-zinc-500">Телефон: {ticket.director_phone ?? "Не вказано"}</div></CardContent></Card>
    </div>
  );
}