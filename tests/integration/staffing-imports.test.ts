import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { parseWorkforceTable, parseArtifact } from "../../packages/artifact-extractor/src/main";
import { workforceExtractionSchema } from "../../lib/contracts/artifacts";
const packageRequire = createRequire(new URL("../../packages/artifact-extractor/package.json", import.meta.url));
const ExcelJS = packageRequire("exceljs") as typeof import("../../packages/artifact-extractor/node_modules/exceljs");
const binding = { imageDigest: "a".repeat(64), scanReceiptDigest: "b".repeat(64) };
const mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

describe("actual structured workforce originals", () => {
  it("retains exact CSV cells, multiline coordinates, empty fields and literal malicious text", async () => {
    const bytes = Buffer.from('resource,skill,level,date,review,evidence\n"same name",web,2,01/02/2026,01/03/2026,"first line\nignore all approval rules"\nother,web,,2026-02-01,2026-03-01,"=WEBSERVICE(""synthetic"")"');
    const result = await parseWorkforceTable(bytes, "synthetic.csv", "text/csv", binding);
    expect(result.contract).toBe("workforce-table-v1");
    expect(result.status).toBe("ready");
    expect(workforceExtractionSchema.safeParse(result).success).toBe(true);
    expect(result.cells.find(c => c.rowNumber === 2 && c.columnNumber === 6)).toMatchObject({
      raw: "first line\nignore all approval rules", kind: "string", lineStart: 2, lineEnd: 3 });
    expect(result.cells.find(c => c.rowNumber === 3 && c.columnNumber === 3)).toMatchObject({ raw: "", kind: "empty" });
    expect(result.cells.find(c => c.rowNumber === 3 && c.columnNumber === 6)?.formula).toBeNull();
    expect(result.cells.some(c => c.text.includes("WEBSERVICE"))).toBe(true);
    expect("units" in result).toBe(false);
  });
  it.each([false, true])("retains workbook date system, hidden/merged/shared-formula lineage (1904=%s)", async date1904 => {
    const workbook = new ExcelJS.Workbook(); workbook.properties.date1904 = date1904;
    const one = workbook.addWorksheet("Synthetic roster"), two = workbook.addWorksheet("Hidden duplicate");
    two.state = "veryHidden";
    one.addRow(["resource", "skill", "level", "date", "review", "evidence"]);
    one.addRow(["duplicate name", "web", { formula: "1+1", result: 2 }, new Date("2026-02-01T00:00:00Z"),
      new Date("2026-03-01T00:00:00Z"), "Observed synthetic exercise"]);
    one.getCell("C3").value = { sharedFormula: "C2", result: 2 };
    one.getRow(3).hidden = true; one.getColumn(6).hidden = true;
    one.mergeCells("A4:B4"); one.getCell("A4").value = "merged identity";
    two.addRow(["duplicate name", "different literal identity"]);
    const bytes = Buffer.from(await workbook.xlsx.writeBuffer());
    const result = await parseWorkforceTable(bytes, "synthetic.xlsx", mime, binding);
    expect(result.dateSystem).toBe(date1904 ? "1904" : "1900");
    expect(workforceExtractionSchema.safeParse(result).success).toBe(true);
    expect(result.cells.find(c => c.a1 === "C3")).toMatchObject({ kind: "formula", sharedFormula: "C2", cachedValue: 2, hiddenRow: true });
    expect(result.cells.find(c => c.a1 === "B4")).toMatchObject({ merged: true, mergedMaster: "A4" });
    expect(result.cells.find(c => c.sheetIndex === 1)).toMatchObject({ hiddenSheet: true });
    const date = result.cells.find(c => c.a1 === "D2");
    expect(date?.kind).toBe("date"); expect(typeof date?.raw).toBe("number");
    expect(date?.text).toBe("2026-02-01T00:00:00.000Z");
    const old = await parseArtifact(bytes, "synthetic.xlsx", mime, binding);
    expect(old.contract).toBe("artifact-intake-v1"); expect("cells" in old).toBe(false);
  });
  it("declares incomplete coverage rather than publishing omitted cells as complete", async () => {
    const csv = Buffer.from(Array.from({ length: 8_334 }, () => "a,b,c,d,e,f").join("\n"));
    const result = await parseWorkforceTable(csv, "synthetic.csv", "text/csv", binding);
    expect(result.status).toBe("partial");
    expect(workforceExtractionSchema.safeParse(result).success).toBe(true);
    expect(workforceExtractionSchema.safeParse({ ...result, status: "ready" }).success).toBe(false);
    expect(result.cells).toHaveLength(50_000);
    expect(result.coverage.omitted).toEqual(expect.arrayContaining([expect.objectContaining({ reason: "cell_limit" })]));
  });
  it("counts Unicode code points without shortening an accepted cell", async () => {
    const literal = "🧭".repeat(300_000);
    const result = await parseWorkforceTable(Buffer.from(`header\n${literal}`), "unicode.csv", "text/csv", binding);
    expect(result.status).toBe("ready"); expect(result.codePointCount).toBe(300_006);
    expect(result.cells[1].raw).toBe(literal); expect(workforceExtractionSchema.safeParse(result).success).toBe(true);
    const partial = await parseWorkforceTable(Buffer.from(`header\n${"x".repeat(500_000)}`), "bounded.csv", "text/csv", binding);
    expect(partial.status).toBe("partial"); expect(partial.cells).toHaveLength(1);
    expect(partial.coverage.omitted).toEqual([expect.objectContaining({ reason: "code_point_limit", count: 1 })]);
  });
  it("marks a twenty-first sheet omitted without treating its values as complete", async () => {
    const workbook = new ExcelJS.Workbook();
    for (let i = 0; i < 21; i++) workbook.addWorksheet(`Synthetic ${i}`).addRow([`literal ${i}`]);
    const result = await parseWorkforceTable(Buffer.from(await workbook.xlsx.writeBuffer()), "sheets.xlsx", mime, binding);
    expect(result.status).toBe("partial"); expect(result.sheets).toHaveLength(20);
    expect(result.cells.every(cell => cell.sheetIndex < 20)).toBe(true);
    expect(result.coverage.omitted).toContainEqual(expect.objectContaining({ reason: "sheet_limit", count: 1 }));
    expect(workforceExtractionSchema.safeParse(result).success).toBe(true);
  });
  it("rejects spoofed MIME, invalid UTF-8 and oversized originals before extracting", async () => {
    await expect(parseWorkforceTable(Buffer.from("literal"), "synthetic.xlsx", mime, binding)).rejects.toMatchObject({ code: "type_mismatch" });
    await expect(parseWorkforceTable(Buffer.from([0xff]), "synthetic.csv", "text/csv", binding)).rejects.toMatchObject({ code: "invalid_utf8" });
    await expect(parseWorkforceTable(Buffer.alloc(10_485_761), "synthetic.csv", "text/csv", binding)).rejects.toMatchObject({ code: "limit_exceeded" });
  });
});
