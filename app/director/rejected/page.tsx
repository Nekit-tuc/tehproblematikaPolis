import { logoutAction } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/server";

export default async function DirectorRejectedPage() {
  await requireRole(["store_director"]);
  return (
    <main className="flex min-h-dvh items-center bg-[#050505] px-4 py-8 text-zinc-100">
      <div className="mx-auto w-full max-w-md space-y-4">
        <section className="space-y-2 text-center"><p className="text-xs uppercase tracking-[0.24em] text-orange-300">Polissya Service Desk AI</p><h1 className="text-3xl font-black">Доступ відхилено</h1><p className="text-sm text-zinc-400">Адміністратор відхилив заявку на доступ. Зверніться до адміністратора для уточнення.</p></section>
        <Card className="border-white/10 bg-white/[0.04]"><CardHeader><CardTitle className="text-base text-zinc-100">Акаунт не активний</CardTitle></CardHeader><CardContent><form action={logoutAction}><Button type="submit" className="h-11 w-full rounded-2xl bg-orange-500 text-black hover:bg-orange-400">Вийти</Button></form></CardContent></Card>
      </div>
    </main>
  );
}