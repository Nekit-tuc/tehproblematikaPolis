import { NextRequest, NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram/bot";
import type { TelegramUpdate } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textPreview(text: string | undefined) {
  return text ? text.slice(0, 120) : null;
}

function logWebhookEvent(event: string, metadata: Record<string, unknown> = {}) {
  console.info("[telegram-webhook]", event, metadata);
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const actualSecret = request.nextUrl.searchParams.get("secret")?.trim() ?? "";

  if (!expectedSecret) {
    console.error("[telegram-webhook] Telegram webhook secret is not configured", { method: request.method });
    return NextResponse.json({ ok: false, error: "webhook secret is not configured" }, { status: 500 });
  }

  if (!actualSecret) {
    console.warn("[telegram-webhook] Telegram webhook secret missing", { method: request.method, source: "query" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (actualSecret !== expectedSecret) {
    console.warn("[telegram-webhook] Telegram webhook secret mismatch", { method: request.method, source: "query" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    logWebhookEvent("received", {
      method: request.method,
      updateId: update.update_id,
      chatType: update.message?.chat.type ?? update.callback_query?.message?.chat.type ?? null,
      messageTextPreview: textPreview(update.message?.text ?? update.callback_query?.message?.text),
    });
    const result = await handleTelegramUpdate(update);
    logWebhookEvent("processed", {
      method: request.method,
      updateId: update.update_id,
      chatType: update.message?.chat.type ?? update.callback_query?.message?.chat.type ?? null,
      result: "created" in result && result.created ? "created tickets" : result.handled ? "processed" : "ignored",
      reason: "reason" in result ? result.reason : null,
      ticketCount: "ticketIds" in result ? result.ticketIds.length : 0,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram-webhook] error", { method: request.method, error });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
