import type React from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TH, THead, TBody, TR, Table } from "@/components/ui/table";
import { objectTypeLabels } from "@/lib/labels";
import { requireRole } from "@/lib/auth/server";
import { getObjects, getProfiles } from "@/lib/supabase/queries";
import type { CompanyObject, ObjectType, Profile } from "@/types/domain";
import { CreateObjectForm } from "./create-object-form";
import { setObjectActiveAction, updateObjectAction } from "./actions";
import { ObjectRow } from "./object-row";

const objectTypes: ObjectType[] = ["store", "warehouse", "production", "office", "other"];

function getObjectNumber(object: CompanyObject) {
  return object.object_number || object.id.slice(0, 8);
}

function getObjectDistrict(object: CompanyObject) {
  return object.district ?? "";
}

function getObjectTypeLabel(type: CompanyObject["type"]) {
  return objectTypeLabels[type] ?? type;
}

function getNextObjectNumber(objects: CompanyObject[]) {
  const numericNumbers = objects
    .map((object) => object.object_number)
    .filter((value): value is string => typeof value === "string" && /^\d+$/.test(value.trim()));
  if (numericNumbers.length === 0) return "";

  const max = numericNumbers.reduce(
    (current, value) => {
      const number = Number.parseInt(value, 10);
      return number > current.number ? { number, width: value.length } : current;
    },
    { number: 0, width: 1 },
  );
  return String(max.number + 1).padStart(max.width, "0");
}

function getDistricts(objects: CompanyObject[]) {
  return [...new Set(objects.map((object) => getObjectDistrict(object).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "uk"));
}

function filterObjects(objects: CompanyObject[], filters: { q?: string; type?: string; status?: string; district?: string }) {
  const query = filters.q?.trim().toLowerCase();
  return objects.filter((object) => {
    if (filters.type && filters.type !== "all" && object.type !== filters.type) return false;
    if (filters.status === "active" && !object.is_active) return false;
    if (filters.status === "inactive" && object.is_active) return false;
    if (filters.district && filters.district !== "all" && getObjectDistrict(object) !== filters.district) return false;
    if (!query) return true;
    return [object.name, getObjectNumber(object), object.address, object.city, getObjectDistrict(object), ...(object.aliases ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

export default async function ObjectsPage({ searchParams }: { searchParams: Promise<{ q?: string; type?: string; status?: string; district?: string; error?: string; success?: string; view?: string; page?: string }> }) {
  const { profile } = await requireRole(["admin", "management", "tech_manager"]);
  const params = await searchParams;
  const [objectsResult, profilesResult] = await Promise.all([getObjects(), getProfiles()]);
  const error = objectsResult.error ?? profilesResult.error ?? (params.error ? decodeURIComponent(params.error) : null);
  const filteredObjects = filterObjects(objectsResult.data, {
    q: params.q,
    type: params.type ?? "all",
    status: params.status ?? "active",
    district: params.district ?? "all",
  });
  const managers = profilesResult.data.filter((item) => item.role === "store_manager" || item.role === "management" || item.role === "tech_manager" || item.role === "admin");
  const canManage = profile.role === "admin";
  const nextObjectNumber = getNextObjectNumber(objectsResult.data);
  const districts = getDistricts(objectsResult.data);
  const mobileView = params.view === "table" ? "table" : "cards";
  const pageSize = 25;
  const currentPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const totalPages = Math.max(1, Math.ceil(filteredObjects.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pagedObjects = filteredObjects.slice((safePage - 1) * pageSize, safePage * pageSize);
  const mobileHref = (updates: Record<string, string | number | undefined>) => {
    const next = new URLSearchParams();
    for (const key of ["q", "type", "status", "district", "view", "page"] as const) {
      const value = params[key];
      if (value && value !== "all") next.set(key, value);
    }
    for (const [key, value] of Object.entries(updates)) {
      if (!value || value === "all" || (key === "page" && Number(value) <= 1)) next.delete(key);
      else next.set(key, String(value));
    }
    const search = next.toString();
    return search ? `/objects?${search}` : "/objects";
  };

  return (
    <div className="page-shell space-y-2.5 md:space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">РћР±'С”РєС‚Рё РєРѕРјРїР°РЅС–С—</h1>
        <p className="subtle">Р”РѕРІС–РґРЅРёРє РјР°РіР°Р·РёРЅС–РІ, СЃРєР»Р°РґС–РІ, РІРёСЂРѕР±РЅРёС†С‚РІР°, РѕС„С–СЃС–РІ С‚Р° С–РЅС€РёС… Р»РѕРєР°С†С–Р№.</p>
      </div>
      {error ? <Alert title="РџРѕРјРёР»РєР° РґРѕРІС–РґРЅРёРєР° РѕР±'С”РєС‚С–РІ">{error}</Alert> : null}
      {params.success === "created" ? <Alert title="РћР±'С”РєС‚ СЃС‚РІРѕСЂРµРЅРѕ">РќРѕРІРёР№ РѕР±'С”РєС‚ РґРѕРґР°РЅРѕ РґРѕ РґРѕРІС–РґРЅРёРєР°.</Alert> : null}
      {params.success === "updated" ? <Alert title="РћР±'С”РєС‚ РѕРЅРѕРІР»РµРЅРѕ">Р—РјС–РЅРё Р·Р±РµСЂРµР¶РµРЅРѕ.</Alert> : null}
      {params.success === "activated" ? <Alert title="РћР±'С”РєС‚ Р°РєС‚РёРІРѕРІР°РЅРѕ">РЎС‚Р°С‚СѓСЃ РѕР±'С”РєС‚Р° Р·РјС–РЅРµРЅРѕ РЅР° Р°РєС‚РёРІРЅРёР№.</Alert> : null}
      {params.success === "deactivated" ? <Alert title="РћР±'С”РєС‚ РґРµР°РєС‚РёРІРѕРІР°РЅРѕ">РћР±'С”РєС‚ РїСЂРёС…РѕРІР°РЅРѕ Р· Р°РєС‚РёРІРЅРѕРіРѕ РґРѕРІС–РґРЅРёРєР° Р±РµР· РІРёРґР°Р»РµРЅРЅСЏ Р·Р°СЏРІРѕРє.</Alert> : null}

      {canManage ? (
        <details className="mobile-card p-2.5 md:hidden">
          <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg bg-orange-500 px-3 text-[11px] font-semibold text-stone-950">
            Р”РѕРґР°С‚Рё РІ Р±Р°Р·Сѓ РЅРѕРІРёР№ РѕР±'С”РєС‚
            <span className="text-lg leading-none">+</span>
          </summary>
          <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2">
            <CreateObjectForm managers={managers} nextObjectNumber={nextObjectNumber} districts={districts} />
          </div>
        </details>
      ) : null}

      {canManage ? (
        <Card className="hidden rounded-3xl border-white/10 bg-white/[0.04] md:block md:rounded-lg">
          <CardHeader>
            <CardTitle>РќРѕРІРёР№ РѕР±'С”РєС‚</CardTitle>
            <CardDescription>РћР±РѕРІ'СЏР·РєРѕРІС– РїРѕР»СЏ: РЅР°Р·РІР°, С‚РёРї, РЅРѕРјРµСЂ, РјС–СЃС‚Рѕ/СЂР°Р№РѕРЅ С‚Р° Р°РґСЂРµСЃР°.</CardDescription>
          </CardHeader>
          <CardContent>
            <CreateObjectForm managers={managers} nextObjectNumber={nextObjectNumber} districts={districts} />
          </CardContent>
        </Card>
      ) : null}

      <details className="mobile-card p-2 md:hidden">
        <summary className="flex min-h-9 cursor-pointer list-none items-center justify-between rounded-lg bg-white/[0.04] px-3 text-[12px] font-semibold text-orange-200">
          Р¤С–Р»СЊС‚СЂРё
          <span className="text-xs text-stone-500">{filteredObjects.length}</span>
        </summary>
        <form className="mt-3 grid gap-3">
          <Field label="РџРѕС€СѓРє"><Input name="q" defaultValue={params.q ?? ""} placeholder="РќР°Р·РІР°, РЅРѕРјРµСЂ, Р°РґСЂРµСЃР°, РјС–СЃС‚Рѕ" className="min-h-8 rounded-lg text-[10px]" /></Field>
          <Field label="РўРёРї">
            <Select name="type" defaultValue={params.type ?? "all"}>
              <option value="all">Р’СЃС–</option>
              {objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="РЎС‚Р°С‚СѓСЃ">
              <Select name="status" defaultValue={params.status ?? "active"}>
                <option value="active">РђРєС‚РёРІРЅС–</option>
                <option value="inactive">РќРµР°РєС‚РёРІРЅС–</option>
                <option value="all">Р’СЃС–</option>
              </Select>
            </Field>
            <Field label="Р Р°Р№РѕРЅ">
              <Select name="district" defaultValue={params.district ?? "all"}>
                <option value="all">Р’СЃС– СЂР°Р№РѕРЅРё</option>
                {districts.map((district) => <option key={district} value={district}>{district}</option>)}
              </Select>
            </Field>
          </div>
          {mobileView === "table" ? <input type="hidden" name="view" value="table" /> : null}
          <div className="grid grid-cols-2 gap-2">
            <Button type="submit" className="min-h-8 rounded-lg text-[10px]">Р—Р°СЃС‚РѕСЃСѓРІР°С‚Рё</Button>
            <Button variant="outline" asChild className="min-h-8 rounded-lg text-[10px]"><a href="/objects">РЎРєРёРЅСѓС‚Рё</a></Button>
          </div>
        </form>
      </details>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Р¤С–Р»СЊС‚СЂРё</CardTitle>
          <CardDescription>РџРѕС€СѓРє РїСЂР°С†СЋС” РїРѕ РЅР°Р·РІС–, РЅРѕРјРµСЂСѓ, Р°РґСЂРµСЃС– С‚Р° РјС–СЃС‚Сѓ.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-5">
            <Field label="РџРѕС€СѓРє"><Input name="q" defaultValue={params.q ?? ""} placeholder="РќР°Р·РІР°, РЅРѕРјРµСЂ, Р°РґСЂРµСЃР°, РјС–СЃС‚Рѕ" /></Field>
            <Field label="РўРёРї">
              <Select name="type" defaultValue={params.type ?? "all"}>
                <option value="all">Р’СЃС–</option>
                {objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}
              </Select>
            </Field>
            <Field label="РЎС‚Р°С‚СѓСЃ">
              <Select name="status" defaultValue={params.status ?? "active"}>
                <option value="active">РђРєС‚РёРІРЅС–</option>
                <option value="inactive">РќРµР°РєС‚РёРІРЅС–</option>
                <option value="all">Р’СЃС–</option>
              </Select>
            </Field>
            <Field label="Р Р°Р№РѕРЅ">
              <Select name="district" defaultValue={params.district ?? "all"}>
                <option value="all">Р’СЃС– СЂР°Р№РѕРЅРё</option>
                {districts.map((district) => <option key={district} value={district}>{district}</option>)}
              </Select>
            </Field>
            <div className="flex flex-col gap-2 md:flex-row md:items-end">
              <Button type="submit" className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md">Р—Р°СЃС‚РѕСЃСѓРІР°С‚Рё</Button>
              <Button variant="outline" asChild className="min-h-11 rounded-2xl md:min-h-0 md:rounded-md"><a href="/objects">РЎРєРёРЅСѓС‚Рё</a></Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <details className="mobile-card p-2 md:hidden">
        <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-2xl bg-white/[0.04] px-3 text-sm font-semibold text-orange-200">
          Р’РёРіР»СЏРґ
          <span className="text-xs text-stone-500">{mobileView === "table" ? "РўР°Р±Р»РёС†СЏ" : "РљР°СЂС‚РєРё"}</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button asChild variant={mobileView === "cards" ? "default" : "outline"} size="sm" className="min-h-8 rounded-lg text-[10px]">
            <a href={mobileHref({ view: undefined, page: 1 })}>РљР°СЂС‚РєРё</a>
          </Button>
          <Button asChild variant={mobileView === "table" ? "default" : "outline"} size="sm" className="min-h-8 rounded-lg text-[10px]">
            <a href={mobileHref({ view: "table", page: 1 })}>РўР°Р±Р»РёС†СЏ</a>
          </Button>
        </div>
      </details>

      <div className="space-y-3 md:hidden">
        {filteredObjects.length === 0 ? (
          <div className="mobile-card p-3 text-[11px] text-stone-500">РћР±'С”РєС‚С–РІ Р·Р° С†РёРјРё С„С–Р»СЊС‚СЂР°РјРё РЅРµРјР°С”.</div>
        ) : mobileView === "table" ? (
          <div className="max-w-full overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.04]">
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-white/[0.04] text-muted-foreground">
                <tr>
                  <th className="px-3 py-3">в„–</th>
                  <th className="px-3 py-3">РќР°Р·РІР°</th>
                  <th className="px-3 py-3">РўРёРї</th>
                  <th className="px-3 py-3">Р Р°Р№РѕРЅ</th>
                  <th className="px-3 py-3">РђРґСЂРµСЃР°</th>
                  <th className="px-3 py-3">РЎС‚Р°С‚СѓСЃ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredObjects.map((object) => (
                  <tr key={object.id}>
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-orange-200">{getObjectNumber(object)}</td>
                    <td className="max-w-[180px] px-3 py-3"><div className="line-clamp-2 break-words">{object.name}</div></td>
                    <td className="px-3 py-3">{getObjectTypeLabel(object.type)}</td>
                    <td className="max-w-[140px] px-3 py-3"><div className="line-clamp-2 break-words">{getObjectDistrict(object) || "-"}</div></td>
                    <td className="max-w-[220px] px-3 py-3"><div className="line-clamp-2 break-words">{object.address}</div></td>
                    <td className="px-3 py-3"><Badge tone={object.is_active ? "green" : "gray"}>{object.is_active ? "РђРєС‚РёРІРЅРёР№" : "РќРµР°РєС‚РёРІРЅРёР№"}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <>
            {pagedObjects.map((object) => (
              <MobileObjectCard key={object.id} object={object} managers={managers} canManage={canManage} districts={districts} />
            ))}
            {totalPages > 1 ? (
              <div className="mobile-card flex items-center justify-between gap-2 p-3 text-sm">
                {safePage > 1 ? (
                  <Button asChild variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px]">
                    <a href={mobileHref({ page: safePage - 1 })}>РќР°Р·Р°Рґ</a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px]" disabled>РќР°Р·Р°Рґ</Button>
                )}
                <span className="text-stone-400">РЎС‚РѕСЂС–РЅРєР° {safePage} Р· {totalPages}</span>
                {safePage < totalPages ? (
                  <Button asChild variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px]">
                    <a href={mobileHref({ page: safePage + 1 })}>Р”Р°Р»С–</a>
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="min-h-8 rounded-lg text-[10px]" disabled>Р”Р°Р»С–</Button>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>

      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Р”РѕРІС–РґРЅРёРє РѕР±'С”РєС‚С–РІ</CardTitle>
          <CardDescription>Р—РЅР°Р№РґРµРЅРѕ: {filteredObjects.length}</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredObjects.length === 0 ? (
            <p className="text-sm text-muted-foreground">РћР±'С”РєС‚С–РІ Р·Р° С†РёРјРё С„С–Р»СЊС‚СЂР°РјРё РЅРµРјР°С”.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>РќР°Р·РІР°</TH><TH>в„–</TH><TH>РўРёРї</TH><TH>РњС–СЃС‚Рѕ / СЂР°Р№РѕРЅ</TH><TH>РђРґСЂРµСЃР°</TH><TH>РљРµСЂСѓСЋС‡РёР№</TH><TH>РЎС‚Р°С‚СѓСЃ</TH>
                </TR>
              </THead>
              <TBody>
                {filteredObjects.map((object) => (
                  <ObjectRow key={object.id} object={object} managers={managers} canManage={canManage} districts={districts} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-2"><Label>{label}</Label>{children}</div>;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className="h-10 w-full rounded-md border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring">{children}</select>;
}

function MobileObjectCard({ object, managers, canManage, districts }: { object: CompanyObject; managers: Profile[]; canManage: boolean; districts: string[] }) {
  const manager = managers.find((item) => item.id === object.manager_id);

  return (
    <div className="mobile-card p-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-orange-300">в„– {getObjectNumber(object)}</div>
          <h2 className="mt-1 text-base font-semibold">{object.name}</h2>
          <p className="mt-1 text-sm text-stone-400">{object.address}</p>
          <p className="mt-1 text-xs text-stone-500">{object.city}{getObjectDistrict(object) ? ` В· ${getObjectDistrict(object)}` : ""}</p>
        </div>
        <Badge tone={object.is_active ? "green" : "gray"}>{object.is_active ? "РђРєС‚РёРІРЅРёР№" : "РќРµР°РєС‚РёРІРЅРёР№"}</Badge>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5 text-[10px]">
        <Info label="РўРёРї" value={getObjectTypeLabel(object.type)} />
        <Info label="РљРµСЂСѓСЋС‡РёР№" value={manager?.full_name ?? "-"} />
      </div>
      {canManage ? (
        <div className="mt-2 space-y-1.5">
          <form action={setObjectActiveAction.bind(null, object.id, !object.is_active)}>
            <Button type="submit" variant="outline" className="min-h-11 w-full rounded-2xl">
              {object.is_active ? "Р—СЂРѕР±РёС‚Рё РЅРµР°РєС‚РёРІРЅРёРј" : "РђРєС‚РёРІСѓРІР°С‚Рё"}
            </Button>
          </form>
          <details className="rounded-2xl border border-white/10 bg-black/20 p-3">
            <summary className="cursor-pointer list-none text-sm font-medium text-orange-200">Р РµРґР°РіСѓРІР°С‚Рё</summary>
            <form action={updateObjectAction.bind(null, object.id)} className="mt-4 grid gap-3">
              <Field label="РќР°Р·РІР°"><Input name="name" required defaultValue={object.name} /></Field>
              <Field label="РўРёРї"><Select name="type" required defaultValue={object.type}>{objectTypes.map((type) => <option key={type} value={type}>{getObjectTypeLabel(type)}</option>)}</Select></Field>
              <Field label="РќРѕРјРµСЂ"><Input name="object_number" required defaultValue={getObjectNumber(object)} /></Field>
              <Field label="РњС–СЃС‚Рѕ"><Input name="city" required defaultValue={object.city} /></Field>
              <Field label="Р Р°Р№РѕРЅ">
                <Select name="district" defaultValue={getObjectDistrict(object)}>
                  <option value="">РќРµ РІРёР±СЂР°РЅРѕ</option>
                  {districts.map((district) => <option key={district} value={district}>{district}</option>)}
                </Select>
              </Field>
              <Field label="Р†РЅС€РёР№ СЂР°Р№РѕРЅ"><Input name="other_district" /></Field>
              <Field label="РђРґСЂРµСЃР°"><Input name="address" required defaultValue={object.address} /></Field>
              <Field label="РђР»С–Р°СЃРё"><textarea name="aliases" defaultValue={object.aliases?.join("\n") ?? ""} className="min-h-28 w-full rounded-2xl border border-input bg-stone-950/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" /></Field>
              <Field label="РљРµСЂСѓСЋС‡РёР№">
                <Select name="manager_id" defaultValue={object.manager_id ?? ""}>
                  <option value="">РќРµ РїСЂРёР·РЅР°С‡РµРЅРѕ</option>
                  {managers.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}
                </Select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input name="is_active" type="checkbox" defaultChecked={object.is_active} className="h-4 w-4 accent-orange-500" />
                РђРєС‚РёРІРЅРёР№
              </label>
              <Button type="submit" className="min-h-8 rounded-lg text-[10px]">Р—Р±РµСЂРµРіС‚Рё</Button>
            </form>
          </details>
        </div>
      ) : null}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="mt-1 truncate text-sm">{value}</div>
    </div>
  );
}

