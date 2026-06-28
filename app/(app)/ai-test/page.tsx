import { redirect } from "next/navigation";
import { AiTestClient } from "@/app/(app)/ai-test/test-client";
import { canUseAiTest } from "@/lib/auth/permissions";
import { requireAuth } from "@/lib/auth/server";

export default async function AiTestPage() {
  const { profile } = await requireAuth();
  if (!canUseAiTest(profile)) redirect("/dashboard");

  return (
    <div className="page-shell space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">AI-тест</h1>
        <p className="subtle">Ручна перевірка AI-диспетчера без створення заявок у Supabase.</p>
      </div>
      <AiTestClient />
    </div>
  );
}
