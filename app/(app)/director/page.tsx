import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/server";

export default async function DirectorHomePage() {
  const { profile } = await requireRole(["store_director"]);
  if (profile.approval_status === "pending") redirect("/director/pending");
  if (profile.approval_status === "rejected") redirect("/director/rejected");
  redirect("/director/tickets");
}