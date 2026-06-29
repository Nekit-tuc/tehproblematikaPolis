import { NextResponse } from "next/server";
import { analyzeTelegramGroupMessageWithMeta } from "@/lib/ai/group-message-analyzer";
import { getOpenAiModel } from "@/lib/ai/openai-client";
import { matchStore } from "@/lib/stores/match-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
    }

    const localStoreMatch = matchStore(text);
    const result = await analyzeTelegramGroupMessageWithMeta({ text, localStoreMatch });
    return NextResponse.json({
      ok: true,
      data: result.analysis,
      localStoreMatch,
      analysis: result.analysis,
      aiMode: result.mode,
      mode: result.mode,
      openaiConfigured: result.openaiConfigured,
      model: result.model ?? getOpenAiModel(),
      fallbackReason: result.fallbackReason,
    });
  } catch (error) {
    console.error("AI classify error", error);
    return NextResponse.json({ ok: false, error: "classification failed" }, { status: 500 });
  }
}
