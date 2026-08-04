import Link from "next/link";
import { ArrowLeft, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorCategories, getDirectorObjects } from "@/lib/supabase/director-queries";
import { createDirectorTicketAction } from "./actions";

export default async function NewDirectorTicketPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { profile } = await requireApprovedDirector();
  const params = await searchParams;
  const [objectsResult, categoriesResult] = await Promise.all([getDirectorObjects(profile.id), getDirectorCategories()]);
  const defaultObject = objectsResult.data[0];
  const defaultPhone = defaultObject?.phone ?? profile.phone ?? "";
  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-4 pb-32 pt-4 md:px-6 md:pt-6">
      <Button asChild variant="ghost" className="h-9 rounded-2xl px-2 text-xs text-zinc-300"><Link href="/director/tickets"><ArrowLeft className="h-4 w-4" /> Назад</Link></Button>
      <section><p className="text-xs uppercase tracking-[0.22em] text-orange-300">Нова заявка</p><h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-50 md:text-3xl">Створити заявку</h1><p className="mt-1 text-sm text-zinc-400">Заявка потрапить адміністратору на перевірку.</p></section>
      {params.error ? <Alert title="Помилка">{decodeURIComponent(params.error)}</Alert> : null}
      {objectsResult.error || categoriesResult.error ? <Alert title="Помилка">{objectsResult.error ?? categoriesResult.error}</Alert> : null}
      {objectsResult.data.length === 0 ? <Alert title="Магазини не підтверджені">Ваші магазини ще не підтверджені адміністратором.</Alert> : null}
      <Card className="border-white/10 bg-white/[0.035]"><CardHeader><CardTitle className="text-base text-zinc-100">Дані заявки</CardTitle></CardHeader><CardContent><form action={createDirectorTicketAction} className="space-y-4"><label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Магазин<select name="objectId" required defaultValue={defaultObject?.objectId ?? ""} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40"><option value="" disabled>Оберіть магазин</option>{objectsResult.data.map((item) => <option key={item.objectId} value={item.objectId}>{item.object?.name ?? "Магазин"} · {item.object?.address ?? "Адреса"}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Телефон директора<input name="phone" defaultValue={defaultPhone} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="+380..." /></label><label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Категорія<select name="categoryId" required className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40"><option value="" disabled>Оберіть категорію</option>{categoriesResult.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Опис проблеми<textarea name="description" required minLength={10} rows={6} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Опишіть, що потрібно зробити..." /></label><SubmitButton type="submit" pendingText="Створюємо..." disabled={objectsResult.data.length === 0} className="h-11 w-full rounded-2xl bg-orange-500 text-sm font-bold text-black hover:bg-orange-400"><Send className="h-4 w-4" /> Створити заявку</SubmitButton></form></CardContent></Card>
    </div>
  );
}