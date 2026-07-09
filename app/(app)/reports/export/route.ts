import * as XLSX from "xlsx";
import { NextResponse, type NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { buildReportsWorkbook, filterTickets, type ReportFilters } from "@/lib/reports/analytics";
import { getCategories, getObjects, getProfiles, getTickets } from "@/lib/supabase/queries";
import type { TicketPriority, TicketStatus } from "@/types/domain";

function filtersFromUrl(request: NextRequest): ReportFilters {
  const params = request.nextUrl.searchParams;
  return {
    from: params.get("from") || undefined,
    to: params.get("to") || undefined,
    status: (params.get("status") || "") as TicketStatus | "",
    categoryId: params.get("categoryId") || undefined,
    objectId: params.get("objectId") || undefined,
    assigneeId: params.get("assigneeId") || undefined,
    priority: (params.get("priority") || "") as TicketPriority | "",
  };
}

export async function GET(request: NextRequest) {
  await requireRole(["admin", "management", "tech_manager"]);
  const [ticketsResult, objectsResult, profilesResult, categoriesResult] = await Promise.all([
    getTickets({ limit: null }),
    getObjects(),
    getProfiles(),
    getCategories(),
  ]);
  const error = ticketsResult.error ?? objectsResult.error ?? profilesResult.error ?? categoriesResult.error;
  if (error) return NextResponse.json({ error }, { status: 400 });

  const tickets = filterTickets(ticketsResult.data, filtersFromUrl(request));
  const workbook = buildReportsWorkbook({
    tickets,
    objects: objectsResult.data,
    profiles: profilesResult.data,
    categories: categoriesResult.data,
  });
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx", cellDates: true });

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="polissya-service-desk-report.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
