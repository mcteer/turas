import { randomUUID } from "node:crypto";
import type { Format } from "./preflight.ts";

export type Unit = {
  id: string; ordinal: number; text: string; locator: Record<string, unknown>;
  origin: "native" | "ocr"; ocrConfidence: number | null;
  formula?: string | null; cachedValue?: string | number | boolean | null;
  hidden?: boolean; sourceStart?: number; sourceEnd?: number;
};
export type Coverage = { total: number | null; visited: number; omitted: Array<{ kind: string; count: number; reason: string }> };
export type Parsed = { units: Unit[]; coverage: Coverage; warnings: string[] };
export type Manifest = Parsed & {
  contract: "artifact-intake-v1"; originalDigest: string; parserVersion: string;
  imageDigest: string; scanReceiptDigest: string; format: Format; status: "ready" | "partial";
};

export function unit(text: string, locator: Record<string, unknown>, extra: Partial<Unit> = {}): Unit {
  return { id: randomUUID(), ordinal: 0, text, locator, origin: "native", ocrConfidence: null, ...extra };
}

export function splitUnits(text: string, locator: Record<string, unknown>, extra: Partial<Unit> = {}): Unit[] {
  const points = Array.from(text);
  const units: Unit[] = [];
  for (let start = 0; start < points.length; start += 32_000) {
    const end = Math.min(points.length, start + 32_000);
    units.push(unit(points.slice(start, end).join(""), locator,
      { ...extra, sourceStart: start, sourceEnd: end }));
  }
  return units;
}

export function finish(units: Unit[], total = units.length, omitted: Coverage["omitted"] = []): Parsed {
  return { units: units.map((item, index) => ({ ...item, ordinal: index + 1 })),
    coverage: { total, visited: Math.min(total, units.length), omitted },
    warnings: units.length ? [] : ["no_text"] };
}

export type WorkforceCell = {
  sheetIndex: number; rowNumber: number; columnNumber: number; a1: string | null;
  kind: "string" | "number" | "boolean" | "date" | "formula" | "error" | "empty";
  raw: string | number | boolean | null; text: string;
  formula: string | null; sharedFormula: string | null;
  cachedValue: string | number | boolean | null;
  hiddenSheet: boolean; hiddenRow: boolean; hiddenColumn: boolean;
  merged: boolean; mergedMaster: string | null;
  lineStart: number | null; lineEnd: number | null;
};
export type WorkforceTable = {
  cells: WorkforceCell[];
  sheets: Array<{ index: number; name: string; state: "visible" | "hidden" | "veryHidden";
    rowCount: number; columnCount: number }>;
  dateSystem: "1900" | "1904" | null;
  coverage: Coverage; codePointCount: number;
};
export type WorkforceManifest = WorkforceTable & {
  contract: "workforce-table-v1"; parserVersion: "007-table-parser-v1";
  originalDigest: string; imageDigest: string; scanReceiptDigest: string;
  format: "csv" | "xlsx"; status: "ready" | "partial";
};

/** No cell is truncated into an apparently complete candidate. */
export function workforceCollector() {
  const cells: WorkforceCell[] = [];
  const omissions = new Map<string, number>();
  let total = 0, codePointCount = 0;
  const omit = (reason: string, count = 1) => omissions.set(reason, (omissions.get(reason) ?? 0) + count);
  const append = (cell: WorkforceCell) => {
    total++;
    if (cells.length >= 50_000) { omit("cell_limit"); return; }
    const points = Array.from(cell.text).length + Array.from(cell.formula ?? "").length;
    if (codePointCount + points > 500_000) { omit("code_point_limit"); return; }
    codePointCount += points; cells.push(cell);
  };
  const finish = () => ({ cells, codePointCount,
    coverage: { total, visited: cells.length, omitted: [...omissions].map(([reason, count]) =>
      ({ kind: "cell", count, reason })) } });
  return { append, omit, finish };
}
