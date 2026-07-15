"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Send } from "lucide-react";
import { Button } from "@/components/ui/button";

type PushStatus = "checking" | "unsupported" | "default" | "granted" | "denied" | "subscribed" | "error";

function urlBase64ToUint8Array(base64String: string) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

function pushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function PushNotificationManager() {
  const [status, setStatus] = useState<PushStatus>("checking");
  const [message, setMessage] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  const statusLabel = useMemo(() => {
    if (status === "unsupported") return "Не підтримується";
    if (status === "denied") return "Заблоковано";
    if (status === "subscribed") return "Увімкнено";
    if (status === "granted") return "Дозволено";
    if (status === "error") return "Помилка";
    if (status === "checking") return "Перевірка";
    return "Вимкнено";
  }, [status]);

  useEffect(() => {
    if (!pushSupported()) {
      setStatus("unsupported");
      return;
    }

    const permission = Notification.permission;
    setStatus(permission as PushStatus);

    navigator.serviceWorker.getRegistration("/sw.js")
      .then(async (registration) => {
        const activeRegistration = registration ?? await navigator.serviceWorker.register("/sw.js");
        const subscription = await activeRegistration.pushManager.getSubscription();
        if (subscription) setStatus("subscribed");
      })
      .catch(() => setStatus(permission === "granted" ? "granted" : "default"));
  }, []);

  async function enablePush() {
    setBusy(true);
    setMessage("");
    try {
      if (!pushSupported()) {
        setStatus("unsupported");
        setMessage("Push-сповіщення не підтримуються цим браузером.");
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js");
      const permission = await Notification.requestPermission();
      if (permission === "denied") {
        setStatus("denied");
        setMessage("Сповіщення заблоковано. Увімкніть їх у налаштуваннях iPhone/браузера.");
        return;
      }
      if (permission !== "granted") {
        setStatus("default");
        setMessage("Очікується дозвіл на сповіщення.");
        return;
      }

      const keyResponse = await fetch("/api/push/vapid-public-key", { cache: "no-store" });
      const { publicKey } = await keyResponse.json();
      if (!publicKey) {
        setStatus("error");
        setMessage("VAPID public key не налаштований.");
        return;
      }

      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      const saveResponse = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription.toJSON()),
      });

      if (!saveResponse.ok) {
        const data = await saveResponse.json().catch(() => null);
        throw new Error(data?.error ?? "Не вдалося зберегти підписку.");
      }

      setStatus("subscribed");
      setMessage("Push-сповіщення увімкнено.");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Не вдалося увімкнути push.");
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    setMessage("");
    try {
      const response = await fetch("/api/push/test", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) throw new Error(data?.error ?? "Тестове сповіщення не надіслано.");
      setMessage(`Тест надіслано: ${data.sent} пристрій(їв).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не вдалося надіслати тест.");
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl border border-orange-400/15 bg-orange-500/[0.07] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-zinc-100">Push-сповіщення</div>
          <div className="text-[10px] text-zinc-400">Статус: {statusLabel}</div>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <Button type="button" size="sm" onClick={enablePush} disabled={busy || status === "unsupported"} className="h-8 rounded-xl px-2 text-[10px]">
            {busy ? "..." : "Увімкнути"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={sendTest} disabled={testing || status !== "subscribed"} className="h-8 rounded-xl px-2 text-[10px]">
            <Send className="h-3 w-3" />Тест
          </Button>
        </div>
      </div>
      <div className="mt-2 flex gap-1.5 text-[10px] leading-4 text-zinc-400">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-orange-300" />
        <span>На iPhone push працює для додатка, доданого на головний екран. Відкрийте Service Desk з іконки та дозвольте сповіщення.</span>
      </div>
      {message ? <div className="mt-2 break-words text-[10px] leading-4 text-zinc-300">{message}</div> : null}
    </div>
  );
}
