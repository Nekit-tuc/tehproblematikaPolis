"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

const BOTTOM_NAV_ROUTES = ["/dashboard", "/tickets", "/work-planning", "/objects"] as const;
const STORAGE_KEY = "service-desk-ai:bottom-nav-prefetched";
const prefetchedRoutes = new Set<string>();

type NavigatorWithConnection = Navigator & {
  connection?: {
    saveData?: boolean;
    effectiveType?: string;
  };
};

type WindowWithIdleCallback = Window & {
  requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (handle: number) => void;
};

function shouldSkipPrefetch() {
  const connection = (navigator as NavigatorWithConnection).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === "2g" || connection.effectiveType === "slow-2g";
}

function readSessionPrefetchedRoutes() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const routes = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(routes)) return new Set<string>();
    return new Set(routes.filter((route): route is string => typeof route === "string"));
  } catch {
    return new Set<string>();
  }
}

function saveSessionPrefetchedRoutes(routes: Set<string>) {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...routes]));
  } catch {
    // Storage can be unavailable in private or restricted browser contexts.
  }
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function BottomNavPrefetcher() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (shouldSkipPrefetch()) return;

    let cancelled = false;
    let timeoutId: number | undefined;
    let idleId: number | undefined;

    const runPrefetch = async () => {
      const sessionPrefetchedRoutes = readSessionPrefetchedRoutes();
      const routes = BOTTOM_NAV_ROUTES.filter((route) => {
        if (route === pathname) return false;
        if (prefetchedRoutes.has(route)) return false;
        return !sessionPrefetchedRoutes.has(route);
      });

      for (const route of routes) {
        if (cancelled) return;
        router.prefetch(route);
        prefetchedRoutes.add(route);
        sessionPrefetchedRoutes.add(route);
        saveSessionPrefetchedRoutes(sessionPrefetchedRoutes);
        await wait(220);
      }
    };

    const start = () => {
      void runPrefetch();
    };

    const idleWindow = window as WindowWithIdleCallback;
    if (idleWindow.requestIdleCallback) {
      idleId = idleWindow.requestIdleCallback(start, { timeout: 1800 });
    } else {
      timeoutId = window.setTimeout(start, 1400);
    }

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      if (idleId !== undefined) idleWindow.cancelIdleCallback?.(idleId);
    };
  }, [pathname, router]);

  return null;
}
