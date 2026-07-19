import { NextRequest, NextResponse } from "next/server";
import { ensureWeeklyDraftPlansForAutoRouting } from "@/lib/supabase/work-plans";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configuredSecret() {
  return (process.env.CRON_SECRET ?? process.env.VERCEL_CRON_SECRET ?? "").trim();
}

function requestSecret(request: NextRequest) {
  const authorization = request.headers.get("authorization") ?? "";
  const bearer = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  return bearer || request.nextUrl.searchParams.get("secret")?.trim() || "";
}

async function handleCron(request: NextRequest) {
  const expected = configuredSecret();
  if (!expected) {
    console.error("[cron:ensure-weekly-plans] secret is not configured");
    return NextResponse.json({ ok: false, error: "cron secret is not configured" }, { status: 500 });
  }

  const actual = requestSecret(request);
  if (!actual) {
    console.warn("[cron:ensure-weekly-plans] secret missing");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (actual !== expected) {
    console.warn("[cron:ensure-weekly-plans] secret mismatch");
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await ensureWeeklyDraftPlansForAutoRouting();
  if (result.error) {
    console.error("[cron:ensure-weekly-plans] failed", { error: result.error });
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  console.info("[cron:ensure-weekly-plans] finished", {
    periodStart: result.data.periodStart,
    periodEnd: result.data.periodEnd,
    created: result.data.created,
    total: result.data.plans.length,
  });
  return NextResponse.json({ ok: true, ...result.data });
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
