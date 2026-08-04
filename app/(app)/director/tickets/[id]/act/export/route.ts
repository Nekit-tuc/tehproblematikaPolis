import { NextResponse } from "next/server";
import { requireApprovedDirector } from "@/lib/auth/server";
import { XLSX_CONTENT_TYPE } from "@/lib/reports/excel";
import { buildWorkCompletionActWorkbook, safeActFilename } from "@/lib/reports/work-completion-act-export";
import { getDirectorTicket } from "@/lib/supabase/director-queries";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { profile } = await requireApprovedDirector();
  const { id } = await params;
  const ticketResult = await getDirectorTicket(profile.id, id);
  if (!ticketResult.data) return NextResponse.json({ error: ticketResult.error ?? "Заявку не знайдено." }, { status: 404 });

  const result = await buildWorkCompletionActWorkbook(id);
  if (!result.workbook) return NextResponse.json({ error: result.error }, { status: result.status });

  const buffer = await result.workbook.xlsx.writeBuffer();
  return new NextResponse(Buffer.from(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="act-${safeActFilename(result.actNumber)}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
