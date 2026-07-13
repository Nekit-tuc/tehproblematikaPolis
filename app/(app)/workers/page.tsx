import { ArrowLeft, BriefcaseBusiness, Pencil, Plus, PowerOff, Trash2 } from "lucide-react";
import Link from "next/link";
import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmitButton } from "@/components/tickets/confirm-submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { requireRole } from "@/lib/auth/server";
import { getCategories } from "@/lib/supabase/queries";
import { getWorkerStats, getWorkers } from "@/lib/supabase/worker-queries";
import type { Category, WorkerWithCategories } from "@/types/domain";
import { createWorkerAction, deactivateWorkerAction, deleteOrDeactivateWorkerAction, updateWorkerAction } from "./actions";

export default async function WorkersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string; addWorker?: string; view?: string }>;
}) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [workersResult, categoriesResult, statsResult] = await Promise.all([getWorkers(), getCategories(), getWorkerStats()]);
  const error = params.error ? decodeURIComponent(params.error) : workersResult.error ?? categoriesResult.error ?? statsResult.error;
  const statsByWorker = new Map(statsResult.data.map((item) => [item.worker.id, item]));
  const isCreatingWorker = params.addWorker === "1";
  const canDeleteWorkers = profile.role === "admin";
  const mobileView = params.view === "table" ? "table" : "cards";
  const viewHref = (view: "cards" | "table") => {
    const next = new URLSearchParams();
    if (view === "table") next.set("view", "table");
    const search = next.toString();
    return search ? `/workers?${search}` : "/workers";
  };

  return (
    <div className="page-shell space-y-2.5 md:space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Р’РёРєРѕРЅР°РІС†С–</h1>
          <p className="subtle">Р”РѕРІС–РґРЅРёРє РјР°Р№СЃС‚СЂС–РІ, Telegram-РєРѕРЅС‚Р°РєС‚Рё С‚Р° СЃРїРµС†С–Р°Р»С–Р·Р°С†С–С— РїРѕ РєР°С‚РµРіРѕСЂС–СЏС… Р·Р°СЏРІРѕРє.</p>
        </div>
        {!isCreatingWorker ? (
          <Button asChild className="min-h-8 w-full rounded-lg text-[10px] md:w-auto md:rounded-md md:text-sm">
            <Link href="/workers?addWorker=1"><Plus className="h-4 w-4" />Р”РѕРґР°С‚Рё РІРёРєРѕРЅР°РІС†СЏ</Link>
          </Button>
        ) : null}
      </div>

      {error ? <Alert title="РќРµ РІРґР°Р»РѕСЃСЏ РІРёРєРѕРЅР°С‚Рё РґС–СЋ">{error}</Alert> : null}
      {params.success === "deleted" ? <Alert title="Р’РёРєРѕРЅР°РІС†СЏ РІРёРґР°Р»РµРЅРѕ">Р—Р°РїРёСЃ РІРёРєРѕРЅР°РІС†СЏ С‚Р° СЃР»СѓР¶Р±РѕРІС– Р·РІ'СЏР·РєРё РІРёРґР°Р»РµРЅРѕ Р· Р±Р°Р·Рё.</Alert> : null}
      {params.success === "deactivated" ? <Alert title="Р’РёРєРѕРЅР°РІС†СЏ РґРµР°РєС‚РёРІРѕРІР°РЅРѕ">РЈ РІРёРєРѕРЅР°РІС†СЏ С” РїРѕРІ'СЏР·Р°РЅС– Р·Р°СЏРІРєРё, С‚РѕРјСѓ С„С–Р·РёС‡РЅРµ РІРёРґР°Р»РµРЅРЅСЏ РЅРµ РІРёРєРѕРЅСѓРІР°Р»РѕСЃСЊ.</Alert> : null}
      {params.success && !["deleted", "deactivated"].includes(params.success) ? <Alert title="Р—РјС–РЅРё Р·Р±РµСЂРµР¶РµРЅРѕ">Р”Р°РЅС– РІРёРєРѕРЅР°РІС†СЏ РѕРЅРѕРІР»РµРЅРѕ.</Alert> : null}

      {isCreatingWorker ? (
      <Card className="rounded-[17px] border-orange-500/30 bg-stone-950/80 shadow-xl shadow-black/35 md:rounded-lg">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
            <div>
              <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-orange-300" />РќРѕРІРёР№ РІРёРєРѕРЅР°РІРµС†СЊ</CardTitle>
              <CardDescription>
                Р©РѕР± РїС–РґРєР»СЋС‡РёС‚Рё Telegram, РІРёРєРѕРЅР°РІРµС†СЊ РјР°С” РІС–РґРєСЂРёС‚Рё Р±РѕС‚Р° С– РЅР°С‚РёСЃРЅСѓС‚Рё /start. Telegram username РІРёРєРѕСЂРёСЃС‚РѕРІСѓС”С‚СЊСЃСЏ РґР»СЏ РїСЂРёРІ'СЏР·РєРё, Telegram ID - РґР»СЏ РЅР°РґСЃРёР»Р°РЅРЅСЏ Р·Р°СЏРІРѕРє.
              </CardDescription>
            </div>
            <Button asChild variant="outline" className="min-h-8 w-full rounded-lg text-[10px] md:w-auto md:rounded-md md:text-sm">
              <Link href="/workers"><ArrowLeft className="h-4 w-4" />РЎРєР°СЃСѓРІР°С‚Рё</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-28 md:pb-6">
          <WorkerForm categories={categoriesResult.data} action={createWorkerAction} submitLabel="Р”РѕРґР°С‚Рё РІРёРєРѕРЅР°РІС†СЏ" cancelHref="/workers" />
        </CardContent>
      </Card>
      ) : (
      <>
      <Card className="border-dashed border-white/10 bg-white/[0.03]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BriefcaseBusiness className="h-5 w-5 text-orange-300" />Р”РѕРґР°РІР°РЅРЅСЏ РІРёРєРѕРЅР°РІС†СЏ</CardTitle>
          <CardDescription>
            Р¤РѕСЂРјР° СЃС‚РІРѕСЂРµРЅРЅСЏ РїСЂРёС…РѕРІР°РЅР°, С‰РѕР± РЅРµ Р·Р°Р№РјР°С‚Рё СЂРѕР±РѕС‡Сѓ РѕР±Р»Р°СЃС‚СЊ. РќР°С‚РёСЃРЅС–С‚СЊ РєРЅРѕРїРєСѓ Р·РІРµСЂС…Сѓ, РєРѕР»Рё РїРѕС‚СЂС–Р±РЅРѕ РґРѕРґР°С‚Рё РЅРѕРІРѕРіРѕ РІРёРєРѕРЅР°РІС†СЏ.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" className="min-h-8 w-full rounded-lg text-[10px] md:w-auto md:rounded-md md:text-sm">
            <Link href="/workers?addWorker=1"><Plus className="h-4 w-4" />Р”РѕРґР°С‚Рё РІРёРєРѕРЅР°РІС†СЏ</Link>
          </Button>
        </CardContent>
      </Card>

      <details className="mobile-card p-2 md:hidden">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg bg-white/[0.04] px-3 text-[12px] font-semibold text-orange-200">
          Р’РёРіР»СЏРґ
          <span className="text-xs text-stone-500">{mobileView === "table" ? "РўР°Р±Р»РёС†СЏ" : "РљР°СЂС‚РєРё"}</span>
        </summary>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <Button asChild variant={mobileView === "cards" ? "default" : "outline"} size="sm" className="min-h-8 rounded-lg text-[10px]">
            <Link href={viewHref("cards")}>РљР°СЂС‚РєРё</Link>
          </Button>
          <Button asChild variant={mobileView === "table" ? "default" : "outline"} size="sm" className="min-h-8 rounded-lg text-[10px]">
            <Link href={viewHref("table")}>РўР°Р±Р»РёС†СЏ</Link>
          </Button>
        </div>
      </details>

      {mobileView === "table" ? (
        <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04] md:hidden">
          <table className="w-full min-w-[720px] text-left text-[10px]">
            <thead className="bg-white/[0.04] text-muted-foreground">
              <tr>
                <th className="px-3 py-3">Р’РёРєРѕРЅР°РІРµС†СЊ</th>
                <th className="px-3 py-3">Telegram</th>
                <th className="px-3 py-3">РЎС‚Р°С‚СѓСЃ</th>
                <th className="px-3 py-3">РђРєС‚РёРІРЅС–</th>
                <th className="px-3 py-3">РљР°С‚РµРіРѕСЂС–С—</th>
                <th className="px-3 py-3 text-right">Р”С–С—</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {workersResult.data.map((worker) => {
                const stats = statsByWorker.get(worker.id);
                return (
                  <tr key={worker.id}>
                    <td className="max-w-[170px] px-3 py-3"><div className="line-clamp-2 break-words font-semibold">{worker.name}</div></td>
                    <td className="max-w-[150px] px-3 py-3"><div className="line-clamp-2 break-words">{worker.telegram_username ? `@${worker.telegram_username}` : "-"}</div></td>
                    <td className="px-3 py-3"><Badge tone={worker.is_active ? "green" : "default"}>{worker.is_active ? "РђРєС‚РёРІРЅРёР№" : "РќРµР°РєС‚РёРІРЅРёР№"}</Badge></td>
                    <td className="px-3 py-3">{stats?.active ?? 0}</td>
                    <td className="max-w-[220px] px-3 py-3"><div className="line-clamp-2 break-words">{worker.categories?.map((category) => category.name).join(", ") || "-"}</div></td>
                    <td className="px-3 py-3 text-right">
                      <Button asChild variant="outline" size="sm" className="rounded-2xl">
                        <Link href={`/workers/${worker.id}`}>Р—Р°СЏРІРєРё</Link>
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className={mobileView === "table" ? "hidden gap-2 md:grid md:gap-4 xl:grid-cols-2" : "grid gap-2 md:gap-4 xl:grid-cols-2"}>
        {workersResult.data.length === 0 ? (
          <Card><CardContent className="pt-5 text-sm text-muted-foreground">Р’РёРєРѕРЅР°РІС†С–РІ РїРѕРєРё РЅРµРјР°С”.</CardContent></Card>
        ) : workersResult.data.map((worker) => {
          const stats = statsByWorker.get(worker.id);
          return (
            <Card key={worker.id} className={!worker.is_active ? "opacity-70" : undefined}>
              <CardHeader className="space-y-2 md:space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-2 md:gap-3">
                  <div className="min-w-0">
                    <CardTitle className="break-words text-[13px] md:text-lg">{worker.name}</CardTitle>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground md:gap-2 md:text-sm">
                      <span className="break-words">{worker.telegram_username ? `@${worker.telegram_username}` : "Telegram username РЅРµ РІРєР°Р·Р°РЅРѕ"}</span>
                      <span className="text-stone-600">В·</span>
                      <span>ID: {worker.telegram_id || "-"}</span>
                      <TelegramConnectionBadge worker={worker} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={worker.is_active ? "green" : "default"}>{worker.is_active ? "РђРєС‚РёРІРЅРёР№" : "РќРµР°РєС‚РёРІРЅРёР№"}</Badge>
                    <Badge tone="orange">{stats?.active ?? 0} Р°РєС‚РёРІРЅРёС…</Badge>
                  </div>
                </div>
                <div className="grid gap-1.5 text-[10px] text-muted-foreground sm:grid-cols-4 md:text-xs">
                  <span>Р’СЃСЊРѕРіРѕ: <b className="text-stone-200">{stats?.total ?? 0}</b></span>
                  <span>Р’РёРєРѕРЅР°РЅРѕ: <b className="text-stone-200">{stats?.done ?? 0}</b></span>
                  <span>РќР° РїС–РґС‚РІРµСЂРґР¶РµРЅРЅС–: <b className="text-stone-200">{stats?.waitingConfirmation ?? 0}</b></span>
                  <span>РћС†С–РЅРєР°: <b className="text-stone-200">{stats?.averageRating ? stats.averageRating.toFixed(1) : "-"}</b></span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 md:space-y-4">
                <div className="flex flex-wrap gap-2">
                  {(worker.categories ?? []).length === 0 ? (
                    <span className="text-[10px] text-muted-foreground md:text-sm">РљР°С‚РµРіРѕСЂС–С— РЅРµ РїСЂРёР·РЅР°С‡РµРЅС–.</span>
                  ) : worker.categories?.map((category) => <Badge key={category.id}>{category.name}</Badge>)}
                </div>
                {worker.notes ? <p className="break-words text-sm text-muted-foreground">{worker.notes}</p> : null}
                <Button asChild variant="outline">
                  <Link href={`/workers/${worker.id}`}>Р—Р°СЏРІРєРё РІРёРєРѕРЅР°РІС†СЏ</Link>
                </Button>
                <details className="rounded-lg border border-border bg-stone-950/30 p-2 md:p-3">
                  <summary className="cursor-pointer list-none text-[10px] font-medium text-orange-200 md:text-sm">
                    <span className="inline-flex items-center gap-2"><Pencil className="h-4 w-4" />Р РµРґР°РіСѓРІР°С‚Рё</span>
                  </summary>
                  <div className="mt-4">
                    <WorkerForm worker={worker} categories={categoriesResult.data} action={updateWorkerAction.bind(null, worker.id)} submitLabel="Р—Р±РµСЂРµРіС‚Рё" />
                    {worker.is_active ? (
                      <form action={deactivateWorkerAction.bind(null, worker.id)} className="mt-3">
                        <Button type="submit" variant="outline"><PowerOff className="h-4 w-4" />Р”РµР°РєС‚РёРІСѓРІР°С‚Рё</Button>
                      </form>
                    ) : null}
                  </div>
                </details>
                {canDeleteWorkers ? (
                  <form action={deleteOrDeactivateWorkerAction.bind(null, worker.id)} className="border-t border-white/10 pt-2 md:pt-4">
                    <ConfirmSubmitButton
                      type="submit"
                      variant="destructive"
                      className="min-h-8 w-full rounded-lg text-[10px] md:min-h-0 md:w-auto md:rounded-md md:text-sm"
                      message="Р’Рё С‚РѕС‡РЅРѕ С…РѕС‡РµС‚Рµ РІРёРґР°Р»РёС‚Рё РІРёРєРѕРЅР°РІС†СЏ? РЇРєС‰Рѕ РІ РЅСЊРѕРіРѕ С” Р·Р°СЏРІРєРё, РІС–РЅ Р±СѓРґРµ РґРµР°РєС‚РёРІРѕРІР°РЅРёР№."
                    >
                      <Trash2 className="h-4 w-4" />Р’РёРґР°Р»РёС‚Рё РІРёРєРѕРЅР°РІС†СЏ
                    </ConfirmSubmitButton>
                    <p className="mt-2 text-xs text-muted-foreground">
                      РЇРєС‰Рѕ С” РїРѕРІ'СЏР·Р°РЅС– Р·Р°СЏРІРєРё, Р·Р°РїРёСЃ РЅРµ РІРёРґР°Р»СЏС”С‚СЊСЃСЏ, Р° РІРёРєРѕРЅР°РІРµС†СЊ РґРµР°РєС‚РёРІСѓС”С‚СЊСЃСЏ.
                    </p>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
      </>
      )}
    </div>
  );
}

function TelegramConnectionBadge({ worker }: { worker: WorkerWithCategories }) {
  if (worker.telegram_id) return <Badge tone="green">РџС–РґРєР»СЋС‡РµРЅРѕ</Badge>;
  if (worker.telegram_username) return <Badge tone="orange">РћС‡С–РєСѓС” РїС–РґРєР»СЋС‡РµРЅРЅСЏ</Badge>;
  return <Badge>Username РЅРµ РІРєР°Р·Р°РЅРѕ</Badge>;
}

function WorkerForm({
  worker,
  categories,
  action,
  submitLabel,
  cancelHref,
}: {
  worker?: WorkerWithCategories;
  categories: Category[];
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  cancelHref?: string;
}) {
  const selected = new Set((worker?.categories ?? []).map((category) => category.id));
  return (
    <form action={action} className="space-y-2 md:space-y-4">
      <div className="grid gap-2 md:grid-cols-2 md:gap-4">
        <Field label="РџР†Р‘ / РЅР°Р·РІР°">
          <Input name="name" required defaultValue={worker?.name ?? ""} />
        </Field>
        <Field label="РўРµР»РµС„РѕРЅ">
          <Input name="phone" defaultValue={worker?.phone ?? ""} />
        </Field>
        <Field label="Telegram username">
          <Input name="telegram_username" placeholder="username Р±РµР· @" defaultValue={worker?.telegram_username ?? ""} />
        </Field>
        <Field label="Telegram ID">
          <Input name="telegram_id" defaultValue={worker?.telegram_id ?? ""} />
        </Field>
      </div>
      <Field label="РќРѕС‚Р°С‚РєРё">
        <Textarea name="notes" defaultValue={worker?.notes ?? ""} />
      </Field>
      <div className="space-y-2">
        <Label>РљР°С‚РµРіРѕСЂС–С—</Label>
        <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-1.5 rounded-md border border-border bg-stone-950/30 px-2 py-1.5 text-[10px] md:gap-2 md:px-3 md:py-2 md:text-sm">
              <input name="categoryIds" type="checkbox" value={category.id} defaultChecked={selected.has(category.id)} className="h-4 w-4 accent-orange-500" />
              <span className="min-w-0 break-words">{category.name}</span>
            </label>
          ))}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input name="is_active" type="checkbox" defaultChecked={worker?.is_active ?? true} className="h-4 w-4 accent-orange-500" />
        РђРєС‚РёРІРЅРёР№
      </label>
      <div className="grid gap-2 md:flex md:flex-wrap">
        <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">{submitLabel}</Button>
        {cancelHref ? (
          <Button asChild type="button" variant="outline" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">
            <Link href={cancelHref}>РЎРєР°СЃСѓРІР°С‚Рё</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}


