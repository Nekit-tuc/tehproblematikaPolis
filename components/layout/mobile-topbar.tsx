"use client";

import { Bell, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";

export function MobileTopbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090909]/85 backdrop-blur-xl md:hidden">
      <div className="flex h-16 items-center justify-between px-4">
        <Button variant="outline" size="icon" onClick={onMenuClick} aria-label="Відкрити меню" className="h-11 w-11 rounded-2xl border-white/10 bg-white/[0.03]">
          <Menu className="h-5 w-5" />
        </Button>
        <div className="text-center">
          <div className="text-sm font-semibold text-stone-100">Polissya</div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-orange-300">Service Desk AI</div>
        </div>
        <Button variant="outline" size="icon" aria-label="Сповіщення" className="h-11 w-11 rounded-2xl border-white/10 bg-white/[0.03]">
          <Bell className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
