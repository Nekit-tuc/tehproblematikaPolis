import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { directorLoginAction } from "./actions";

export default async function DirectorLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  return (
    <main className="flex min-h-dvh items-center bg-[#050505] px-4 py-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="space-y-2 text-center"><p className="text-xs uppercase tracking-[0.24em] text-orange-300">Polissya Service Desk AI</p><h1 className="text-3xl font-black">Вхід директора</h1><p className="text-sm text-zinc-400">Увійдіть за робочим телефоном і паролем.</p></section>
        {params.error ? <Alert title="Помилка входу">{decodeURIComponent(params.error)}</Alert> : null}
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle className="text-base text-zinc-100">Авторизація</CardTitle></CardHeader><CardContent><form action={directorLoginAction} className="space-y-4"><label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Телефон<input name="phone" required className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" placeholder="+380..." /></label><label className="grid gap-1.5 text-xs font-semibold text-zinc-300">Пароль<input name="password" type="password" required className="h-11 rounded-2xl border border-white/10 bg-black/30 px-3 text-sm text-zinc-100 outline-none focus:ring-2 focus:ring-orange-500/40" /></label><SubmitButton type="submit" pendingText="Входимо..." className="h-11 w-full rounded-2xl bg-orange-500 text-sm font-bold text-black hover:bg-orange-400">Увійти</SubmitButton></form></CardContent></Card>
        <p className="text-center text-sm text-zinc-500">Немає акаунта? <Link href="/director/register" className="text-orange-300">Зареєструватися</Link></p>
      </div>
    </main>
  );
}