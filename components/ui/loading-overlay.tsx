"use client";

import { Loader2 } from "lucide-react";

export function LoadingOverlay({ text = "Зачекайте" }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/35 px-4 backdrop-blur-[2px]">
      <div className="flex max-w-[260px] items-center gap-3 rounded-2xl border border-white/10 bg-stone-950/95 px-4 py-3 text-sm font-medium text-stone-100 shadow-2xl">
        <Loader2 className="h-5 w-5 animate-spin text-orange-300" />
        <span className="break-words">{text}</span>
      </div>
    </div>
  );
}
