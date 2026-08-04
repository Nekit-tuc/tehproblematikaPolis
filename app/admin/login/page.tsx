import Link from "next/link";
import { Wrench } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { adminLoginAction } from "./actions";

const errorMessages: Record<string, string> = {
  "supabase-env": "Supabase credentials не налаштовані. Заповніть .env.local і перезапустіть dev server.",
  validation: "Введіть email і пароль.",
  credentials: "Невірний email або пароль.",
  profile: "Користувач увійшов, але активний profile для нього не знайдено.",
  "admin-login-required": "Для адміністратора використовуйте окрему авторизацію.",
};

export default async function AdminLoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const envReady = hasSupabaseEnv();
  const message = error ? errorMessages[error] ?? decodeURIComponent(error) : null;

  return (
    <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top_left,rgba(209,134,59,.2),transparent_32%),#171717] px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wrench className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Авторизація адміністратора</CardTitle>
          <CardDescription>Вхід тільки для адміністратора системи.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!envReady ? <Alert title="Supabase не підключений">Заповніть `.env.local` і перезапустіть застосунок.</Alert> : null}
          {message ? <Alert title="Помилка входу">{message}</Alert> : null}
          <form action={adminLoginAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" autoComplete="email" placeholder="admin@polissya.local" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Пароль</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" placeholder="••••••••" required />
            </div>
            <Button className="w-full" disabled={!envReady}>Увійти</Button>
          </form>
          <div className="text-center">
            <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground">Вхід для директора</Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}