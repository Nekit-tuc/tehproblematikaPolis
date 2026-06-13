import { NextResponse } from "next/server";
import { handleTelegramUpdate } from "@/lib/telegram/bot";
import type { TelegramUpdate } from "@/lib/telegram/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const actualSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (!expectedSecret || actualSecret !== expectedSecret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    const update = (await request.json()) as TelegramUpdate;
    await handleTelegramUpdate(update);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook error", error);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
