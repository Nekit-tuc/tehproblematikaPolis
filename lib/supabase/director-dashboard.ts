import { measureAsync } from "@/lib/performance";
import { getDirectorTicketReportMeta, getDirectorTicketsReport, type DirectorTicketReportRow } from "@/lib/supabase/director-ticket-reports";
import { getDirectorActs } from "@/lib/supabase/work-completion-acts";
import type { CompanyObject, Profile, WorkCompletionActWithRelations } from "@/types/domain";
import type { QueryResult } from "./queries";

export type DirectorDashboardOverview = {
  profile: Profile;
  objects: CompanyObject[];
  activeCount: number;
  ticketsPreview: DirectorTicketReportRow[];
  actsPreview: WorkCompletionActWithRelations[];
};

export async function getDirectorDashboardOverview(profile: Profile): Promise<QueryResult<DirectorDashboardOverview | null>> {
  const [metaResult, ticketsResult, actsResult] = await Promise.all([
    measureAsync("director-dashboard:profile", () => getDirectorTicketReportMeta(profile.id)),
    measureAsync("director-dashboard:tickets-preview", () => getDirectorTicketsReport(profile.id, { limit: 5 })),
    measureAsync("director-dashboard:acts-preview", () => getDirectorActs(profile.id, { period: "current_month", limit: 3 })),
  ]);

  const error = metaResult.error ?? ticketsResult.error ?? actsResult.error;
  if (error) return { data: null, error };

  return {
    data: {
      profile,
      objects: metaResult.data.objects,
      activeCount: 0,
      ticketsPreview: ticketsResult.data.slice(0, 5),
      actsPreview: actsResult.data.slice(0, 3),
    },
    error: null,
  };
}
