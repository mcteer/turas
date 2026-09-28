import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { createCanvas } from "@napi-rs/canvas";
import { finish, unit, type Parsed } from "./types.ts";
import { extractImage } from "./ocr.ts";

export async function extractPdf(bytes: Uint8Array): Promise<Parsed> {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: false,
    disableFontFace: true });
  const document = await task.promise;
  const units = [];
  const omitted: Parsed["coverage"]["omitted"] = [];
  const pageCount = Math.min(document.numPages, 100);
  if (document.numPages > pageCount) omitted.push({ kind: "page", count: document.numPages - pageCount, reason: "page_limit" });
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item) => "str" in item ? item.str : "").join(" ").trim();
    if (!text) {
      if (pageNumber > 10) { omitted.push({ kind: "page", count: 1, reason: "ocr_page_limit" }); continue; }
      const viewport = page.getViewport({ scale: 2 });
      const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
      if (canvas.width * canvas.height > 16_000_000) {
        omitted.push({ kind: "page", count: 1, reason: "ocr_pixel_limit" }); continue;
      }
      await page.render({ canvas: canvas as never, canvasContext: canvas.getContext("2d") as never, viewport }).promise;
      const extracted = await extractImage(canvas.toBuffer("image/png"));
      for (const item of extracted.units) {
        units.push(unit(item.text, { kind: "pdf", page: pageNumber, start: 0,
          end: Array.from(item.text).length }, { origin: "ocr", ocrConfidence: item.ocrConfidence }));
      }
      continue;
    }
    for (let start = 0; start < Array.from(text).length; start += 32_000) {
      const end = Math.min(start + 32_000, Array.from(text).length);
      units.push(unit(Array.from(text).slice(start, end).join(""),
        { kind: "pdf", page: pageNumber, start, end }));
    }
  }
  await task.destroy();
  const parsed = finish(units, pageCount + omitted.reduce((sum, item) => sum + item.count, 0), omitted);
  parsed.coverage.visited = pageCount;
  return parsed;
}
