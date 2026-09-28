import yauzl, { type Entry } from "yauzl";
import { finish, splitUnits, type Parsed } from "./types.ts";

function decodeXml(value: string): string {
  return value.replace(/&#x([0-9a-f]+);|&#([0-9]+);|&(amp|lt|gt|quot|apos);/gi,
    (_all, hex: string | undefined, decimal: string | undefined, named: string | undefined) => {
      if (hex) return String.fromCodePoint(parseInt(hex, 16));
      if (decimal) return String.fromCodePoint(parseInt(decimal, 10));
      return ({ amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" } as Record<string, string>)[named?.toLowerCase() ?? ""] ?? "";
    });
}

function tagText(xml: string, tag: string): string {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g");
  return [...xml.matchAll(pattern)].map((match) => decodeXml(match[1])).join("");
}

async function xmlParts(bytes: Uint8Array, predicate: (name: string) => boolean): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const parts = new Map<string, string>();
    yauzl.fromBuffer(Buffer.from(bytes), { lazyEntries: true, autoClose: false }, (error, zip) => {
      if (error || !zip) { reject(error ?? new Error("Malformed archive")); return; }
      let done = false;
      const fail = (reason: unknown) => { if (!done) { done = true; zip.close(); reject(reason); } };
      zip.on("error", fail);
      zip.on("end", () => { if (!done) { done = true; zip.close(); resolve(parts); } });
      zip.on("entry", (entry: Entry) => {
        if (!predicate(entry.fileName)) { zip.readEntry(); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(streamError ?? new Error("Missing part")); return; }
          const chunks: Buffer[] = [];
          let length = 0;
          stream.on("data", (chunk: Buffer) => {
            length += chunk.length;
            if (length > 20 * 1024 * 1024) { stream.destroy(); fail(new Error("Part too large")); return; }
            chunks.push(chunk);
          });
          stream.on("error", fail);
          stream.on("end", () => { if (!done) { parts.set(entry.fileName, Buffer.concat(chunks).toString("utf8")); zip.readEntry(); } });
        });
      });
      zip.readEntry();
    });
  });
}

export async function extractDocx(bytes: Uint8Array): Promise<Parsed> {
  const parts = await xmlParts(bytes, (name) => /^word\/(document|header[0-9]+|footer[0-9]+|footnotes|endnotes)\.xml$/.test(name));
  const units = [];
  for (const [part, xml] of parts) {
    let paragraph = 0;
    for (const match of xml.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
      paragraph += 1;
      const text = tagText(match[1], "w:t");
      if (!text) continue;
      units.push(...splitUnits(text, { kind: "docx", part, section: 1, paragraph }));
    }
  }
  return finish(units);
}

export async function extractPptx(bytes: Uint8Array): Promise<Parsed> {
  const parts = await xmlParts(bytes, (name) => /^ppt\/(slides\/slide|notesSlides\/notesSlide)[0-9]+\.xml$/.test(name));
  const units = [];
  const omitted: Parsed["coverage"]["omitted"] = [];
  for (const [part, xml] of [...parts].sort(([a], [b]) => a.localeCompare(b))) {
    const slide = Number(part.match(/([0-9]+)\.xml$/)?.[1] ?? 1);
    if (slide > 100) { omitted.push({ kind: "slide", count: 1, reason: "slide_limit" }); continue; }
    const notes = part.includes("notesSlides");
    let shape = 0;
    for (const shapeMatch of xml.matchAll(/<p:sp(?:\s[^>]*)?>([\s\S]*?)<\/p:sp>/g)) {
      shape += 1;
      let paragraph = 0;
      for (const paragraphMatch of shapeMatch[1].matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)) {
        paragraph += 1;
        const text = tagText(paragraphMatch[1], "a:t");
        if (text) units.push(...splitUnits(text, { kind: "pptx", slide, shape, paragraph, notes }));
      }
    }
  }
  return finish(units, units.length + omitted.length, omitted);
}
