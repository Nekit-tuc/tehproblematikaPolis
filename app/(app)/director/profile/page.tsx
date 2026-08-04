import type { ReactNode } from "react";
import { Phone, Store, UserRound } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { DirectorHeader } from "@/components/director/director-header";
import { DirectorGlassCard, DirectorPageShell } from "@/components/director/director-shell";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorTicketReportMeta } from "@/lib/supabase/director-ticket-reports";

export default async function DirectorProfilePage() {
  const { profile } = await requireApprovedDirector();
  const metaResult = await getDirectorTicketReportMeta(profile.id);

  return (
    <DirectorPageShell>
      <DirectorHeader profile={profile} activeCount={0} />
      {metaResult.error ? <Alert title="Помилка">{metaResult.error}</Alert> : null}
      <DirectorGlassCard className="p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-gradient-to-br from-zinc-700 to-zinc-950 text-xl font-black text-zinc-100">
            {profile.full_name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "Д"}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black text-zinc-50">{profile.full_name}</h1>
            <p className="mt-1 text-sm text-zinc-400">Директор магазину</p>
          </div>
        </div>
      </DirectorGlassCard>

      <DirectorGlassCard className="p-4">
        <h2 className="text-lg font-black text-zinc-50">Дані профілю</h2>
        <div className="mt-3 space-y-2">
          <Info icon={<UserRound className="h-4 w-4" />} label="Статус" value="Підтверджений акаунт" />
          <Info icon={<Phone className="h-4 w-4" />} label="Телефон" value={profile.phone ?? "Не вказано"} />
          <Info icon={<Store className="h-4 w-4" />} label="Магазини" value={`${metaResult.data.objects.length}`} />
        </div>
      </DirectorGlassCard>

      <DirectorGlassCard className="p-4">
        <h2 className="text-lg font-black text-zinc-50">Мої магазини</h2>
        <div className="mt-3 space-y-2">
          {metaResult.data.objects.length ? metaResult.data.objects.map((object) => (
            <div key={object.id} className="rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-sm font-bold text-zinc-100">{object.name || "Магазин"}</div>
              <div className="mt-1 text-xs text-zinc-500">{object.address || "Адресу не вказано"}</div>
            </div>
          )) : <p className="text-sm text-zinc-500">Підтверджених магазинів поки немає.</p>}
        </div>
      </DirectorGlassCard>
    </DirectorPageShell>
  );
}

function Info({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <span className="text-orange-300">{icon}</span>
      <div>
        <div className="text-xs text-zinc-500">{label}</div>
        <div className="text-sm font-semibold text-zinc-100">{value}</div>
      </div>
    </div>
  );
}
