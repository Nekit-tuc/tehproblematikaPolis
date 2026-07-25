"use client";

import { useEffect, useState } from "react";
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
      <MobileTopbar onMenuClick={() => setDrawerOpen(true)} notificationCount={notificationCount} />
      <MobileDrawer profile={profile} open={drawerOpen} onClose={() => setDrawerOpen(false)} aiTicketsCount={aiTicketsCount} />
      <div aria-hidden={drawerOpen} className={drawerOpen ? "pointer-events-none" : ""}>
        <MobileBottomNav profile={profile} aiTicketsCount={aiTicketsCount} />
      </div>
    </div>
  );
}
