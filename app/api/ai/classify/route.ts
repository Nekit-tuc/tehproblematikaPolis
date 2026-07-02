import { NextResponse } from "next/server";
import { analyzeTelegramGroupMessageWithMeta } from "@/lib/ai/group-message-analyzer";
import { getOpenAiModel } from "@/lib/ai/openai-client";
import { resolveObjectFromMessage } from "@/lib/ai/object-resolver";
import { loadMatcherObjectsFromSupabase } from "@/lib/stores/object-source";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const objectSource = await loadMatcherObjectsFromSupabase(supabase);
    const objectResolver = resolveObjectFromMessage(text, objectSource.records);
    const localStoreMatch = objectResolver.localStoreMatch;
    const result = await analyzeTelegramGroupMessageWithMeta({ text, localStoreMatch, objectResolver });
    return NextResponse.json({
      ok: true,
      data: result.analysis,
      localStoreMatch,
      objectResolver,
      objectSource: {
        source: objectSource.source,
        count: objectSource.count,
        error: objectSource.error,
      },
      analysis: result.analysis,
      aiMode: result.mode,
      mode: result.mode,
      openaiConfigured: result.openaiConfigured,
      model: result.model ?? getOpenAiModel(),
      fallbackReason: result.fallbackReason,
      openaiValidationError: result.openaiValidationError ?? null,
    });
  } catch (error) {
    console.error("AI classify error", error);
    return NextResponse.json({ ok: false, error: "classification failed" }, { status: 500 });
  }
}
