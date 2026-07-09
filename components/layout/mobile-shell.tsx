"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [drawerOpen]);

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#090909] text-stone-100 md:hidden">
      <MobileTopbar onMenuClick={() => setDrawerOpen(true)} />
      <MobileDrawer profile={profile} open={drawerOpen} onClose={() => setDrawerOpen(false)} aiTicketsCount={aiTicketsCount} />
      <main aria-hidden={drawerOpen} className={`w-full max-w-full overflow-x-hidden pb-28 ${drawerOpen ? "pointer-events-none" : ""}`}>{children}</main>
      <div aria-hidden={drawerOpen} className={drawerOpen ? "pointer-events-none" : ""}>
        <MobileBottomNav profile={profile} aiTicketsCount={aiTicketsCount} />
      </div>
    </div>
  );
}
