import ExcelJS from "exceljs";

export const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type ReportColumn = {
  header: string;
  width?: number;
};

type CellValue = string | number | Date | null | undefined;

const border: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFE5E7EB" } },
  left: { style: "thin", color: { argb: "FFE5E7EB" } },
  bottom: { style: "thin", color: { argb: "FFE5E7EB" } },
  right: { style: "thin", color: { argb: "FFE5E7EB" } },
};

export function safeWorksheetName(value: string, fallback = "Report") {
  const name = value
    .replace(/[*?:\\/[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return name || fallback;
}

export function createReportWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Polissya Service Desk AI";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.properties.date1904 = false;
  return workbook;
}

export function setupWorksheet(worksheet: ExcelJS.Worksheet, columns: ReportColumn[]) {
  worksheet.columns = columns.map((column) => ({ header: column.header, key: column.header, width: column.width ?? 18 }));
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
    margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 },
  };
}

export function addTitle(worksheet: ExcelJS.Worksheet, title: string, subtitle: string, columnCount: number) {
  worksheet.insertRow(1, [title]);
  worksheet.insertRow(2, [subtitle]);
  worksheet.insertRow(3, []);
  worksheet.mergeCells(1, 1, 1, columnCount);
  worksheet.mergeCells(2, 1, 2, columnCount);

  const titleRow = worksheet.getRow(1);
  titleRow.height = 24;
  titleRow.font = { bold: true, size: 16, color: { argb: "FF111827" } };
  titleRow.alignment = { vertical: "middle", horizontal: "left" };

  const subtitleRow = worksheet.getRow(2);
  subtitleRow.font = { size: 10, color: { argb: "FF6B7280" } };
  subtitleRow.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
}

export function addTable(worksheet: ExcelJS.Worksheet, columns: ReportColumn[], rows: CellValue[][], options?: { title?: string }) {
  if (options?.title) {
    const titleRow = worksheet.addRow([options.title]);
    titleRow.font = { bold: true, size: 12, color: { argb: "FF111827" } };
    worksheet.mergeCells(titleRow.number, 1, titleRow.number, Math.max(1, columns.length));
  }

  const headerRow = worksheet.addRow(columns.map((column) => column.header));
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 24;

  rows.forEach((row, index) => {
    const excelRow = worksheet.addRow(row.map((cell) => cell ?? ""));
    excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: index % 2 === 0 ? "FFFFFFFF" : "FFF9FAFB" } };
    excelRow.alignment = { vertical: "top", wrapText: true };
  });

  const startRow = headerRow.number;
  const endRow = Math.max(headerRow.number, worksheet.rowCount);
  worksheet.autoFilter = { from: { row: startRow, column: 1 }, to: { row: endRow, column: columns.length } };
  worksheet.views = [{ state: "frozen", ySplit: startRow }];

  for (let rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    const row = worksheet.getRow(rowIndex);
    row.eachCell((cell) => {
      cell.border = border;
      cell.alignment = { vertical: rowIndex === startRow ? "middle" : "top", horizontal: rowIndex === startRow ? "center" : "left", wrapText: true };
    });
  }

  worksheet.addRow([]);
}

export function addKeyValueSection(worksheet: ExcelJS.Worksheet, title: string, rows: CellValue[][]) {
  addTable(
    worksheet,
    [
      { header: "Показник", width: 26 },
      { header: "Значення", width: 18 },
      { header: "Коментар", width: 48 },
    ],
    rows,
    { title },
  );
}

export function formatDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export async function workbookToBuffer(workbook: ExcelJS.Workbook) {
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer as ArrayBuffer);
}