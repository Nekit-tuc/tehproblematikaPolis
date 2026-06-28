import { NextResponse } from "next/server";
import { analyzeTelegramGroupMessage } from "@/lib/ai/group-message-analyzer";
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
    const analysis = await analyzeTelegramGroupMessage({ text, localStoreMatch });
    return NextResponse.json({ ok: true, data: analysis, localStoreMatch, analysis });
  } catch (error) {
    console.error("AI classify error", error);
    return NextResponse.json({ ok: false, error: "classification failed" }, { status: 500 });
  }
}
