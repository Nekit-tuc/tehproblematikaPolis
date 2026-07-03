"use client";

import { useState } from "react";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { MobileTopbar } from "@/components/layout/mobile-topbar";
import type { Profile } from "@/types/domain";

export function MobileShell({
  profile,
  aiTicketsCount,
  children,
}: {
  profile: Profile;
  aiTicketsCount: number;
  children: React.ReactNode;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#090909] text-stone-100 md:hidden">
      <MobileTopbar onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer profile={profile} open={drawerOpen} onClose={() => setDrawerOpen(false)} aiTicketsCount={aiTicketsCount} />
      <main className="pb-28">{children}</main>
      <MobileBottomNav profile={profile} aiTicketsCount={aiTicketsCount} />
    </div>
  );
}
