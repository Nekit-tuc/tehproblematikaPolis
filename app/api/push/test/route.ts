import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { sendPushToUser } from "@/lib/push/send-push-notification";

export async function POST() {
  const { user } = await requireRole(["admin", "management", "tech_manager"]);
  const result = await sendPushToUser(user.id, {
    title: "Тестове сповіщення",
    body: "Push працює успішно",
    url: "/dashboard",
    tag: "push-test",
  });
  return NextResponse.json({ ok: result.sent > 0, ...result });
}
