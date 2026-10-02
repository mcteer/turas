import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { preflightArtifact } from "./preflight.ts";
import { extractWorkforceCsv, extractText } from "./text.ts";
import { extractWorkforceSpreadsheet, extractSpreadsheet } from "./spreadsheet.ts";
import { extractDocx, extractPptx } from "./office.ts";
import { extractPdf } from "./pdf.ts";
import { extractImage } from "./ocr.ts";
import { finish, type Manifest, type Parsed, type WorkforceManifest } from "./types.ts";

export async function parseArtifact(bytes: Uint8Array, filename: string, declaredType: string,
  binding: { imageDigest: string; scanReceiptDigest: string }): Promise<Manifest> {
  const preflight = await preflightArtifact(bytes, filename, declaredType);
  const format = preflight.format;
  let parsed: Parsed;
  if (format === "txt" || format === "md" || format === "csv") parsed = extractText(preflight.text ?? "", format);
  else if (format === "xlsx") parsed = await extractSpreadsheet(bytes);
  else if (format === "docx") parsed = await extractDocx(bytes);
  else if (format === "pptx") parsed = await extractPptx(bytes);
  else if (format === "pdf") parsed = await extractPdf(bytes);
  else if (format === "png" || format === "jpeg") parsed = await extractImage(bytes);
  else parsed = finish([]);
  const codepoints = parsed.units.reduce((sum, item) => sum + Array.from(item.text).length, 0);
  if (codepoints > 500_000) throw new Error("extraction_limit");
  return { contract: "artifact-intake-v1", originalDigest: createHash("sha256").update(bytes).digest("hex"),
    parserVersion: "004-parser-v1", imageDigest: binding.imageDigest,
    scanReceiptDigest: binding.scanReceiptDigest, format,
    status: parsed.coverage.omitted.length ? "partial" : "ready", ...parsed };
}

export async function parseWorkforceTable(bytes: Uint8Array, filename: string, declaredType: string,
  binding: { imageDigest: string; scanReceiptDigest: string }): Promise<WorkforceManifest> {
  const preflight = await preflightArtifact(bytes, filename, declaredType);
  if (preflight.format !== "csv" && preflight.format !== "xlsx") throw new Error("unsupported_format");
  const parsed = preflight.format === "csv" ? extractWorkforceCsv(preflight.text ?? "") :
    await extractWorkforceSpreadsheet(bytes);
  const manifest: WorkforceManifest = { ...parsed, contract: "workforce-table-v1", parserVersion: "007-table-parser-v1",
    originalDigest: createHash("sha256").update(bytes).digest("hex"), imageDigest: binding.imageDigest,
    scanReceiptDigest: binding.scanReceiptDigest, format: preflight.format,
    status: parsed.coverage.omitted.length ? "partial" : "ready" };
  if (Buffer.byteLength(JSON.stringify(manifest)) > 52_428_800) throw new Error("limit_exceeded");
  return manifest;
}

async function main(): Promise<void> {
  const [input, filename, declaredType, imageDigest, scanReceiptDigest, output, mode] = process.argv.slice(2);
  if (!input || !filename || !declaredType || !imageDigest || !scanReceiptDigest || !output) {
    throw new Error("Parser arguments required");
  }
  if (mode && mode !== "workforce-table-v1") throw new Error("unsupported_format");
  const parser = mode === "workforce-table-v1" ? parseWorkforceTable : parseArtifact;
  const manifest = await parser(await readFile(input), filename, declaredType,
    { imageDigest, scanReceiptDigest });
  const encoded = JSON.stringify(manifest);
  if (Buffer.byteLength(encoded) > 52_428_800) throw new Error("manifest_size");
  if (output === "-") process.stdout.write(encoded);
  else await writeFile(output, encoded, { flag: "wx", mode: 0o600 });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    process.stderr.write(error instanceof Error && "code" in error ? String(error.code) : "parser_failed");
    process.exitCode = 1;
  });
}
