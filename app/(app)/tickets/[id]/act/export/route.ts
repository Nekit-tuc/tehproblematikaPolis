import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/server";
import { XLSX_CONTENT_TYPE } from "@/lib/reports/excel";
import { buildWorkCompletionActWorkbook, safeActFilename } from "@/lib/reports/work-completion-act-export";

export const runtime = "nodejs";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  await requireAuth();
  const { id } = await params;
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
