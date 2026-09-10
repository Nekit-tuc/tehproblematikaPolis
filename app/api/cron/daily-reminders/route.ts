import { NextRequest, NextResponse } from "next/server";
import { runDailyReminders } from "@/lib/reminders/daily-reminders";

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
    console.error("[cron:daily-reminders] secret is not configured");
    return NextResponse.json({ success: false, error: "cron secret is not configured" }, { status: 500 });
  }

  const actual = requestSecret(request);
  if (!actual || actual !== expected) {
    console.warn("[cron:daily-reminders] unauthorized");
    return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
  const result = await runDailyReminders({ dryRun });
  return NextResponse.json(result);
}

export async function GET(request: NextRequest) {
  return handleCron(request);
}

export async function POST(request: NextRequest) {
  return handleCron(request);
}
