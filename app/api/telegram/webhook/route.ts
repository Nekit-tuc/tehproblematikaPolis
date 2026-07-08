import { NextRequest, NextResponse } from "next/server";
import { getDeploymentInfo } from "@/lib/deployment-info";
import { handleTelegramUpdate } from "@/lib/telegram/bot";
import type { TelegramUpdate } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function textPreview(text: string | undefined) {
  return text ? text.slice(0, 120) : null;
}

function callbackDataPreview(data: string | undefined) {
  if (!data) return null;
  if (data.startsWith("wd:")) return { prefix: "wd", length: Buffer.byteLength(data, "utf8") };
  return { prefix: data.split(":")[0] ?? data.slice(0, 16), length: Buffer.byteLength(data, "utf8"), preview: data.slice(0, 24) };
}

function logWebhookEvent(event: string, metadata: Record<string, unknown> = {}) {
  console.info("[telegram-webhook]", event, { deployment: getDeploymentInfo(), ...metadata });
}

function allowedPrivateTestUserIds() {
  return new Set(
    (process.env.TELEGRAM_TEST_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

function resultLabel(result: { handled: boolean; created?: boolean; reason?: string }) {
  if (result.created) return "created tickets";
  if (!result.handled) return "ignored";
  if (["private_user_not_allowed", "private_or_non_group_message", "bot_message", "empty_message", "command_ignored", "not_ticket"].includes(result.reason ?? "")) return "ignored";
  return "processed";
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "telegram-webhook",
    ...getDeploymentInfo(),
  });
}

export async function POST(request: NextRequest) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const actualSecret = request.nextUrl.searchParams.get("secret")?.trim() ?? "";

  if (!expectedSecret) {
    console.error("[telegram-webhook] Telegram webhook secret is not configured", { deployment: getDeploymentInfo(), method: request.method });
    return NextResponse.json({ ok: false, error: "webhook secret is not configured" }, { status: 500 });
  }

  if (!actualSecret) {
    console.warn("[telegram-webhook] Telegram webhook secret missing", { deployment: getDeploymentInfo(), method: request.method, source: "query" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (actualSecret !== expectedSecret) {
    console.warn("[telegram-webhook] Telegram webhook secret mismatch", { deployment: getDeploymentInfo(), method: request.method, source: "query" });
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    const chatType = update.message?.chat.type ?? update.callback_query?.message?.chat.type ?? null;
    const userId = update.message?.from?.id ?? update.callback_query?.from.id ?? null;
    const allowedPrivateTestUser = chatType === "private" && userId ? allowedPrivateTestUserIds().has(String(userId)) : false;
    const updateType = update.callback_query ? "callback_query" : update.message ? "message" : "unknown";
    logWebhookEvent("received", {
      method: request.method,
      updateId: update.update_id,
      updateType,
      chatType,
      userId: userId ? String(userId) : null,
      allowedPrivateTestUser,
      callbackData: callbackDataPreview(update.callback_query?.data),
      messageTextPreview: textPreview(update.message?.text ?? update.callback_query?.message?.text),
    });
    const result = await handleTelegramUpdate(update);
    logWebhookEvent("processed", {
      method: request.method,
      updateId: update.update_id,
      updateType,
      chatType,
      userId: userId ? String(userId) : null,
      allowedPrivateTestUser,
      callbackData: callbackDataPreview(update.callback_query?.data),
      result: resultLabel(result),
      reason: "reason" in result ? result.reason : null,
      ticketCount: "ticketIds" in result ? result.ticketIds.length : 0,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[telegram-webhook] error", { deployment: getDeploymentInfo(), method: request.method, error });
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
