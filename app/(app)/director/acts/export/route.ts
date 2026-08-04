import { NextResponse } from "next/server";
import { requireApprovedDirector } from "@/lib/auth/server";
import { parseActFilters, actPeriodLabel } from "@/lib/reports/director-export-filters";
import { workbookToBuffer, XLSX_CONTENT_TYPE } from "@/lib/reports/excel";
import { buildActsListWorkbook, safeExportPart } from "@/lib/reports/work-completion-acts-list-export";
import { measureAsync } from "@/lib/performance";
import { getDirectorActs } from "@/lib/supabase/work-completion-acts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { profile } = await requireApprovedDirector();
  const url = new URL(request.url);
  const filters = parseActFilters(Object.fromEntries(url.searchParams.entries()), "current_month");
  const result = await measureAsync("director-acts:export", () => getDirectorActs(profile.id, { ...filters, limit: 2000 }));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  const period = actPeriodLabel(filters, "current_month");
  const workbook = buildActsListWorkbook(result.data, "director", period);
  const buffer = await workbookToBuffer(workbook);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="director-acts-${safeExportPart(period)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
