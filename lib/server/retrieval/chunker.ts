import { createHash } from "node:crypto";
import type { z } from "zod";
import { citationLocatorSchema, retrievalLimits } from "../../contracts/retrieval";
import type { ArtifactLocator } from "../../contracts/artifacts";

type Locator = z.infer<typeof citationLocatorSchema>;
type ArtifactUnitLocator = Extract<Locator, { kind: "artifact_unit" }>;
export type ApprovedUnit = {
  unitId: string;
  text: string;
  original: ArtifactLocator;
  warnings: string[];
  offsetStart?: number;
};
export type RetrievalChunk = {
  text: string;
  digest: string;
  locators: Locator[];
  warnings: string[];
};
export type ApprovedUnitChunk = Omit<RetrievalChunk, "locators"> & { locators: ArtifactUnitLocator[] };

export function passageDigest(text: string): string {
  return createHash("sha256").update(text,"utf8").digest("hex");
}

/** Keep one passage per digest while retaining every approved source locator. */
export function collapseDuplicateChunks(chunks: readonly RetrievalChunk[]): RetrievalChunk[] {
  const result: RetrievalChunk[] = [];
  const positions = new Map<string,number>();
  for (const chunk of chunks) {
    const key = `${chunk.digest}:${chunk.text}`;
    const prior = positions.get(key);
    if (prior === undefined) {
      positions.set(key,result.length);
      result.push({ ...chunk,locators: [...chunk.locators],warnings: [...chunk.warnings] });
      continue;
    }
    const found = result[prior];
    const locators = [...found.locators];
    for (const locator of chunk.locators) {
      if (!locators.some((existing) => JSON.stringify(existing) === JSON.stringify(locator))) {
        locators.push(locator);
      }
    }
    if (locators.length > 50) throw new Error("Too many duplicate passage locators");
    result[prior] = { ...found,locators,
      warnings: [...new Set([...found.warnings,...chunk.warnings])].slice(0,10) };
  }
  return result;
}

/** Chunks only within one approved unit. Offsets count original Unicode code points. */
export function chunkApprovedUnits(units: readonly ApprovedUnit[]): ApprovedUnitChunk[] {
  const chunks: ApprovedUnitChunk[] = [];
  for (const unit of units) {
    const original = unit.original;
    const characters = Array.from(unit.text);
    for (let start = 0; start < characters.length; start += retrievalLimits.passageCharacters) {
      const end = Math.min(start + retrievalLimits.passageCharacters,characters.length);
      const text = characters.slice(start,end).join("");
      if (!text.trim()) continue;
      const locator = citationLocatorSchema.parse({ kind: "artifact_unit",unitId: unit.unitId,
        original,start: (unit.offsetStart ?? 0) + start,
        end: (unit.offsetStart ?? 0) + end }) as ArtifactUnitLocator;
      chunks.push({ text,digest: passageDigest(text),locators: [locator],
        warnings: unit.warnings.filter((warning) => warning.length <= 500).slice(0,10) });
    }
  }
  return chunks;
}
