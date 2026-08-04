import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/server";
import { getAdminDirectorAccounts } from "@/lib/supabase/director-queries";
import type { ApprovalStatus } from "@/types/domain";

const tabs: Array<{ label: string; value?: ApprovalStatus }> = [
  { label: "Очікують", value: "pending" },
  { label: "Підтверджені", value: "approved" },
  { label: "Відхилені", value: "rejected" },
  { label: "Усі" },
];

function statusLabel(status?: string) {
  if (status === "approved") return "Підтверджено";
  if (status === "rejected") return "Відхилено";
  return "Очікує";
}

export default async function ObjectDirectorsPage({ searchParams }: { searchParams: Promise<{ status?: ApprovalStatus; error?: string }> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const status = ["pending", "approved", "rejected"].includes(params.status ?? "") ? params.status : "pending";
  const result = await getAdminDirectorAccounts(status as ApprovalStatus | undefined);
  return (
    <div className="page-shell space-y-4">
      <div className="flex items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold">Директори магазинів</h1><p className="subtle">Підтвердження акаунтів, прив'язки до магазинів і запити на нові адреси.</p></div><Button asChild variant="outline"><Link href="/objects">До об'єктів</Link></Button></div>
      {params.error ? <Alert title="Помилка">{decodeURIComponent(params.error)}</Alert> : null}
      {result.error ? <Alert title="Помилка директорів">{result.error}</Alert> : null}
      <div className="flex flex-wrap gap-2">{tabs.map((tab) => <Button key={tab.label} asChild variant={(tab.value ?? undefined) === status || (!tab.value && !status) ? "default" : "outline"} size="sm"><Link href={tab.value ? `/objects/directors?status=${tab.value}` : "/objects/directors?status="}>{tab.label}</Link></Button>)}</div>
      <div className="grid gap-3 md:grid-cols-2">
        {result.data.map((director) => <Card key={director.id} className="border-white/10 bg-white/[0.04]"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle className="text-base text-zinc-100">{director.full_name}</CardTitle><p className="mt-1 text-xs text-zinc-400">{director.phone ?? "Телефон не вказано"}</p></div><Badge tone={director.approval_status === "approved" ? "green" : director.approval_status === "rejected" ? "red" : "orange"}>{statusLabel(director.approval_status)}</Badge></div></CardHeader><CardContent className="space-y-3 text-sm text-zinc-300"><div><div className="text-xs uppercase tracking-wide text-zinc-500">Магазини</div><div className="mt-1 space-y-1">{director.directorObjects.length ? director.directorObjects.slice(0, 3).map((link) => <div key={link.id} className="truncate">{link.object?.name ?? "Магазин"} · {statusLabel(link.approvalStatus)}</div>) : <div className="text-zinc-500">Немає прив'язок</div>}</div></div><div><div className="text-xs uppercase tracking-wide text-zinc-500">Запити адрес</div><div className="mt-1">{director.objectRequests.filter((item) => item.status === "pending").length} очікують</div></div><Button asChild className="w-full rounded-2xl bg-orange-500 text-black hover:bg-orange-400"><Link href={`/objects/directors/${director.id}`}>Відкрити</Link></Button></CardContent></Card>)}
        {result.data.length === 0 ? <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-5 text-sm text-zinc-400">Директорів у цьому статусі немає.</div> : null}
      </div>
    </div>
  );
}