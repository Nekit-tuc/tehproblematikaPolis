import Link from "next/link";
import { ArrowLeft, MapPin, Send, Tag } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { DirectorGlassCard, DirectorPageShell } from "@/components/director/director-shell";
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
    <DirectorPageShell className="max-w-[480px] md:max-w-3xl">
      <div className="flex items-center justify-between gap-3">
        <Button asChild variant="ghost" className="h-10 rounded-2xl px-2 text-xs text-zinc-300">
          <Link href="/director/tickets"><ArrowLeft className="h-4 w-4" /> Назад</Link>
        </Button>
      </div>

      <DirectorGlassCard className="p-4">
        <p className="text-xs uppercase tracking-[0.22em] text-orange-300">Нова заявка</p>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-zinc-50">Створити заявку</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">Опишіть проблему коротко: що сталося і де саме. Заявка потрапить адміністратору на перевірку.</p>
      </DirectorGlassCard>

      {params.error ? <Alert title="Помилка">{decodeURIComponent(params.error)}</Alert> : null}
      {objectsResult.error || categoriesResult.error ? <Alert title="Помилка">{objectsResult.error ?? categoriesResult.error}</Alert> : null}
      {objectsResult.data.length === 0 ? <Alert title="Магазини не підтверджені">Ваші магазини ще не підтверджені адміністратором.</Alert> : null}

      <form action={createDirectorTicketAction} className="space-y-4">
        <DirectorGlassCard className="p-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-orange-300" />
            <h2 className="text-lg font-black text-zinc-50">Магазин</h2>
          </div>
          <select
            name="objectId"
            required
            defaultValue={defaultObject?.objectId ?? ""}
            className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40"
          >
            <option value="" disabled>Оберіть магазин</option>
            {objectsResult.data.map((item) => (
              <option key={item.objectId} value={item.objectId}>
                {item.object?.name ?? "Магазин"} · {item.object?.address ?? "Адреса"}
              </option>
            ))}
          </select>
          <input
            name="phone"
            defaultValue={defaultPhone}
            className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40"
            placeholder="+380..."
          />
        </DirectorGlassCard>

        <DirectorGlassCard className="p-4">
          <div className="flex items-center gap-2">
            <Tag className="h-5 w-5 text-orange-300" />
            <h2 className="text-lg font-black text-zinc-50">Категорія і опис</h2>
          </div>
          <select
            name="categoryId"
            required
            className="mt-3 h-12 w-full rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40"
          >
            <option value="" disabled>Оберіть категорію</option>
            {categoriesResult.data.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          <textarea
            name="description"
            required
            minLength={10}
            rows={7}
            className="mt-3 w-full rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm leading-6 text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40"
            placeholder="Наприклад: протікає кран у санвузлі біля складу, потрібна перевірка..."
          />
        </DirectorGlassCard>

        <div className="sticky bottom-24 z-10 rounded-[24px] border border-white/10 bg-zinc-950/82 p-2 backdrop-blur-xl md:static md:bg-transparent md:p-0">
          <SubmitButton
            type="submit"
            pendingText="Відправляємо..."
            disabled={objectsResult.data.length === 0}
            className="h-14 w-full rounded-2xl bg-gradient-to-r from-amber-300 to-orange-500 text-base font-black text-black shadow-[0_14px_34px_rgba(249,115,22,0.25)] hover:from-amber-300 hover:to-orange-400"
          >
            <Send className="h-5 w-5" />
            Відправити заявку
          </SubmitButton>
        </div>
      </form>
    </DirectorPageShell>
  );
}
