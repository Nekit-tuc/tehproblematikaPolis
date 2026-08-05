"use client";

import { X } from "lucide-react";
import { useState } from "react";
import type { TicketPhotoWithUrl } from "@/types/domain";

type MobilePhotoViewerProps = {
  photos: TicketPhotoWithUrl[];
  label: string;
};

export function MobilePhotoViewer({ photos, label }: MobilePhotoViewerProps) {
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const visiblePhotos = photos.filter((photo) => photo.url);
  if (visiblePhotos.length === 0) return null;

  return (
    <>
      <section className="space-y-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-orange-200">{label}</h3>
        <div className="grid grid-cols-2 gap-2">
          {visiblePhotos.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setActiveUrl(photo.url ?? null)}
              className="aspect-[4/3] min-w-0 overflow-hidden rounded-xl border border-white/10 bg-black/30"
            >
              <img src={photo.url ?? ""} alt={photo.caption ?? label} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </section>

      {activeUrl ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/90 p-3" onClick={() => setActiveUrl(null)}>
          <button
            type="button"
            aria-label="Закрити фото"
            onClick={() => setActiveUrl(null)}
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full border border-white/15 bg-zinc-950/80 text-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={activeUrl} alt={label} className="max-h-[86vh] max-w-full rounded-2xl object-contain" onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </>
  );
}
