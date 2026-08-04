import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { getDirectorRegistrationObjects } from "@/lib/supabase/director-queries";
import { registerDirectorAction } from "./actions";

export default async function DirectorRegisterPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const objectsResult = await getDirectorRegistrationObjects();
  const objects = objectsResult.data;

  return (
    <main className="min-h-dvh bg-[#050505] px-4 py-6 text-zinc-100">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <section className="space-y-2 pt-4">
          <p className="text-xs uppercase tracking-[0.24em] text-orange-300">Polissya Service Desk AI</p>
          <h1 className="text-3xl font-black tracking-tight">Реєстрація директора</h1>
          <p className="text-sm text-zinc-400">Створіть акаунт для подачі заявок по магазину. Доступ відкриється після підтвердження адміністратором.</p>
        </section>
        {params.error ? <Alert title="Помилка реєстрації">{decodeURIComponent(params.error)}</Alert> : null}
        {objectsResult.error ? <Alert title="Помилка довідника">{objectsResult.error}</Alert> : null}
        <Card className="border-white/10 bg-white/[0.04]">
          <CardHeader><CardTitle className="text-base text-zinc-100">Дані директора</CardTitle></CardHeader>
          <CardContent>
            <form action={registerDirectorAction} className="space-y-4">
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Ім'я директора<input name="fullName" required minLength={2} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Наприклад: Ірина Ковальчук" /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Робочий номер телефону<input name="phone" required className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="+380..." /></label>
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Пароль<input name="password" type="password" required minLength={6} className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Мінімум 6 символів" /></label>
              <div className="space-y-2">
                <div className="text-xs font-semibold text-zinc-300">Об'єкти / магазини</div>
                <div className="max-h-72 space-y-2 overflow-y-auto rounded-3xl border border-white/10 bg-black/20 p-2">
                  {objects.map((object) => (
                    <label key={object.id} className="flex cursor-pointer gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3 text-sm text-zinc-200">
                      <input type="checkbox" name="objectIds" value={object.id} className="mt-1 h-4 w-4 accent-orange-500" />
                      <span className="min-w-0"><span className="block font-semibold">{object.object_number ? `№ ${object.object_number} · ` : ""}{object.name}</span><span className="block truncate text-xs text-zinc-400">{object.address}</span></span>
                    </label>
                  ))}
                  {objects.length === 0 ? <p className="p-3 text-sm text-zinc-400">Активних об'єктів у списку немає. Додайте адресу нижче.</p> : null}
                </div>
              </div>
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Немає мого магазину у списку<textarea name="requestedAddresses" rows={3} className="rounded-2xl border border-white/10 bg-black/30 px-3 py-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="Введіть адресу/вулицю магазину. Кожну нову адресу з нового рядка." /></label>
              <SubmitButton type="submit" pendingText="Відправляємо..." className="h-11 w-full rounded-2xl bg-orange-500 text-sm font-bold text-black hover:bg-orange-400">Відправити на підтвердження</SubmitButton>
            </form>
          </CardContent>
        </Card>
        <p className="text-center text-sm text-zinc-500">Вже маєте акаунт? <Link href="/login" className="text-orange-300">Увійти</Link></p>
      </div>
    </main>
  );
}