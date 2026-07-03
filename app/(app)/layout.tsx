import { Sidebar } from "@/components/layout/sidebar";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Topbar } from "@/components/layout/topbar";
import { requireAuth } from "@/lib/auth/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

async function getAiTicketsCount(role: string) {
  if (!["admin", "management", "tech_manager"].includes(role) || !hasSupabaseEnv()) return 0;
  const supabase = await createClient();
  const { count } = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review")
    .in("source", ["telegram_group", "telegram_private_test"]);
  return count ?? 0;
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAuth();
  const aiTicketsCount = await getAiTicketsCount(profile.role);

  return (
    <div className="min-h-screen bg-background">
      <MobileShell profile={profile} aiTicketsCount={aiTicketsCount}>
        {children}
      </MobileShell>
      <div className="hidden md:flex">
        <Sidebar profile={profile} aiTicketsCount={aiTicketsCount} />
        <main className="min-w-0 flex-1">
          <Topbar profile={profile} />
          {children}
        </main>
      </div>
    </div>
  );
}
