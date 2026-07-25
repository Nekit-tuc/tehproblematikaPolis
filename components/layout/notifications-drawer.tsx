"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, Bell, Bot, CheckCircle, ClipboardPlus, Send, Trash2, X } from "lucide-react";
import { PushNotificationManager } from "@/components/push/push-notification-manager";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import type { AppNotification } from "@/lib/supabase/notifications";

function iconFor(type: AppNotification["type"]) {
  if (type === "ai") return Bot;
  if (type === "worker_done") return CheckCircle;
  if (type === "plan") return Send;
  if (type === "plan_error") return AlertTriangle;
  if (type === "delete") return Trash2;
  return ClipboardPlus;
}

export function NotificationsDrawer({ notifications: initialNotifications = [], count = 0 }: { notifications?: AppNotification[]; count?: number }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || notifications.length > 0) return;
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    fetch("/api/notifications", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("notifications_fetch_failed");
        return response.json() as Promise<{ notifications?: AppNotification[]; error?: string }>;
      })
      .then((payload) => {
        if (cancelled) return;
        setNotifications(payload.notifications ?? []);
        setLoadError(payload.error ?? null);
      })
      .catch(() => {
        if (!cancelled) setLoadError("Не вдалося завантажити сповіщення");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, notifications.length]);

  const overlay = (
    <>
      <button
        type="button"
        aria-label="Закрити сповіщення"
        onClick={() => setOpen(false)}
        className={cn(
          "fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm transition-opacity duration-200",
          open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
        )}
      />
      <aside
        aria-hidden={!open}
        className={cn(
          "fixed bottom-0 right-0 top-0 z-[120] flex w-[88vw] max-w-[360px] flex-col overflow-hidden border-l border-white/[0.10] bg-[#080808]/95 shadow-2xl shadow-black/60 backdrop-blur-xl transition-transform duration-200 ease-out md:w-[380px] md:max-w-[380px]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-zinc-100">Сповіщення</div>
            <div className="text-[10px] text-zinc-500">{notifications.length} останніх подій</div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setOpen(false)}
            aria-label="Закрити"
            className="h-9 w-9 rounded-xl border-white/10 bg-white/[0.03] text-zinc-100"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overscroll-contain overflow-y-auto p-3 pb-6">
          <div className="space-y-2">
            <PushNotificationManager />
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-center text-[12px] text-zinc-400">
                Завантажуємо сповіщення...
              </div>
            ) : loadError ? (
              <div className="rounded-2xl border border-red-400/20 bg-red-500/10 p-4 text-center text-[12px] text-red-200">
                {loadError}
              </div>
            ) : notifications.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.03] p-4 text-center text-[12px] text-zinc-400">
                Нових сповіщень немає
              </div>
            ) : (
              notifications.map((item) => {
                const Icon = iconFor(item.type);
                const content = (
                  <div className="flex min-w-0 gap-2.5 rounded-2xl border border-white/10 bg-white/[0.035] p-2.5 active:bg-white/[0.06]">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-orange-400/20 bg-orange-500/12 text-orange-300">
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1 break-words text-[12px] font-semibold leading-4 text-zinc-100">{item.title}</div>
                        {item.important ? <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-orange-500" /> : null}
                      </div>
                      <div className="mt-0.5 line-clamp-2 break-words text-[10px] leading-4 text-zinc-400">{item.description}</div>
                      <div className="mt-1 text-[9px] text-zinc-500">{formatDate(item.created_at)}</div>
                    </div>
                  </div>
                );

                return item.href ? (
                  <Link key={item.id} href={item.href} onClick={() => setOpen(false)}>
                    {content}
                  </Link>
                ) : (
                  <div key={item.id}>{content}</div>
                );
              })
            )}
          </div>
        </div>
      </aside>
    </>
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="icon"
        aria-label="Сповіщення"
        onClick={() => setOpen(true)}
        className="relative h-9 w-9 rounded-full border-white/10 bg-white/[0.04] text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:h-10 md:w-10 md:rounded-md"
      >
        <Bell className="h-[18px] w-[18px] md:h-4 md:w-4" />
        {count > 0 ? (
          <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-stone-950 shadow-[0_0_16px_rgba(249,115,22,0.65)]">
            {count > 9 ? "9+" : count}
          </span>
        ) : (
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-orange-500 shadow-[0_0_16px_rgba(249,115,22,0.85)]" />
        )}
      </Button>

      {mounted ? createPortal(overlay, document.body) : null}
    </>
  );
}
