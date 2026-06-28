import { NextResponse } from "next/server";
import { analyzeGroupMessage } from "@/lib/ai/classifier";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };
    const text = typeof body.text === "string" ? body.text : "";
    if (!text.trim()) {
      return NextResponse.json({ ok: false, error: "text is required" }, { status: 400 });
    }

    const analysis = await analyzeGroupMessage({ text, source: "api" });
    return NextResponse.json({ ok: true, data: analysis });
  } catch (error) {
    console.error("AI classify error", error);
    return NextResponse.json({ ok: false, error: "classification failed" }, { status: 500 });
  }
}
