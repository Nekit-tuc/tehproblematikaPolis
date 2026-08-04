import Link from "next/link";
import { Store } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { loginAction } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  const envReady = hasSupabaseEnv();
  const message = params.error ? decodeURIComponent(params.error) : null;

  return (
    <main className="flex min-h-dvh items-center bg-[#050505] px-4 py-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="space-y-2 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl border border-orange-400/30 bg-orange-500/15 text-orange-300 shadow-[0_0_34px_rgba(249,115,22,0.18)]">
            <Store className="h-7 w-7" />
          </div>
          <p className="pt-2 text-xs uppercase tracking-[0.24em] text-orange-300">Полісся Продукт</p>
          <h1 className="text-3xl font-black tracking-tight">Вхід для директорів</h1>
          <p className="text-sm text-zinc-400">Створюйте заявки по магазинах та відстежуйте їх виконання.</p>
        </section>

        <Card className="border-white/10 bg-white/[0.04] shadow-2xl shadow-black/40">
          <CardHeader>
            <CardTitle className="text-base text-zinc-100">Сервіс заявок магазинів</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!envReady ? <Alert title="Supabase не підключений">Заповніть `.env.local` і перезапустіть застосунок.</Alert> : null}
            {message ? <Alert title="Помилка входу">{message}</Alert> : null}
            <form action={loginAction} className="space-y-4">
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">
                Робочий номер телефону
                <input name="phone" required className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="+380..." />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-zinc-300">
                Пароль
                <input name="password" type="password" required className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="••••••••" />
              </label>
              <SubmitButton type="submit" pendingText="Входимо..." disabled={!envReady} className="h-11 w-full rounded-2xl bg-orange-500 text-sm font-bold text-black hover:bg-orange-400">
                Увійти
              </SubmitButton>
            </form>
            <div className="rounded-2xl border border-white/10 bg-black/20 p-3 text-center">
              <p className="text-sm text-zinc-400">Ще немає акаунта?</p>
              <Link href="/director/register" className="mt-1 inline-flex text-sm font-semibold text-orange-300 hover:text-orange-200">Створити акаунт</Link>
            </div>
          </CardContent>
        </Card>

        <div className="pt-2 text-center">
          <Link href="/admin/login" className="text-xs text-zinc-500 hover:text-zinc-300">Авторизація адміністратора</Link>
          <p className="mt-1 text-[11px] text-zinc-600">Тільки для адміністратора системи</p>
        </div>
      </div>
    </main>
  );
}