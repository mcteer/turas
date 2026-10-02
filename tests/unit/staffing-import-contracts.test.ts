import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { workforceImportIntentSchema, workforceManualAssessmentSchema, workforceMappingSchema,
  workforceReviewSchema } from "../../lib/contracts/staffing-imports";

describe("bounded workforce inputs", () => {
  it("accepts one original and rejects path names, mismatched types and body claims", () => {
    const input = { requestKey: randomUUID(), filename: "synthetic.csv", format: "csv",
      byteSize: 10_485_760, contentDigest: "a".repeat(64) };
    expect(workforceImportIntentSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ filename: "../synthetic.csv" }, { filename: "synthetic.xlsx" },
      { byteSize: 10_485_761 }, { byteSize: 0 }, { scanned: true }, { byteSize: "12" }]) {
      expect(workforceImportIntentSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it("requires dated accountable manual evidence without approval claims", () => {
    const assessment = { requestKey: randomUUID(), rationale: "Observed synthetic exercise", resourceId: randomUUID(),
      skillId: randomUUID(), level: 0, assessmentDate: "2026-09-30", nextReviewDate: "2026-10-30", evidence: "Observed exercise" };
    expect(workforceManualAssessmentSchema.safeParse(assessment).success).toBe(true);
    for (const patch of [{ nextReviewDate: "2026-09-29" }, { evidence: " " }, { level: 5 },
      { approved: true }, { evidence: "x".repeat(4_001) }, { assessmentDate: "2026-02-29" }]) {
      expect(workforceManualAssessmentSchema.safeParse({ ...assessment, ...patch }).success).toBe(false);
    }
  });
  it("bounds explicit mappings and rejects duplicate identities, sheets, columns and correction rows", () => {
    const table = { sheetIndex: 0, startRow: 1, endRow: 3, headerRow: 1, startColumn: 1, endColumn: 6,
      columns: { resource: 1, skill: 2, level: 3, assessmentDate: 4, nextReviewDate: 5, evidence: 6 } };
    const input = { requestKey: randomUUID(), sourceVersionId: randomUUID(), sourceGeneration: 1,
      extractionRunId: randomUUID(), extractionDigest: "a".repeat(64), csvDateConvention: "DMY",
      tables: [table], resources: [{ value: "same name", resourceId: randomUUID() }],
      skills: [{ value: "web", skillId: randomUUID() }], corrections: [] };
    expect(workforceMappingSchema.safeParse(input).success).toBe(true);
    for (const patch of [{ tables: [table, table] }, { resources: [...input.resources, ...input.resources] },
      { tables: [{ ...table, endRow: 5_002 }] }, { csvDateConvention: "guess" },
      { tables: [{ ...table, columns: { ...table.columns, skill: 1 } }] },
      { corrections: [{ sheetIndex: 0, rowNumber: 2 }, { sheetIndex: 0, rowNumber: 2 }] },
      { fuzzyNames: true }]) {
      expect(workforceMappingSchema.safeParse({ ...input, ...patch }).success).toBe(false);
    }
  });
  it("requires exact atomic review rows and rejects duplicate or excessive decisions", () => {
    const row = { competencyId: randomUUID(), candidateRevisionId: randomUUID(), candidateDigest: "a".repeat(64),
      sourceGeneration: 1, expectedAggregateVersion: 1, action: "accept", rationale: "Verified synthetic evidence" };
    const input = { requestKey: randomUUID(), rows: [row] };
    expect(workforceReviewSchema.safeParse(input).success).toBe(true);
    for (const rows of [[], [row, row], Array.from({ length: 101 }, () => ({ ...row, competencyId: randomUUID() })),
      [{ ...row, sourceGeneration: 0 }], [{ ...row, candidateDigest: "A".repeat(64) }], [{ ...row, rationale: " " }]]) {
      expect(workforceReviewSchema.safeParse({ ...input, rows }).success).toBe(false);
    }
  });
});

import { workforceBusinessDate } from "../../lib/staffing/import-mapping";
describe("explicit business-date interpretation", () => {
  it("requires a selected locale and preserves the 1900/1904 distinction", () => {
    expect(workforceBusinessDate("01/02/2026", "DMY", null)).toBe("2026-02-01");
    expect(workforceBusinessDate("01/02/2026", "MDY", null)).toBe("2026-01-02");
    expect(() => workforceBusinessDate("01/02/2026", "ISO", null)).toThrow();
    expect(() => workforceBusinessDate(60, "ISO", "1900")).toThrow("invalid_excel_date");
    expect(() => workforceBusinessDate("31/02/2026", "DMY", null)).toThrow();
    expect(() => workforceBusinessDate("01/02/26", "DMY", null)).toThrow();
    // Independently calculated Excel serials for 2026-02-01.
    expect(workforceBusinessDate(46_054, "ISO", "1900")).toBe("2026-02-01");
    expect(workforceBusinessDate(44_592, "ISO", "1904")).toBe("2026-02-01");
  });
});
