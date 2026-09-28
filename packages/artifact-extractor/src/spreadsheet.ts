import ExcelJS from "exceljs";
import { finish, splitUnits, type Parsed, type Unit } from "./types.ts";

export async function extractSpreadsheet(bytes: Uint8Array): Promise<Parsed> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  const units: Unit[] = [];
  const omitted: Parsed["coverage"]["omitted"] = [];
  let cells = 0;
  for (const [sheetIndex, sheet] of workbook.worksheets.entries()) {
    if (sheetIndex >= 20) { omitted.push({ kind: "sheet", count: 1, reason: "sheet_limit" }); continue; }
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, column) => {
        cells += 1;
        if (cells > 50_000) return;
        const value = cell.value ?? (cell.isMerged ? cell.master?.value : null);
        const formula = value && typeof value === "object" && "formula" in value ? String(value.formula) : null;
        const result = value && typeof value === "object" && "result" in value ? value.result : undefined;
        const content = String(result ?? (typeof value === "object" && value !== null && "text" in value ? value.text : value) ?? "");
        if (!content) return;
        const master = cell.isMerged ? cell.master : null;
        const mergedRange = cell.isMerged ? master?.address : undefined;
        units.push(...splitUnits(content, {
          kind: "xlsx", sheetOrdinal: sheetIndex + 1, sheetName: sheet.name,
          sheetState: sheet.state ?? "visible", row: rowNumber, column, a1: cell.address,
          ...(mergedRange ? { mergedRange: String(mergedRange), mergedMaster: master?.address } : {}),
          hiddenRow: row.hidden === true, hiddenColumn: sheet.getColumn(column).hidden === true,
        }, { formula, cachedValue: typeof result === "number" || typeof result === "string" ||
          typeof result === "boolean" ? result : null,
          hidden: sheet.state !== "visible" || row.hidden === true || sheet.getColumn(column).hidden === true }));
      });
    });
  }
  if (cells > 50_000) omitted.push({ kind: "cell", count: cells - 50_000, reason: "cell_limit" });
  return finish(units, units.length + omitted.reduce((sum, item) => sum + item.count, 0), omitted);
}
