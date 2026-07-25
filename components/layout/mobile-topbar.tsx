"use client";

import { Menu } from "lucide-react";
import { NotificationsDrawer } from "@/components/layout/notifications-drawer";
import { Button } from "@/components/ui/button";

export function MobileTopbar({
  onMenuClick,
  notificationCount,
}: {
  onMenuClick: () => void;
  notificationCount: number;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#070707]/90 backdrop-blur-xl md:hidden">
      <div className="flex h-[62px] items-center justify-between px-3">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={onMenuClick}
          aria-label="Відкрити меню"
          className="h-9 w-9 rounded-full border-white/10 bg-white/[0.04] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          <Menu className="h-[18px] w-[18px]" />
        </Button>

        <div className="min-w-0 text-center">
          <div className="text-[15px] font-semibold leading-tight tracking-tight text-zinc-100">Polissya</div>
          <div className="mt-1 text-[8px] font-semibold uppercase tracking-[0.2em] text-orange-400">
            Service Desk AI
          </div>
        </div>

        <NotificationsDrawer count={notificationCount} />
      </div>
    </header>
  );
}
