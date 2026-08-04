import type { DirectorAnalyticsCategory } from "@/components/director/director-preview-sections";
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
  analytics: {
    total: number;
    categories: DirectorAnalyticsCategory[];
  };
};

function dateYYYYMMDD(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildAnalytics(tickets: DirectorTicketReportRow[]) {
  const categories = new Map<string, { id: string; name: string; count: number }>();
  for (const ticket of tickets) {
    const id = ticket.category?.id ?? "none";
    const name = ticket.category?.name ?? "Без категорії";
    const current = categories.get(id) ?? { id, name, count: 0 };
    current.count += 1;
    categories.set(id, current);
  }
  const total = tickets.length;
  return {
    total,
    categories: Array.from(categories.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
      .map((category) => ({
        ...category,
        percent: total ? Math.round((category.count / total) * 100) : 0,
      })),
  };
}

export async function getDirectorDashboardOverview(profile: Profile): Promise<QueryResult<DirectorDashboardOverview | null>> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [metaResult, ticketsResult, actsResult, analyticsTicketsResult] = await Promise.all([
    measureAsync("director-dashboard:profile", () => getDirectorTicketReportMeta(profile.id)),
    measureAsync("director-dashboard:tickets-preview", () => getDirectorTicketsReport(profile.id, { limit: 5 })),
    measureAsync("director-dashboard:acts-preview", () => getDirectorActs(profile.id, { period: "current_month", limit: 3 })),
    measureAsync("director-dashboard:analytics", () => getDirectorTicketsReport(profile.id, { createdFrom: dateYYYYMMDD(thirtyDaysAgo), limit: 2000 })),
  ]);

  const error = metaResult.error ?? ticketsResult.error ?? actsResult.error ?? analyticsTicketsResult.error;
  if (error) return { data: null, error };

  const tickets = ticketsResult.data;

  return {
    data: {
      profile,
      objects: metaResult.data.objects,
      activeCount: 0,
      ticketsPreview: tickets.slice(0, 5),
      actsPreview: actsResult.data.slice(0, 3),
      analytics: buildAnalytics(analyticsTicketsResult.data),
    },
    error: null,
  };
}
