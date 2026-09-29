import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { chunkApprovedUnits,collapseDuplicateChunks } from "../../lib/server/retrieval/chunker";
import { exactEmbeddingVector } from "../../lib/server/retrieval/embeddings";
import { reconstructApprovedArtifactUnits } from "../../lib/server/profiles/artifact-excerpts";

describe("approved retrieval units", () => {
  it("keeps both exact locators when approved fields contain identical text", () => {
    const chunks = collapseDuplicateChunks([
      { text: "Same text",digest: "a".repeat(64),locators: [
        { kind: "profile_field",fieldPath: "statement" }],warnings: [] },
      { text: "Same text",digest: "a".repeat(64),locators: [
        { kind: "profile_field",fieldPath: "description" }],warnings: [] },
    ]);
    expect(chunks).toHaveLength(1);
    expect(chunks[0].locators).toHaveLength(2);
  });
  it("preserves disjoint PDF pages and sheet cells without crossing units", () => {
    const first = randomUUID();
    const second = randomUUID();
    const chunks = chunkApprovedUnits([
      { unitId: first,text: "Page one approved",original: { kind: "pdf",page: 1,start: 0,end: 17 },warnings: [] },
      { unitId: second,text: "Cell B9 approved",original: { kind: "xlsx",sheetOrdinal: 2,
        sheetName: "Summary",sheetState: "visible",row: 9,column: 2,a1: "B9",
        hiddenRow: false,hiddenColumn: false },warnings: ["partial_ocr"] },
    ]);
    expect(chunks).toHaveLength(2);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["Page one approved","Cell B9 approved"]);
    expect(chunks[0].locators).toEqual([{
      kind: "artifact_unit",unitId: first,original: { kind: "pdf",page: 1,start: 0,end: 17 },
      start: 0,end: 17,
    }]);
    expect(chunks[1].warnings).toEqual(["partial_ocr"]);
    expect(chunks[1].locators[0].original).toMatchObject({ kind: "xlsx",sheetOrdinal: 2,
      row: 9,column: 2,hiddenRow: false });
  });

  it("bounds chunks to 2,000 characters with exact half-open spans", () => {
    const id = randomUUID();
    const chunks = chunkApprovedUnits([{ unitId: id,text: "a".repeat(2_100),
      original: { kind: "txt",lineStart: 1,lineEnd: 5 },warnings: [] }]);
    expect(chunks.map((chunk) => chunk.text.length)).toEqual([2_000,100]);
    expect(chunks.map((chunk) => [chunk.locators[0].start,chunk.locators[0].end]))
      .toEqual([[0,2_000],[2_000,2_100]]);
  });

  it("rejects mismatched and non-finite embedding vectors", () => {
    expect(() => exactEmbeddingVector([0.1])).toThrow("contract mismatch");
    const vector = Array(1_536).fill(0.1);
    vector[300] = Infinity;
    expect(() => exactEmbeddingVector(vector)).toThrow("contract mismatch");
    vector[300] = 0.2;
    expect(exactEmbeddingVector(vector)).toHaveLength(1_536);
  });

  it("keeps offsets in original text when combining characters are present", () => {
    const unitId = randomUUID();
    const original = "Cafe\u0301";
    const [chunk] = chunkApprovedUnits([{ unitId,text: original,
      original: { kind: "txt",lineStart: 2,lineEnd: 2 },warnings: [] }]);
    expect(chunk.text).toBe(original);
    expect(chunk.locators[0]).toMatchObject({ start: 0,end: 5 });
  });
  it("reconstructs two disjoint reviewed units and rejects changed excerpt text", () => {
    const first = randomUUID();
    const second = randomUUID();
    const excerpt = "Approved page\nApproved cell";
    const ranges = [{ unitId: first,start: 0,end: 13 },
      { unitId: second,start: 2,end: 15 }];
    const units = [
      { id: first,text: "Approved page PRIVATE_NEIGHBOR",origin: "native",
        ocr_confidence: null,locator: { kind: "pdf",page: 2,start: 0,end: 30 } },
      { id: second,text: "__Approved cell HIDDEN",origin: "native",
        ocr_confidence: null,locator: { kind: "xlsx",sheetOrdinal: 1,
          sheetName: "Summary",sheetState: "visible",row: 9,column: 2,a1: "B9",
          hiddenRow: false,hiddenColumn: false } },
    ];
    const digest = createHash("sha256").update(excerpt).digest("hex");
    const chunks = reconstructApprovedArtifactUnits(ranges,units,excerpt,digest);
    expect(chunks.map((chunk) => chunk.text)).toEqual(["Approved page","Approved cell"]);
    expect(JSON.stringify(chunks)).not.toContain("PRIVATE_NEIGHBOR");
    expect(JSON.stringify(chunks)).not.toContain("HIDDEN");
    expect(chunks[1].locators[0]).toMatchObject({ unitId: second,start: 2,end: 15,
      original: { kind: "xlsx",row: 9,column: 2 } });
    expect(reconstructApprovedArtifactUnits(ranges,units,excerpt,"a".repeat(64))).toEqual([]);
  });
});
