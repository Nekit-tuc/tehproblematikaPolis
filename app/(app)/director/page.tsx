import { Alert } from "@/components/ui/alert";
import { DirectorHeader } from "@/components/director/director-header";
import { DirectorHeroCard } from "@/components/director/director-hero-card";
import { DirectorActsPreview, DirectorTicketsPreview } from "@/components/director/director-preview-sections";
import { DirectorPageShell } from "@/components/director/director-shell";
import { requireApprovedDirector } from "@/lib/auth/server";
import { getDirectorDashboardOverview } from "@/lib/supabase/director-dashboard";

export default async function DirectorHomePage() {
  const { profile } = await requireApprovedDirector();
  const overviewResult = await getDirectorDashboardOverview(profile);
  const overview = overviewResult.data;

  return (
    <DirectorPageShell>
      <DirectorHeader profile={profile} activeCount={overview?.activeCount ?? 0} />
      {overviewResult.error ? <Alert title="Помилка">{overviewResult.error}</Alert> : null}
      {overview ? (
        <>
          <DirectorHeroCard profile={profile} objects={overview.objects} />
          <DirectorTicketsPreview tickets={overview.ticketsPreview} />
          <DirectorActsPreview acts={overview.actsPreview} />
        </>
      ) : (
        <div className="rounded-[24px] border border-white/[0.08] bg-zinc-900/75 p-4 text-[13px] leading-5 text-zinc-400">
          Дані кабінету поки недоступні.
        </div>
      )}
    </DirectorPageShell>
  );
}
