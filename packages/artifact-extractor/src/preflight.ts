import yauzl, { type Entry, type ZipFile } from "yauzl";

export type Format = "pdf" | "docx" | "pptx" | "xlsx" | "csv" | "txt" | "md" | "png" | "jpeg";
export class ArtifactPreflightError extends Error {
  constructor(readonly code: string) { super(code); this.name = "ArtifactPreflightError"; }
}

const byExtension: Record<string, { format: Format; mime: string }> = {
  pdf: { format: "pdf", mime: "application/pdf" },
  docx: { format: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" },
  pptx: { format: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation" },
  xlsx: { format: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
  csv: { format: "csv", mime: "text/csv" }, txt: { format: "txt", mime: "text/plain" },
  md: { format: "md", mime: "text/markdown" }, png: { format: "png", mime: "image/png" },
  jpg: { format: "jpeg", mime: "image/jpeg" }, jpeg: { format: "jpeg", mime: "image/jpeg" },
};

export type Preflight = { format: Format; entryNames: string[]; text?: string };

function fail(code: string): never { throw new ArtifactPreflightError(code); }

async function inspectZip(bytes: Buffer, format: "docx" | "pptx" | "xlsx"): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let done = false;
    let zip: ZipFile | undefined;
    const names: string[] = [];
    const seen = new Set<string>();
    let expanded = 0;
    const stop = (error: unknown) => {
      if (done) return;
      done = true;
      zip?.close();
      reject(error);
    };
    yauzl.fromBuffer(bytes, { lazyEntries: true, autoClose: false, decodeStrings: true,
      validateEntrySizes: true }, (error, opened) => {
      if (error || !opened) { stop(new ArtifactPreflightError("malformed")); return; }
      zip = opened;
      zip.on("error", (zipError: Error) => stop(new ArtifactPreflightError(
        /invalid relative path|absolute path/i.test(zipError.message) ? "path_traversal" : "malformed")));
      zip.on("end", () => {
        if (done) return;
        done = true;
        zip?.close();
        const required = format === "docx" ? "word/document.xml" :
          format === "pptx" ? "ppt/presentation.xml" : "xl/workbook.xml";
        if (!seen.has("[content_types].xml") || !seen.has(required)) {
          reject(new ArtifactPreflightError("type_mismatch")); return;
        }
        resolve(names);
      });
      zip.on("entry", (entry: Entry) => {
        if (done) return;
        const name = entry.fileName.replaceAll("\\", "/");
        const canonical = name.toLowerCase();
        if (name.startsWith("/") || /^[a-z]:/i.test(name) || name.split("/").some((part) => part === ".." || part === ".") ||
            name.includes("\0") || seen.has(canonical)) { stop(new ArtifactPreflightError("path_traversal")); return; }
        seen.add(canonical);
        names.push(name);
        if (names.length > 2_000 || entry.uncompressedSize > 20 * 1024 * 1024 ||
            (expanded += entry.uncompressedSize) > 100 * 1024 * 1024) {
          stop(new ArtifactPreflightError("entry_expansion_limit")); return;
        }
        if ((entry.generalPurposeBitFlag & 1) !== 0) { stop(new ArtifactPreflightError("encrypted")); return; }
        if (/\.(zip|jar|7z|rar)$/i.test(name)) { stop(new ArtifactPreflightError("active_content")); return; }
        if (/(?:vbaProject|activeX|embeddings|oleObject|scripts?\/|\.exe$|\.dll$)/i.test(name)) {
          stop(new ArtifactPreflightError("active_content")); return;
        }
        if (name.endsWith("/")) { zip?.readEntry(); return; }
        zip?.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { stop(new ArtifactPreflightError("malformed")); return; }
          const chunks: Buffer[] = [];
          let actual = 0;
          stream.on("data", (chunk: Buffer) => {
            actual += chunk.length;
            if (actual > 20 * 1024 * 1024) { stream.destroy(); stop(new ArtifactPreflightError("entry_expansion_limit")); return; }
            if (/\.(xml|rels)$/i.test(name)) chunks.push(chunk);
          });
          stream.on("error", () => stop(new ArtifactPreflightError("malformed")));
          stream.on("end", () => {
            if (done) return;
            if (actual !== entry.uncompressedSize) { stop(new ArtifactPreflightError("malformed")); return; }
            if (chunks.length) {
              const xml = Buffer.concat(chunks).toString("utf8");
              if (/<!DOCTYPE|<!ENTITY/i.test(xml)) { stop(new ArtifactPreflightError("xxe")); return; }
              if (/TargetMode\s*=\s*["']External["']/i.test(xml)) {
                stop(new ArtifactPreflightError("external_relationship")); return;
              }
            }
            zip?.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
}

export async function preflightArtifact(bytes: Uint8Array, filename: string, declaredType: string): Promise<Preflight> {
  if (!bytes.byteLength || bytes.byteLength > 10_485_760) fail("limit_exceeded");
  if (filename.length > 255 || /[\\/\x00-\x1f\x7f]/.test(filename)) fail("unsafe_filename");
  const extension = filename.split(".").at(-1)?.toLowerCase() ?? "";
  const expected = byExtension[extension];
  if (!expected || expected.mime !== declaredType) fail("type_mismatch");
  const buffer = Buffer.from(bytes);
  const format = expected.format;
  if (format === "txt" || format === "md" || format === "csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      if (text.includes("\0")) fail("invalid_utf8");
      return { format, entryNames: [], text };
    } catch (error) {
      if (error instanceof ArtifactPreflightError) throw error;
      fail("invalid_utf8");
    }
  }
  if (format === "pdf") {
    if (!buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) fail("type_mismatch");
    if (!buffer.subarray(Math.max(0, buffer.length - 1024)).includes(Buffer.from("%%EOF"))) fail("malformed");
    if (buffer.includes(Buffer.from("/Encrypt"))) fail("encrypted");
    return { format, entryNames: [] };
  }
  if (format === "png") {
    if (!buffer.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) fail("type_mismatch");
    if (buffer.length < 24 || buffer.readUInt32BE(16) * buffer.readUInt32BE(20) > 16_000_000) fail("limit_exceeded");
    return { format, entryNames: [] };
  }
  if (format === "jpeg") {
    if (buffer[0] !== 0xff || buffer[1] !== 0xd8 || buffer.at(-2) !== 0xff || buffer.at(-1) !== 0xd9) fail("type_mismatch");
    return { format, entryNames: [] };
  }
  if (!buffer.subarray(0, 4).equals(Buffer.from([0x50,0x4b,0x03,0x04]))) fail("type_mismatch");
  return { format, entryNames: await inspectZip(buffer, format) };
}
