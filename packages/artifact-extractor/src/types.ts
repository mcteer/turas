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
