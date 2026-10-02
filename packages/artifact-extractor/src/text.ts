import { parse as parseCsv } from "csv-parse/sync";
import { finish, unit, type Parsed } from "./types.ts";

export function extractText(text: string, format: "txt" | "md" | "csv"): Parsed {
  const units = [];
  if (format === "csv") {
    const records = parseCsv(text, { bom: true, skip_empty_lines: false, relax_quotes: false,
      info: true, relax_column_count: true }) as unknown as Array<{ record: string[]; info: { lines: number } }>;
    let previousEnd = 0;
    for (const [index, item] of records.entries()) {
      const start = previousEnd + 1;
      const end = item.info.lines;
      for (const [column, value] of item.record.entries()) {
        if (!value) continue;
        units.push(unit(value, { kind: "csv", record: index + 1, column: column + 1,
          lineStart: start, lineEnd: Math.max(start, end) }));
      }
      previousEnd = end;
    }
    return finish(units);
  }
  const lines = text.split(/\r\n|\n|\r/);
  for (const [index, line] of lines.entries()) {
    if (!line) continue;
    for (let start = 0; start < Array.from(line).length; start += 32_000) {
      const content = Array.from(line).slice(start, start + 32_000).join("");
      units.push(unit(content, { kind: format, lineStart: index + 1, lineEnd: index + 1 }));
    }
  }
  return finish(units);
}

import { workforceCollector, type WorkforceTable } from "./types.ts";

export function extractWorkforceCsv(text: string): WorkforceTable {
  const records = parseCsv(text, { bom: true, skip_empty_lines: false, relax_quotes: false,
    info: true, relax_column_count: true, max_record_size: 10_485_760 }) as unknown as
    Array<{ record: string[]; info: { lines: number } }>;
  const collected = workforceCollector();
  let previousEnd = 0, columnCount = 0;
  for (const [index, item] of records.entries()) {
    const lineStart = previousEnd + 1, lineEnd = Math.max(lineStart, item.info.lines);
    columnCount = Math.max(columnCount, item.record.length);
    for (const [column, raw] of item.record.entries()) collected.append({ sheetIndex: 0,
      rowNumber: index + 1, columnNumber: column + 1, a1: null, kind: raw === "" ? "empty" : "string",
      raw, text: raw, formula: null, sharedFormula: null, cachedValue: null,
      hiddenSheet: false, hiddenRow: false, hiddenColumn: false, merged: false, mergedMaster: null,
      lineStart, lineEnd });
    previousEnd = item.info.lines;
  }
  return { ...collected.finish(), dateSystem: null,
    sheets: [{ index: 0, name: "CSV", state: "visible", rowCount: records.length, columnCount }] };
}
