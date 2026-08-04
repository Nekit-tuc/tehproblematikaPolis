"use client";

import { useEffect, useState } from "react";
import { DirectorBottomNav } from "@/components/director/director-bottom-nav";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { MobileDrawer } from "@/components/layout/mobile-drawer";
import { MobileTopbar } from "@/components/layout/mobile-topbar";
import type { Profile } from "@/types/domain";

export function MobileShell({
  profile,
  aiTicketsCount,
  notificationCount,
}: {
  profile: Profile;
  aiTicketsCount: number;
  notificationCount: number;
}) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="contents md:hidden">
      {profile.role === "store_director" ? null : <MobileTopbar onMenuClick={() => setDrawerOpen(true)} notificationCount={notificationCount} />}
      {profile.role === "store_director" ? null : <MobileDrawer profile={profile} open={drawerOpen} onClose={() => setDrawerOpen(false)} aiTicketsCount={aiTicketsCount} />}
      <div aria-hidden={drawerOpen} className={drawerOpen ? "pointer-events-none" : ""}>
        {profile.role === "store_director" ? <DirectorBottomNav /> : <MobileBottomNav profile={profile} aiTicketsCount={aiTicketsCount} />}
      </div>
    </div>
  );
}
