import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { requireAuth } from "@/lib/auth/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAuth();

  return (
    <div className="min-h-screen bg-background">
      <div className="flex">
        <Sidebar profile={profile} />
        <main className="min-w-0 flex-1">
          <Topbar profile={profile} />
          {children}
        </main>
      </div>
    </div>
  );
}
