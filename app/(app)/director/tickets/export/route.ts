import { NextResponse } from "next/server";
import { requireApprovedDirector } from "@/lib/auth/server";
import { parseDirectorTicketFilters, ticketPeriodLabel } from "@/lib/reports/director-export-filters";
import { buildDirectorTicketsWorkbook } from "@/lib/reports/director-ticket-list-export";
import { workbookToBuffer, XLSX_CONTENT_TYPE } from "@/lib/reports/excel";
import { safeExportPart } from "@/lib/reports/work-completion-acts-list-export";
import { measureAsync } from "@/lib/performance";
import { getDirectorTicketsReport } from "@/lib/supabase/director-ticket-reports";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { profile } = await requireApprovedDirector();
  const url = new URL(request.url);
  const filters = parseDirectorTicketFilters(Object.fromEntries(url.searchParams.entries()));
  const result = await measureAsync("director-tickets:export", () => getDirectorTicketsReport(profile.id, { ...filters, limit: 2000 }));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  const period = ticketPeriodLabel(filters);
  const workbook = buildDirectorTicketsWorkbook(result.data, period);
  const buffer = await workbookToBuffer(workbook);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="director-tickets-${safeExportPart(period)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
