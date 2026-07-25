import { Sidebar } from "@/components/layout/sidebar";
import { MobileShell } from "@/components/layout/mobile-shell";
import { Topbar } from "@/components/layout/topbar";
import { requireAuth } from "@/lib/auth/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { getAttentionNotificationCount } from "@/lib/supabase/notifications";
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
  const [aiTicketsCount, attentionCountResult] = await Promise.all([
    getAiTicketsCount(profile.role),
    getAttentionNotificationCount(),
  ]);
  const notificationCount = attentionCountResult.data;

  return (
    <div className="min-h-screen bg-background md:flex">
      <MobileShell profile={profile} aiTicketsCount={aiTicketsCount} notificationCount={notificationCount} />
      <div className="hidden md:block">
        <Sidebar profile={profile} aiTicketsCount={aiTicketsCount} />
      </div>
      <main className="min-w-0 flex-1 bg-[#090909] text-stone-100 md:bg-transparent md:text-inherit">
        <div className="hidden md:block">
          <Topbar profile={profile} notificationCount={notificationCount} />
        </div>
        <div className="w-full max-w-full overflow-x-hidden pb-28 md:pb-0">{children}</div>
      </main>
    </div>
  );
}
