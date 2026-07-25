import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { getComputedNotifications } from "@/lib/supabase/notifications";

export async function GET() {
  await requireAuth();
  const result = await getComputedNotifications(20);

  return NextResponse.json({
    notifications: result.data,
    error: result.error,
  });
}
