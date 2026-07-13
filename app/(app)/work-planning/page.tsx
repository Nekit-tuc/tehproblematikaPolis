import Link from "next/link";
import type React from "react";
import { CalendarDays, Filter, FolderKanban } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/ui/submit-button";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { priorityLabels, statusLabels } from "@/lib/labels";
import { getCategories, getObjects } from "@/lib/supabase/queries";
import { getTicketsGroupedByCategory, getWorkPlans, type PlanningFilters, type PlanningTicket, type WorkPlanStatus } from "@/lib/supabase/work-plans";
import { getActiveWorkers } from "@/lib/supabase/worker-queries";
import { cn, formatDate } from "@/lib/utils";
import type { TicketPriority, TicketStatus, WorkerWithCategories } from "@/types/domain";
import { createWorkPlanAction } from "./actions";

type SearchParams = {
  view?: "category" | "worker" | "object";
  from?: string;
  to?: string;
  categoryId?: string;
  workerId?: string;
  status?: TicketStatus | "";
  objectId?: string;
  assignment?: "all" | "with_worker" | "without_worker";
  create?: string;
  success?: string;
  error?: string;
};

const planningStatuses: TicketStatus[] = ["new", "assigned", "in_progress", "waiting_admin_confirmation"];

const planStatusLabels: Record<WorkPlanStatus, string> = {
  draft: "Р§РµСЂРЅРµС‚РєР°",
  sent: "РќР°РґС–СЃР»Р°РЅРѕ",
  partially_done: "Р§Р°СЃС‚РєРѕРІРѕ РІРёРєРѕРЅР°РЅРѕ",
  done: "Р’РёРєРѕРЅР°РЅРѕ",
  cancelled: "РЎРєР°СЃРѕРІР°РЅРѕ",
};

function filtersFromParams(params: SearchParams): PlanningFilters {
  return {
    from: params.from,
    to: params.to,
    categoryId: params.categoryId,
    workerId: params.workerId,
    status: params.status,
    objectId: params.objectId,
    assignment: params.assignment ?? "all",
    limit: 100,
  };
}

function priorityTone(priority: TicketPriority) {
  if (priority === "critical") return "red";
  if (priority === "high") return "orange";
  return "gray";
}

function statusTone(status: TicketStatus) {
  if (status === "waiting_admin_confirmation") return "orange";
  if (status === "in_progress" || status === "assigned") return "green";
  return "gray";
}

function assignmentLabel(workerId?: string | null, workersById?: Map<string, WorkerWithCategories>) {
  if (!workerId) return "РќРµ РїСЂРёР·РЅР°С‡РµРЅРѕ";
  return workersById?.get(workerId)?.name ?? "Р’РёРєРѕРЅР°РІРµС†СЊ РЅРµ Р·РЅР°Р№РґРµРЅРёР№";
}

function planPeriodLabel(ticket: PlanningTicket) {
  if (!ticket.plannedPlanPeriodStart || !ticket.plannedPlanPeriodEnd) return null;
  return `${ticket.plannedPlanPeriodStart} - ${ticket.plannedPlanPeriodEnd}`;
}

function plannedLabel(ticket: PlanningTicket) {
  if (!ticket.isPlanned) return null;
  return ticket.plannedPlanTitle || planPeriodLabel(ticket) || "РђРєС‚РёРІРЅРёР№ РїР»Р°РЅ";
}

function safeDecode(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function displayWorkPlanningError(value?: string | null) {
  if (!value) return null;
  const message = safeDecode(value);
  const lower = message.toLowerCase();
  if (lower.includes("row-level security") || lower.includes("violates row-level security")) {
    return "РќРµ РІРґР°Р»РѕСЃСЏ СЃС‚РІРѕСЂРёС‚Рё РїР»Р°РЅ. РџРµСЂРµРІС–СЂС‚Рµ РїСЂР°РІР° РґРѕСЃС‚СѓРїСѓ Р°Р±Рѕ RLS.";
  }
  if (message.length > 180) return `${message.slice(0, 177)}...`;
  return message;
}

function buildTabHref(view: string, params: SearchParams) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value && !["success", "error", "view"].includes(key)) search.set(key, value);
  });
  search.set("view", view);
  return `/work-planning?${search.toString()}`;
}

export default async function WorkPlanningPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const view = params.view === "worker" || params.view === "object" ? params.view : "category";
  const createMode = params.create === "1";
  const filters = filtersFromParams(params);

  const [groupsResult, plansResult, categoriesResult, objectsResult, workersResult] = await Promise.all([
    getTicketsGroupedByCategory(filters),
    getWorkPlans(),
    getCategories(),
    getObjects(),
    getActiveWorkers(),
  ]);

  const workersById = new Map(workersResult.data.map((worker) => [worker.id, worker]));
  const error = groupsResult.error ?? plansResult.error ?? categoriesResult.error ?? objectsResult.error ?? workersResult.error;
  const pageError = displayWorkPlanningError(error);
  const createError = displayWorkPlanningError(params.error);
  const ticketCount = groupsResult.data.reduce((sum, group) => sum + group.tickets.length, 0);

  return (
    <div className="page-shell space-y-2.5 pb-20 md:space-y-6 md:pb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-[23px] font-semibold leading-none tracking-[-0.03em] md:text-2xl">РџР»Р°РЅСѓРІР°РЅРЅСЏ СЂРѕР±С–С‚</h1>
          <p className="subtle">Р“СЂСѓРїСѓРІР°РЅРЅСЏ Р·Р°СЏРІРѕРє РїРѕ РїС–РґСЂРѕР·РґС–Р»Р°С…, РІРёРєРѕРЅР°РІС†СЏС… С– С‚РёР¶РЅРµРІРёС… РїР»Р°РЅР°С….</p>
        </div>
        <Badge tone="orange">{ticketCount} Р·Р°СЏРІРѕРє РґРѕСЃС‚СѓРїРЅРѕ</Badge>
      </div>

      {pageError ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="РќРµ РІРґР°Р»РѕСЃСЏ Р·Р°РІР°РЅС‚Р°Р¶РёС‚Рё РїР»Р°РЅСѓРІР°РЅРЅСЏ">
            <span className="break-words whitespace-normal">{pageError}</span>
          </Alert>
        </div>
      ) : null}
      {createError ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="РџР»Р°РЅ РЅРµ СЃС‚РІРѕСЂРµРЅРѕ">
            <span className="break-words whitespace-normal">{createError}</span>
          </Alert>
        </div>
      ) : null}
      {params.success === "created" ? (
        <div className="min-w-0 max-w-full overflow-hidden break-words whitespace-normal">
          <Alert title="РџР»Р°РЅ СЃС‚РІРѕСЂРµРЅРѕ">
            <span className="break-words whitespace-normal">Р§РµСЂРЅРµС‚РєСѓ РїР»Р°РЅСѓ СЂРѕР±С–С‚ Р·Р±РµСЂРµР¶РµРЅРѕ. Р—Р°СЏРІРєРё Р·Р°Р»РёС€РёР»РёСЃСЏ РѕРєСЂРµРјРёРјРё С– РЅРµ Р·РјС–РЅРёР»Рё СЃС‚Р°С‚СѓСЃ.</span>
          </Alert>
        </div>
      ) : null}

      <details className="mobile-card p-3 md:hidden">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg bg-white/[0.04] px-3 text-[12px] font-semibold text-orange-200">
          <span className="flex items-center gap-2"><Filter className="h-4 w-4" />Р¤С–Р»СЊС‚СЂРё</span>
          <span className="text-xs text-stone-500">{ticketCount} Р·РЅР°Р№РґРµРЅРѕ</span>
        </summary>
        <FilterForm params={params} categories={categoriesResult.data} objects={objectsResult.data} workers={workersResult.data} compact />
      </details>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Р¤С–Р»СЊС‚СЂРё</CardTitle>
          <CardDescription>РџРѕРєР°Р·СѓСЋС‚СЊСЃСЏ РїС–РґС‚РІРµСЂРґР¶РµРЅС– РЅРµР·Р°РІРµСЂС€РµРЅС– Р·Р°СЏРІРєРё: РЅРѕРІС–, РїСЂРёР·РЅР°С‡РµРЅС–, РІ СЂРѕР±РѕС‚С– С‚Р° РЅР° РїС–РґС‚РІРµСЂРґР¶РµРЅРЅС– РІРёРєРѕРЅР°РЅРЅСЏ.</CardDescription>
        </CardHeader>
        <CardContent>
          <FilterForm params={params} categories={categoriesResult.data} objects={objectsResult.data} workers={workersResult.data} />
        </CardContent>
      </Card>

      <div className="flex gap-2 overflow-x-auto pb-1">
        <TabLink href={buildTabHref("category", params)} active={view === "category"}>РџРѕ РєР°С‚РµРіРѕСЂС–СЏС…</TabLink>
        <TabLink href={buildTabHref("worker", params)} active={view === "worker"}>РџРѕ РІРёРєРѕРЅР°РІС†СЏС…</TabLink>
        <TabLink href={buildTabHref("object", params)} active={view === "object"}>РџРѕ РѕР±'С”РєС‚Р°С…</TabLink>
      </div>

      {view !== "category" ? (
        <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
          <CardContent className="pt-6 text-sm text-muted-foreground">Р‘СѓРґРµ РґРѕРґР°РЅРѕ РЅР° РЅР°СЃС‚СѓРїРЅРѕРјСѓ РµС‚Р°РїС–.</CardContent>
        </Card>
      ) : (
        <>
        {!createMode ? (
          <Button asChild className="min-h-8 w-full rounded-lg text-[10px] md:hidden">
            <Link href="/work-planning?create=1">РЎС‚РІРѕСЂРёС‚Рё С‚РёР¶РЅРµРІРёР№ РїР»Р°РЅ</Link>
          </Button>
        ) : null}
        <form action={createWorkPlanAction} className={cn("space-y-6", !createMode && "hidden md:block")}>
          <Card className="rounded-[17px] border-orange-500/20 bg-orange-950/10 md:rounded-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><FolderKanban className="h-5 w-5 text-orange-300" />РЎС‚РІРѕСЂРёС‚Рё С‚РёР¶РЅРµРІРёР№ РїР»Р°РЅ</CardTitle>
              <CardDescription>РћР±РµСЂС–С‚СЊ Р·Р°СЏРІРєРё РЅРёР¶С‡Рµ, РІРєР°Р¶С–С‚СЊ РїРµСЂС–РѕРґ С– СЃС‚РІРѕСЂС–С‚СЊ С‡РµСЂРЅРµС‚РєСѓ РїР»Р°РЅСѓ. Telegram-СЂРѕР·СЃРёР»РєР° Р±СѓРґРµ РЅР° РµС‚Р°РїС– 2.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-4">
              <Field label="РќР°Р·РІР° РїР»Р°РЅСѓ">
                <Input name="title" required placeholder="РќР°РїСЂРёРєР»Р°Рґ: РџР»Р°РЅ СЂРѕР±С–С‚ РЅР° С‚РёР¶РґРµРЅСЊ" />
              </Field>
              <Field label="РџРµСЂС–РѕРґ Р·">
                <Input name="period_start" type="date" required />
              </Field>
              <Field label="РџРµСЂС–РѕРґ РїРѕ">
                <Input name="period_end" type="date" required />
              </Field>
              <div className="flex items-end">
                <SubmitButton type="submit" pendingText="РЎС‚РІРѕСЂСЋС”С‚СЊСЃСЏ..." showOverlay className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
                  РЎС‚РІРѕСЂРёС‚Рё РїР»Р°РЅ
                </SubmitButton>
              </div>
              <div className="md:col-span-4">
                <Field label="РџСЂРёРјС–С‚РєР°">
                  <Textarea name="notes" placeholder="Р”РѕРґР°С‚РєРѕРІРёР№ РєРѕРЅС‚РµРєСЃС‚ РґР»СЏ РїР»Р°РЅСѓ" className="min-h-20" />
                </Field>
              </div>
              <Button asChild variant="outline" className="min-h-8 rounded-lg text-[10px] md:hidden">
                <Link href="/work-planning">РЎРєР°СЃСѓРІР°С‚Рё</Link>
              </Button>
            </CardContent>
          </Card>

          {groupsResult.data.length === 0 ? (
            <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
              <CardContent className="pt-6 text-sm text-muted-foreground">Р—Р°СЏРІРѕРє РґР»СЏ РїР»Р°РЅСѓРІР°РЅРЅСЏ Р·Р° РїРѕС‚РѕС‡РЅРёРјРё С„С–Р»СЊС‚СЂР°РјРё РЅРµРјР°С”.</CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {groupsResult.data.map((group) => (
                <CategoryGroup key={group.categoryId} title={group.categoryName} tickets={group.tickets} workersById={workersById} />
              ))}
            </div>
          )}
        </form>
        </>
      )}

      <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-orange-300" />РџР»Р°РЅРё СЂРѕР±С–С‚</CardTitle>
          <CardDescription>РћСЃС‚Р°РЅРЅС– С‡РµСЂРЅРµС‚РєРё С‚Р° РїР»Р°РЅРё. Р”РµС‚Р°Р»СЊРЅР° СЃС‚РѕСЂС–РЅРєР° РїР»Р°РЅСѓ Р±СѓРґРµ РґРѕРґР°РЅР° РѕРєСЂРµРјРёРј РµС‚Р°РїРѕРј.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {plansResult.data.length === 0 ? (
            <p className="text-sm text-muted-foreground">РџР»Р°РЅС–РІ СЂРѕР±С–С‚ РїРѕРєРё РЅРµРјР°С”.</p>
          ) : plansResult.data.map((plan) => (
            <div key={plan.id} className="grid gap-3 rounded-2xl border border-border bg-stone-950/30 p-3 text-sm md:grid-cols-[1.4fr_1fr_120px_120px_auto] md:items-center md:rounded-lg">
              <div className="min-w-0">
                <div className="break-words font-medium text-stone-100">{plan.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">РЎС‚РІРѕСЂРµРЅРѕ: {formatDate(plan.created_at)}</div>
              </div>
              <div className="text-muted-foreground">{plan.period_start} - {plan.period_end}</div>
              <Badge tone={plan.status === "draft" ? "orange" : plan.status === "done" ? "green" : "gray"}>{planStatusLabels[plan.status]}</Badge>
              <div className="text-muted-foreground">{plan.items_count ?? 0} Р·Р°СЏРІРѕРє</div>
              <Button asChild variant="outline" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
                <Link href={`/work-planning/${plan.id}`}>РџРµСЂРµРіР»СЏРЅСѓС‚Рё</Link>
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterForm({
  params,
  categories,
  objects,
  workers,
  compact = false,
}: {
  params: SearchParams;
  categories: Array<{ id: string; name: string }>;
  objects: Array<{ id: string; name: string }>;
  workers: WorkerWithCategories[];
  compact?: boolean;
}) {
  return (
    <form className={cn("grid gap-3", compact ? "mt-3" : "md:grid-cols-4 xl:grid-cols-7")}>
      <input type="hidden" name="view" value={params.view ?? "category"} />
      <Field label="РџРµСЂС–РѕРґ Р·"><Input name="from" type="date" defaultValue={params.from ?? ""} /></Field>
      <Field label="РџРµСЂС–РѕРґ РїРѕ"><Input name="to" type="date" defaultValue={params.to ?? ""} /></Field>
      <Field label="РљР°С‚РµРіРѕСЂС–СЏ">
        <Select name="categoryId" defaultValue={params.categoryId ?? "all"}>
          <option value="all">Р’СЃС–</option>
          {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
        </Select>
      </Field>
      <Field label="Р’РёРєРѕРЅР°РІРµС†СЊ">
        <Select name="workerId" defaultValue={params.workerId ?? "all"}>
          <option value="all">Р’СЃС–</option>
          {workers.map((worker) => <option key={worker.id} value={worker.id}>{worker.name}</option>)}
        </Select>
      </Field>
      <Field label="РЎС‚Р°С‚СѓСЃ">
        <Select name="status" defaultValue={params.status ?? ""}>
          <option value="">Р’СЃС–</option>
          {planningStatuses.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}
        </Select>
      </Field>
      <Field label="РћР±'С”РєС‚">
        <Select name="objectId" defaultValue={params.objectId ?? "all"}>
          <option value="all">Р’СЃС–</option>
          {objects.map((object) => <option key={object.id} value={object.id}>{object.name}</option>)}
        </Select>
      </Field>
      <Field label="РџСЂРёР·РЅР°С‡РµРЅРЅСЏ">
        <Select name="assignment" defaultValue={params.assignment ?? "all"}>
          <option value="all">Р’СЃС–</option>
          <option value="without_worker">Р‘РµР· РІРёРєРѕРЅР°РІС†СЏ</option>
          <option value="with_worker">Р— РІРёРєРѕРЅР°РІС†РµРј</option>
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-2 md:col-span-full md:flex">
        <SubmitButton type="submit" pendingText="Р—Р°СЃС‚РѕСЃРѕРІСѓС”С‚СЊСЃСЏ..." className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">Р—Р°СЃС‚РѕСЃСѓРІР°С‚Рё</SubmitButton>
        <Button asChild variant="outline" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm"><Link href="/work-planning">РЎРєРёРЅСѓС‚Рё</Link></Button>
      </div>
    </form>
  );
}

function CategoryGroup({ title, tickets, workersById }: { title: string; tickets: PlanningTicket[]; workersById: Map<string, WorkerWithCategories> }) {
  return (
    <Card className="rounded-[17px] border-white/10 bg-white/[0.04] md:rounded-lg">
      <CardHeader className="p-3 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="break-words text-[13px] md:text-lg">{title}</CardTitle>
          <Badge tone="orange">{tickets.length} Р·Р°СЏРІРѕРє</Badge>
        </div>
      </CardHeader>
      <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
        <div className="max-w-full overflow-x-auto rounded-2xl border border-border bg-stone-950/30 md:rounded-lg">
          <table className="w-full min-w-[780px] text-left text-xs md:text-sm">
            <thead className="bg-white/[0.04] text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-12 px-3 py-3">#</th>
                <th className="px-3 py-3">РќРѕРјРµСЂ</th>
                <th className="px-3 py-3">РћР±'С”РєС‚ / РѕРїРёСЃ</th>
                <th className="px-3 py-3">РџСЂС–РѕСЂРёС‚РµС‚</th>
                <th className="px-3 py-3">РЎС‚Р°С‚СѓСЃ / РїР»Р°РЅ</th>
                <th className="px-3 py-3">Р’РёРєРѕРЅР°РІРµС†СЊ</th>
                <th className="px-3 py-3 text-right">Р”С–СЏ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tickets.map((ticket) => (
                <TicketPlanningRow key={ticket.id} ticket={ticket} workersById={workersById} />
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function TicketPlanningRow({ ticket, workersById }: { ticket: PlanningTicket; workersById: Map<string, WorkerWithCategories> }) {
  const planned = plannedLabel(ticket);
  return (
    <tr className={cn("transition hover:bg-stone-900/60", ticket.isPlanned && "opacity-60")}>
      <td className="px-3 py-3 align-top">
        <input
          name="ticketIds"
          value={ticket.id}
          type="checkbox"
          disabled={ticket.isPlanned}
          aria-label={`Р”РѕРґР°С‚Рё Р·Р°СЏРІРєСѓ ${ticket.number} РґРѕ РїР»Р°РЅСѓ`}
          className="h-5 w-5 accent-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
        />
      </td>
      <td className="whitespace-nowrap px-3 py-3 align-top font-semibold text-orange-200">{ticket.number}</td>
      <td className="min-w-0 px-3 py-3 align-top">
        <div className="max-w-[260px] break-words font-medium text-stone-100">{ticket.object?.name ?? "-"}</div>
        <div className="mt-1 line-clamp-2 max-w-[320px] break-words text-xs text-muted-foreground">{ticket.title || ticket.description}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <Badge tone={priorityTone(ticket.priority)}>{priorityLabels[ticket.priority]}</Badge>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex max-w-[180px] flex-col gap-1">
          <Badge tone={statusTone(ticket.status)}>{statusLabels[ticket.status]}</Badge>
          {planned ? (
            <div className="min-w-0">
              <Badge tone="orange">Р—Р°РїР»Р°РЅРѕРІР°РЅРѕ</Badge>
              <div className="mt-1 line-clamp-2 break-words text-[11px] leading-snug text-orange-100/80">
                {planned}
              </div>
            </div>
          ) : null}
        </div>
      </td>
      <td className="max-w-[160px] break-words px-3 py-3 align-top text-xs text-muted-foreground">{assignmentLabel(ticket.assignee_worker_id, workersById)}</td>
      <td className="px-3 py-3 align-top text-right">
        <Button asChild variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px] md:min-h-0 md:rounded-md md:text-sm">
          <Link href={`/tickets/${ticket.id}`}>Р’С–РґРєСЂРёС‚Рё</Link>
        </Button>
      </td>
    </tr>
  );
}

function TabLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-stone-300",
        active && "border-orange-500 bg-orange-500 text-stone-950 font-semibold",
      )}
    >
      {children}
    </Link>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}

