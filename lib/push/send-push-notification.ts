import webPush from "web-push";
import { createAdminClient } from "@/lib/supabase/admin";

type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

type PushSubscriptionRow = {
  id: string;
  user_id: string | null;
  endpoint: string;
  p256dh: string;
  auth: string;
  is_active: boolean;
};

type AiTicketPushInput = {
  id: string;
  title?: string | null;
  description?: string | null;
  objectName?: string | null;
};
type Relation<T> = T | T[] | null | undefined;

type WorkerCompletedPushTicket = {
  id: string;
  number?: string | null;
  title?: string | null;
  description?: string | null;
  object?: Relation<{ name?: string | null; address?: string | null }>;
  objectName?: string | null;
};

type WorkerCompletedPushWorker = {
  id: string;
  name?: string | null;
};

function pushConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!pushConfigured()) return false;
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

function safeErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message.slice(0, 240);
  if (typeof error === "object" && error && "message" in error) return String((error as { message?: unknown }).message).slice(0, 240);
  return String(error).slice(0, 240);
}

function errorStatusCode(error: unknown) {
  if (typeof error === "object" && error && "statusCode" in error) {
    const statusCode = Number((error as { statusCode?: unknown }).statusCode);
    return Number.isFinite(statusCode) ? statusCode : null;
  }
  return null;
}

function cleanText(value: string | null | undefined, fallback: string) {
  return (value ?? fallback).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim() || fallback;
}

function truncate(value: string, max = 110) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
function firstRelation<T>(value: Relation<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function ticketObjectLabel(ticket: WorkerCompletedPushTicket) {
  const object = firstRelation(ticket.object);
  return cleanText(ticket.objectName || object?.name || object?.address, "Заявка");
}

async function updatePushSuccess(subscriptionId: string) {
  const supabase = createAdminClient();
  await supabase.from("push_subscriptions").update({
    last_success_at: new Date().toISOString(),
    last_error_at: null,
    last_error: null,
    is_active: true,
    updated_at: new Date().toISOString(),
  }).eq("id", subscriptionId);
}

async function updatePushError(subscriptionId: string, error: unknown) {
  const supabase = createAdminClient();
  const statusCode = errorStatusCode(error);
  const update: Record<string, string | boolean> = {
    last_error_at: new Date().toISOString(),
    last_error: safeErrorMessage(error),
    updated_at: new Date().toISOString(),
  };
  if (statusCode === 404 || statusCode === 410) update.is_active = false;
  await supabase.from("push_subscriptions").update(update).eq("id", subscriptionId);
}

export async function sendPushToSubscription(subscription: PushSubscriptionRow, payload: PushPayload) {
  if (!configureWebPush()) {
    console.warn("[push] VAPID keys missing");
    return { ok: false, error: "VAPID keys missing" } as const;
  }

  try {
    await webPush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url ?? "/ai-tickets",
        tag: payload.tag ?? "ai-ticket",
      }),
    );
    await updatePushSuccess(subscription.id);
    return { ok: true } as const;
  } catch (error) {
    await updatePushError(subscription.id, error);
    return { ok: false, error: safeErrorMessage(error) } as const;
  }
}

async function loadSubscriptionsForRoles(roles: string[]) {
  const supabase = createAdminClient();
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .in("role", roles);

  if (profileError) {
    console.error("[push] failed to load role profiles", { error: profileError.message });
    return [] as PushSubscriptionRow[];
  }

  const userIds = (profiles ?? []).map((profile) => profile.id).filter(Boolean);
  if (userIds.length === 0) return [] as PushSubscriptionRow[];

  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth,is_active")
    .eq("is_active", true)
    .in("user_id", userIds);

  if (error) {
    console.error("[push] failed to load subscriptions", { error: error.message });
    return [] as PushSubscriptionRow[];
  }

  return (data ?? []) as PushSubscriptionRow[];
}

export async function loadSubscriptionsForUser(userId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth,is_active")
    .eq("is_active", true)
    .eq("user_id", userId);

  if (error) {
    console.error("[push] failed to load user subscriptions", { error: error.message });
    return [] as PushSubscriptionRow[];
  }

  return (data ?? []) as PushSubscriptionRow[];
}

export async function sendPushToAdmins(payload: PushPayload) {
  const subscriptions = await loadSubscriptionsForRoles(["admin", "management", "tech_manager"]);
  const results = await Promise.allSettled(subscriptions.map((subscription) => sendPushToSubscription(subscription, payload)));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;
  const failed = results.length - sent;
  return { sent, failed, total: subscriptions.length };
}

export async function sendPushToUser(userId: string, payload: PushPayload) {
  const subscriptions = await loadSubscriptionsForUser(userId);
  const results = await Promise.allSettled(subscriptions.map((subscription) => sendPushToSubscription(subscription, payload)));
  const sent = results.filter((result) => result.status === "fulfilled" && result.value.ok).length;
  const failed = results.length - sent;
  return { sent, failed, total: subscriptions.length };
}

export async function sendNewAiTicketPush(ticket: AiTicketPushInput) {
  const objectName = cleanText(ticket.objectName, "");
  const description = truncate(cleanText(ticket.description || ticket.title, "Нова заявка очікує перевірки"));
  const body = objectName ? `${objectName} — ${description}` : "Нова заявка очікує перевірки";
  return sendPushToAdmins({
    title: "Нова AI-заявка",
    body,
    url: "/ai-tickets",
    tag: "ai-ticket",
  });
}

export async function sendWorkerCompletedPush(ticket: WorkerCompletedPushTicket, worker?: WorkerCompletedPushWorker | null) {
  const ticketNumber = cleanText(ticket.number, "Заявка");
  const objectLabel = ticketObjectLabel(ticket);
  const body = truncate(`${ticketNumber} · ${objectLabel} — очікує підтвердження`, 120);

  try {
    const result = await sendPushToAdmins({
      title: "Роботу виконано",
      body,
      url: `/tickets/${ticket.id}`,
      tag: `ticket-completed-${ticket.id}`,
    });
    console.info("[push] worker completed push result", {
      ticketId: ticket.id,
      workerId: worker?.id ?? null,
      sent: result.sent,
      failed: result.failed,
      total: result.total,
    });
    return result;
  } catch (error) {
    console.error("[push] worker completed push failed", {
      ticketId: ticket.id,
      workerId: worker?.id ?? null,
      error: safeErrorMessage(error),
    });
    return { sent: 0, failed: 1, total: 0 };
  }
}

export function isPushConfigured() {
  return pushConfigured();
}
