import { staffingDateSchema, staffingLevelSchema } from "../contracts/staffing";
import type { WorkforceMapping } from "../contracts/staffing-imports";
import type { WorkforceExtractedCell, WorkforceExtraction } from "../contracts/artifacts";

export function workforceBusinessDate(raw: unknown, convention: "ISO" | "DMY" | "MDY", dateSystem: "1900" | "1904" | null) {
  let date: string;
  if (typeof raw === "number" && dateSystem) {
    if (!Number.isFinite(raw) || raw < 0 || (dateSystem === "1900" && Math.floor(raw) === 60)) throw new Error("invalid_excel_date");
    const days = Math.floor(raw) - (dateSystem === "1900" && raw > 60 ? 1 : 0);
    const epoch = Date.parse(dateSystem === "1904" ? "1904-01-01T00:00:00Z" : "1899-12-31T00:00:00Z");
    const time = epoch + days * 86_400_000;
    if (!Number.isSafeInteger(time) || !Number.isFinite(new Date(time).getTime())) throw new Error("invalid_date");
    date = new Date(time).toISOString().slice(0, 10);
  } else if (typeof raw === "string") {
    if (convention === "ISO") date = raw;
    else {
      const matched = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw);
      if (!matched) throw new Error("invalid_date");
      const month = convention === "DMY" ? matched[2] : matched[1], day = convention === "DMY" ? matched[1] : matched[2];
      date = `${matched[3]}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  } else throw new Error("invalid_date");
  if (!staffingDateSchema.safeParse(date).success) throw new Error("invalid_date");
  return date;
}
export type LocatedWorkforceCell = { id: string; cell: WorkforceExtractedCell };
export type ResolvedWorkforceRow = { rowKey: string; sheetIndex: number; rowNumber: number;
  errors: string[]; candidate: null | { resourceId: string; skillId: string; level: number;
    assessmentDate: string; nextReviewDate: string; evidence: string; locators: Array<{
      cellId: string; sheetIndex: number; rowNumber: number; columnNumber: number; field: string }>; correctedFields: string[] } };

/** Explicit dictionary/row literals only. Formula results cannot become facts. */
export function resolveWorkforceRows(mapping: WorkforceMapping, metadata: Pick<WorkforceExtraction, "dateSystem" | "sheets" | "status">,
  cells: LocatedWorkforceCell[]): ResolvedWorkforceRow[] {
  const byCell = new Map(cells.map(c => [`${c.cell.sheetIndex}:${c.cell.rowNumber}:${c.cell.columnNumber}`, c]));
  const resources = new Map(mapping.resources.map(r => [r.value, r.resourceId])), skills = new Map(mapping.skills.map(s => [s.value, s.skillId]));
  const corrections = new Map(mapping.corrections.map(c => [`${c.sheetIndex}:${c.rowNumber}`, c]));
  const rows: ResolvedWorkforceRow[] = [];
  for (const table of mapping.tables) {
    const sheet = metadata.sheets.find(s => s.index === table.sheetIndex);
    if (Object.values(table.columns).some(column => {
      const header = byCell.get(`${table.sheetIndex}:${table.headerRow}:${column}`)?.cell;
      return !header || header.kind === "empty" || header.kind === "formula";
    })) throw new Error("invalid_table_header");
    if (!sheet || table.endRow > sheet.rowCount || table.endColumn > sheet.columnCount) throw new Error("table_outside_coverage");
    for (let rowNumber = table.headerRow + 1; rowNumber <= table.endRow; rowNumber++) {
      const rowKey = `${table.sheetIndex}:${rowNumber}`, correction = corrections.get(rowKey);
      const errors: string[] = [], locators: NonNullable<ResolvedWorkforceRow["candidate"]>["locators"] = [], correctedFields: string[] = [];
      const value = (field: keyof WorkforceMapping["tables"][number]["columns"]) => {
        const original = byCell.get(`${table.sheetIndex}:${rowNumber}:${table.columns[field]}`);
        const correctedKey = field === "resource" ? "resourceId" : field === "skill" ? "skillId" : field;
        const literal = correction?.[correctedKey];
        if (literal !== undefined) correctedFields.push(field);
        if (original) locators.push({ cellId: original.id, sheetIndex: table.sheetIndex, rowNumber,
          columnNumber: table.columns[field], field });
        if (literal === undefined && (original?.cell.kind === "formula" || original?.cell.formula || original?.cell.sharedFormula)) {
          errors.push("formula_literal_required"); return null;
        }
        if (literal !== undefined) return literal;
        if (!original || original.cell.kind === "empty" || original.cell.kind === "error") { errors.push("missing_literal"); return null; }
        return original.cell.raw;
      };
      const resource = value("resource"), skill = value("skill"), rawLevel = value("level");
      const resourceId = correction?.resourceId ?? resources.get(typeof resource === "string" ? resource : "");
      const skillId = correction?.skillId ?? skills.get(typeof skill === "string" ? skill : "");
      if (!resourceId || !skillId) errors.push("unresolved_identity");
      const level = typeof rawLevel === "string" && /^[0-4]$/.test(rawLevel) ? Number(rawLevel) : rawLevel;
      if (!staffingLevelSchema.safeParse(level).success) errors.push("invalid_level");
      const rawAssessment = value("assessmentDate"), rawReview = value("nextReviewDate"), rawEvidence = value("evidence");
      let assessmentDate = "", nextReviewDate = "";
      try {
        assessmentDate = correction?.assessmentDate ?? workforceBusinessDate(rawAssessment, mapping.csvDateConvention, metadata.dateSystem);
        nextReviewDate = correction?.nextReviewDate ?? workforceBusinessDate(rawReview, mapping.csvDateConvention, metadata.dateSystem);
        if (nextReviewDate < assessmentDate) errors.push("invalid_review_date");
      } catch { errors.push("invalid_date"); }
      const evidence = typeof rawEvidence === "string" ? rawEvidence.trim() : "";
      if (!evidence || evidence.length > 4_000) errors.push("invalid_evidence");
      if (locators.length === 0) errors.push("missing_lineage");
      if (metadata.status !== "ready") errors.push("incomplete_coverage");
      rows.push({ rowKey, sheetIndex: table.sheetIndex, rowNumber, errors: [...new Set(errors)], candidate: errors.length ? null : {
        resourceId: resourceId!, skillId: skillId!, level: level as number, assessmentDate, nextReviewDate, evidence, locators, correctedFields } });
    }
  }
  const seen = new Map<string, ResolvedWorkforceRow>();
  for (const row of rows) if (row.candidate) {
    const key = `${row.candidate.resourceId}:${row.candidate.skillId}`, previous = seen.get(key);
    if (previous) { previous.errors.push("duplicate_identity"); row.errors.push("duplicate_identity"); previous.candidate = null; row.candidate = null; }
    else seen.set(key, row);
  }
  return rows;
}
