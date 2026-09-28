import { createCanvas, loadImage } from "@napi-rs/canvas";
import { createWorker, OEM } from "tesseract.js";
import { finish, splitUnits, type Parsed } from "./types.ts";

function renderRotation(image: Awaited<ReturnType<typeof loadImage>>, degrees: number): Buffer {
  const sideways = degrees === 90 || degrees === 270;
  const canvas = createCanvas(sideways ? image.height : image.width, sideways ? image.width : image.height);
  const context = canvas.getContext("2d");
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(degrees * Math.PI / 180);
  context.drawImage(image, -image.width / 2, -image.height / 2);
  return canvas.toBuffer("image/png");
}

export async function extractImage(bytes: Uint8Array): Promise<Parsed> {
  const image = await loadImage(Buffer.from(bytes));
  if (image.width < 1 || image.height < 1 || image.width * image.height > 16_000_000) throw new Error("image_limit");
  const assetRoot = process.env.TURAS_OCR_ASSET_ROOT;
  if (!assetRoot) throw new Error("ocr_assets_unavailable");
  const worker = await createWorker("eng", OEM.LSTM_ONLY,
    { langPath: assetRoot, gzip: false, cacheMethod: "none" });
  try {
    let best = { text: "", confidence: -1, degrees: 0 };
    for (const degrees of [0, 90, 180, 270]) {
      const candidate = degrees ? renderRotation(image, degrees) : Buffer.from(bytes);
      const recognized = await worker.recognize(candidate);
      const text = recognized.data.text.trim();
      const confidence = Math.max(0, Math.min(100, recognized.data.confidence));
      if (text && confidence > best.confidence) best = { text, confidence, degrees };
      if (best.confidence >= 85 && best.text.length >= 8) break;
    }
    if (!best.text) {
      const empty = finish([], 1);
      empty.coverage.visited = 1;
      return empty;
    }
    const units = splitUnits(best.text, {
      kind: "image", width: image.width, height: image.height,
      region: [0, 0, image.width, image.height], orientation: (360 - best.degrees) % 360,
    }, { origin: "ocr", ocrConfidence: best.confidence });
    return finish(units);
  } finally { await worker.terminate(); }
}
