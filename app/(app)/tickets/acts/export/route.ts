import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/server";
import { parseActFilters, actPeriodLabel } from "@/lib/reports/director-export-filters";
import { workbookToBuffer, XLSX_CONTENT_TYPE } from "@/lib/reports/excel";
import { buildActsListWorkbook, safeExportPart } from "@/lib/reports/work-completion-acts-list-export";
import { measureAsync } from "@/lib/performance";
import { getAdminActs } from "@/lib/supabase/work-completion-acts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  await requireRole(["admin", "management", "tech_manager"]);
  const url = new URL(request.url);
  const filters = parseActFilters(Object.fromEntries(url.searchParams.entries()), "this_week");
  const result = await measureAsync("admin-acts:export", () => getAdminActs({ ...filters, limit: 2000 }));
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 });

  const period = actPeriodLabel(filters, "this_week");
  const workbook = buildActsListWorkbook(result.data, "admin", period);
  const buffer = await workbookToBuffer(workbook);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="admin-acts-${safeExportPart(period)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
