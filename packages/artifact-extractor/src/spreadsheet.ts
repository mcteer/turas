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

import yauzl from "yauzl";
import { posix } from "node:path";
import { workforceCollector, type WorkforceTable, type WorkforceCell } from "./types.ts";

function xmlAttributes(tag: string): Record<string, string> {
  return Object.fromEntries([...tag.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(m => [m[1], m[3]]));
}

/** Preflight already rejects entities, external relationships and unsafe archive paths.
 * Raw numeric cell values preserve Excel's impossible serial 60 for later rejection. */
async function rawWorkbookNumbers(bytes: Uint8Array): Promise<Array<Map<string, number>>> {
  const documents = new Map<string, string>();
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) { reject(new Error("malformed")); return; }
      zip.on("error", reject); zip.on("end", resolve);
      zip.on("entry", entry => {
        if (!/^xl\/(?:workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/[^/]+\.xml)$/.test(entry.fileName)) {
          zip.readEntry(); return;
        }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { zip.close(); reject(new Error("malformed")); return; }
          const chunks: Buffer[] = []; let size = 0;
          stream.on("data", (chunk: Buffer) => {
            size += chunk.length;
            if (size > 20_971_520) { stream.destroy(); zip.close(); reject(new Error("limit_exceeded")); }
            else chunks.push(chunk);
          });
          stream.on("error", reject);
          stream.on("end", () => { documents.set(entry.fileName, Buffer.concat(chunks).toString("utf8")); zip.readEntry(); });
        });
      });
      zip.readEntry();
    });
  });
  const relations = new Map([... (documents.get("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b[^>]*\/?\s*>/g)]
    .map(m => { const attributes = xmlAttributes(m[0]); return [attributes.Id,
      attributes.Target?.startsWith("/") ? attributes.Target.slice(1) : posix.normalize(`xl/${attributes.Target}`)]; }));
  const sheets = [...(documents.get("xl/workbook.xml") ?? "").matchAll(/<sheet\b[^>]*\/?\s*>/g)];
  return sheets.slice(0, 20).map(sheet => {
    const path = relations.get(xmlAttributes(sheet[0])["r:id"]);
    const xml = path ? documents.get(path) ?? "" : "";
    const numbers = new Map<string, number>();
    for (const match of xml.matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = xmlAttributes(match[1]);
      const raw = /<v\b[^>]*>([^<]*)<\/v>/.exec(match[2])?.[1];
      if (attrs.r && raw !== undefined && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw)) {
        const value = Number(raw);
        if (Number.isFinite(value)) numbers.set(attrs.r, value);
      }
    }
    return numbers;
  });
}

const scalar = (value: unknown): string | number | boolean | null =>
  typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) ? value : null;

export async function extractWorkforceSpreadsheet(bytes: Uint8Array): Promise<WorkforceTable> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Buffer.from(bytes) as never);
  const numbers = await rawWorkbookNumbers(bytes);
  const collected = workforceCollector();
  const sheets: WorkforceTable["sheets"] = [];
  for (const [sheetIndex, sheet] of workbook.worksheets.entries()) {
    if (sheetIndex >= 20) { collected.omit("sheet_limit", 1); continue; }
    sheets.push({ index: sheetIndex, name: sheet.name, state: sheet.state ?? "visible",
      rowCount: sheet.rowCount, columnCount: sheet.columnCount });
    sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      const value = cell.value;
      const formula = value && typeof value === "object" && "formula" in value ? String(value.formula) : null;
      const sharedFormula = value && typeof value === "object" && "sharedFormula" in value ? String(value.sharedFormula) : null;
      const cachedValue = value && typeof value === "object" && "result" in value ? scalar(value.result) : null;
      let kind: WorkforceCell["kind"] = "empty", raw = scalar(value), text = cell.text ?? "";
      if (formula || sharedFormula) { kind = "formula"; raw = cachedValue; text = String(cachedValue ?? ""); }
      else if (value instanceof Date) {
        const serial = numbers[sheetIndex]?.get(cell.address);
        if (serial === undefined || !Number.isFinite(value.getTime())) { collected.omit("raw_date_unavailable"); return; }
        kind = "date"; raw = serial; text = value.toISOString();
      } else if (typeof value === "number") kind = "number";
      else if (typeof value === "boolean") kind = "boolean";
      else if (typeof value === "string") kind = value === "" ? "empty" : "string";
      else if (value && typeof value === "object") {
        if ("error" in value) { kind = "error"; raw = String(value.error); }
        else { kind = "string"; raw = text; }
      }
      collected.append({ sheetIndex, rowNumber, columnNumber, a1: cell.address, kind, raw, text,
        formula, sharedFormula, cachedValue, hiddenSheet: sheet.state !== "visible", hiddenRow: row.hidden === true,
        hiddenColumn: sheet.getColumn(columnNumber).hidden === true, merged: cell.isMerged,
        mergedMaster: cell.isMerged ? cell.master.address : null, lineStart: null, lineEnd: null });
    }));
  }
  return { ...collected.finish(), sheets, dateSystem: workbook.properties.date1904 ? "1904" : "1900" };
}
