import { redirect } from "next/navigation";
import { logoutAction } from "@/app/login/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/server";
import { getDirectorPendingOverview } from "@/lib/supabase/director-queries";

export default async function DirectorPendingPage() {
  const { profile } = await requireRole(["store_director"]);
  if ((profile.approval_status ?? "approved") === "approved") redirect("/director/tickets");
  if (profile.approval_status === "rejected") redirect("/director/rejected");
  const result = await getDirectorPendingOverview(profile.id);
  const data = result.data;
  return (
    <main className="min-h-dvh bg-[#050505] px-4 py-6 text-zinc-100">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <section className="space-y-2 pt-4"><p className="text-xs uppercase tracking-[0.24em] text-orange-300">Polissya Service Desk AI</p><h1 className="text-3xl font-black tracking-tight">Очікує підтвердження</h1><p className="text-sm text-zinc-400">Ваш акаунт очікує підтвердження адміністратора. Після підтвердження ви зможете створювати заявки по своїх магазинах.</p></section>
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle className="text-base text-zinc-100">Ваш профіль</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-zinc-300"><div>Ім'я: {data?.profile?.full_name ?? profile.full_name}</div><div>Телефон: {data?.profile?.phone ?? profile.phone ?? "Не вказано"}</div><Badge tone="orange">Очікує підтвердження</Badge></CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle className="text-base text-zinc-100">Вибрані магазини</CardTitle></CardHeader><CardContent className="space-y-2">{data?.objects.length ? data.objects.map((item) => <div key={item.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"><div className="font-semibold text-zinc-100">{item.object?.name ?? "Магазин"}</div><div className="text-xs text-zinc-400">{item.object?.address ?? "Адресу не вказано"}</div><Badge tone={item.approvalStatus === "approved" ? "green" : item.approvalStatus === "rejected" ? "red" : "orange"} className="mt-2">{item.approvalStatus === "approved" ? "Підтверджено" : item.approvalStatus === "rejected" ? "Відхилено" : "Очікує"}</Badge></div>) : <p className="text-sm text-zinc-400">Вибраних магазинів немає.</p>}</CardContent></Card>
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle className="text-base text-zinc-100">Запити на нові адреси</CardTitle></CardHeader><CardContent className="space-y-2">{data?.requests.length ? data.requests.map((request) => <div key={request.id} className="rounded-2xl border border-white/10 bg-black/20 p-3 text-sm"><div className="font-semibold text-zinc-100">{request.requested_address}</div><Badge tone={request.status === "approved" ? "green" : request.status === "rejected" ? "red" : "orange"} className="mt-2">{request.status === "approved" ? "Підтверджено" : request.status === "rejected" ? "Відхилено" : "Очікує"}</Badge>{request.admin_note ? <p className="mt-2 text-xs text-zinc-400">{request.admin_note}</p> : null}</div>) : <p className="text-sm text-zinc-400">Запитів на нові адреси немає.</p>}</CardContent></Card>
        <form action={logoutAction}><Button type="submit" variant="outline" className="h-11 w-full rounded-2xl">Вийти</Button></form>
      </div>
    </main>
  );
}