/** Deterministic, synthetic-only artifact corpus. Run with Node 24 and the parser package installed. */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateRawSync } from "node:zlib";

const repo = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const out = resolve(repo, "local-artifacts/004/fixtures");
const packageRequire = createRequire(resolve(repo, "packages/artifact-extractor/package.json"));
const { createCanvas } = packageRequire("@napi-rs/canvas") as {
  createCanvas(width: number, height: number): {
    getContext(kind: "2d"): {
      fillStyle: string;
      font: string;
      fillRect(x: number, y: number, width: number, height: number): void;
      fillText(text: string, x: number, y: number): void;
      translate(x: number, y: number): void;
      rotate(angle: number): void;
    };
    toBuffer(type: "image/png" | "image/jpeg"): Buffer;
  };
};

type Entry = { name: string; data: Buffer; method?: 0 | 8 };
type Fixture = { file: string; format: string; sha256: string; bytes: number; expected: Record<string, unknown> };
const fixtures: Fixture[] = [];

function put(file: string, bytes: Buffer, format: string, expected: Record<string, unknown>): void {
  writeFileSync(resolve(out, file), bytes, { mode: 0o600 });
  fixtures.push({ file, format, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex"), expected });
}

function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zip(entries: Entry[]): Buffer {
  const bodies: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const method = entry.method ?? 8;
    const data = method === 8 ? deflateRawSync(entry.data) : entry.data;
    const crc = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    bodies.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const directoryBytes = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directoryBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, directoryBytes, end]);
}

function xml(value: string): Buffer { return Buffer.from(value, "utf8"); }

function pdf(objects: Array<string | Buffer>): Buffer {
  const chunks: Buffer[] = [Buffer.from("%PDF-1.7\n%\xE2\xE3\xCF\xD3\n", "binary")];
  const offsets = [0];
  let length = chunks[0].length;
  for (const [index, object] of objects.entries()) {
    offsets.push(length);
    const chunk = Buffer.concat([Buffer.from(`${index + 1} 0 obj\n`), Buffer.isBuffer(object) ? object : Buffer.from(object), Buffer.from("\nendobj\n")]);
    chunks.push(chunk);
    length += chunk.length;
  }
  const xrefAt = length;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) xref += `${String(offset).padStart(10, "0")} 00000 n \n`;
  xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  chunks.push(Buffer.from(xref));
  return Buffer.concat(chunks);
}

function textPdf(text: string): Buffer {
  const content = `BT /F1 18 Tf 72 700 Td (${text}) Tj ET`;
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]);
}

function imagePdf(jpeg: Buffer, width: number, height: number): Buffer {
  const content = `q ${width} 0 0 ${height} 72 500 cm /Im1 Do Q`;
  const image = Buffer.concat([Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), jpeg, Buffer.from("\nendstream")]);
  return pdf([
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>`,
    image,
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ]);
}

function docx(documentXml: string, relationshipXml?: string): Buffer {
  const entries: Entry[] = [
    { name: "[Content_Types].xml", data: xml('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>') },
    { name: "_rels/.rels", data: xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>') },
    { name: "word/document.xml", data: xml(documentXml) },
  ];
  if (relationshipXml) entries.push({ name: "word/_rels/document.xml.rels", data: xml(relationshipXml) });
  return zip(entries);
}

const docBody = '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Juniper readiness review</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Owner</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Panel</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>';

function pptx(): Buffer {
  const presentation = '<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst><p:sldSz cx="9144000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>';
  const slide = '<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Milestone"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>Delivery milestone one</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>';
  return zip([
    { name: "[Content_Types].xml", data: xml('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>') },
    { name: "_rels/.rels", data: xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>') },
    { name: "ppt/presentation.xml", data: xml(presentation) },
    { name: "ppt/_rels/presentation.xml.rels", data: xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>') },
    { name: "ppt/slides/slide1.xml", data: xml(slide) },
  ]);
}

function xlsx(): Buffer {
  const sheet = '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><cols><col min="3" max="3" hidden="1"/></cols><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Workload</t></is></c><c r="B1" t="inlineStr"><is><t>Readiness</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>Juniper API</t></is></c><c r="B2"><f>1+1</f><v>2</v></c></row><row r="3" hidden="1"><c r="C3" t="inlineStr"><is><t>Hidden internal note</t></is></c></row></sheetData><mergeCells count="1"><mergeCell ref="A4:B4"/></mergeCells></worksheet>';
  return zip([
    { name: "[Content_Types].xml", data: xml('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>') },
    { name: "_rels/.rels", data: xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>') },
    { name: "xl/workbook.xml", data: xml('<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Private" sheetId="2" state="hidden" r:id="rId2"/></sheets></workbook>') },
    { name: "xl/_rels/workbook.xml.rels", data: xml('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>') },
    { name: "xl/worksheets/sheet1.xml", data: xml(sheet) },
    { name: "xl/worksheets/sheet2.xml", data: xml(sheet.replace("Juniper API", "Personnel detail")) },
  ]);
}

mkdirSync(out, { recursive: true, mode: 0o700 });
put("simple.txt", Buffer.from("Juniper API is in a synthetic readiness review.\nNext step: test rollback.\n"), "txt", { lines: [1, 2], text: "Juniper API" });
put("notes.md", Buffer.from("# Delivery notes\n\n- Synthetic milestone: verify rollback.\n"), "md", { lines: [1, 3], text: "verify rollback" });
put("multiline.csv", Buffer.from('name,detail\r\n"Juniper API","First line\r\nsecond line"\r\n'), "csv", { record: 2, column: 2, physicalLines: [2, 3] });
put("review.pdf", textPdf("Juniper readiness review"), "pdf", { page: 1, text: "Juniper readiness review" });
const canvas = createCanvas(800, 300);
const context = canvas.getContext("2d");
context.fillStyle = "white";
context.fillRect(0, 0, 800, 300);
context.fillStyle = "black";
context.font = "48px sans-serif";
context.fillText("Synthetic invoice 42", 40, 160);
const png = canvas.toBuffer("image/png");
const jpeg = canvas.toBuffer("image/jpeg");
put("invoice.png", png, "png", { ocr: "Synthetic invoice 42", width: 800, height: 300 });
put("invoice.jpg", jpeg, "jpeg", { ocr: "Synthetic invoice 42", width: 800, height: 300 });
const rotated = createCanvas(300, 800);
const rotatedContext = rotated.getContext("2d");
rotatedContext.fillStyle = "white";
rotatedContext.fillRect(0, 0, 300, 800);
rotatedContext.translate(150, 400);
rotatedContext.rotate(Math.PI / 2);
rotatedContext.fillStyle = "black";
rotatedContext.font = "32px sans-serif";
rotatedContext.fillText("ROTATED 42", -160, 0);
put("rotated.png", rotated.toBuffer("image/png"), "png", { ocr: "ROTATED 42", orientation: 90 });
put("scanned.pdf", imagePdf(jpeg, 400, 150), "pdf", { page: 1, ocr: "Synthetic invoice 42" });
put("review.docx", docx(docBody), "docx", { part: "word/document.xml", paragraph: 1, tableCell: "Panel" });
put("milestone.pptx", pptx(), "pptx", { slide: 1, shape: "Milestone", text: "Delivery milestone one" });
put("workloads.xlsx", xlsx(), "xlsx", { sheet: "Summary", cell: "B2", formula: "1+1", cachedValue: 2, merged: "A4:B4", hiddenSheet: "Private", hiddenCell: "C3" });

const external = '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://network-canary.invalid/never-fetch" TargetMode="External"/></Relationships>';
put("external.docx", docx(docBody, external), "unsafe", { reject: "external_relationship", networkCanary: "network-canary.invalid" });
put("xxe.docx", docx(docBody.replace("<w:document", '<!DOCTYPE x [<!ENTITY e SYSTEM "https://network-canary.invalid/xxe">]><w:document')), "unsafe", { reject: "xxe" });
put("traversal.docx", zip([{ name: "../word/escape.xml", data: xml("canary") }, { name: "word/document.xml", data: xml(docBody) }]), "unsafe", { reject: "path_traversal" });
put("active.docx", zip([{ name: "word/vbaProject.bin", data: Buffer.from("synthetic inert macro marker") }, { name: "word/document.xml", data: xml(docBody) }]), "unsafe", { reject: "active_content" });
put("expansion.docx", zip([{ name: "word/document.xml", data: Buffer.alloc(21 * 1024 * 1024, 65) }]), "unsafe", { reject: "entry_expansion_limit" });
put("encrypted.pdf", Buffer.from("%PDF-1.7\n1 0 obj << /Encrypt 2 0 R >> endobj\n%%EOF\n"), "unsafe", { reject: "encrypted" });
put("corrupt.pdf", Buffer.from("%PDF-1.7\ntruncated"), "unsafe", { reject: "malformed" });
put("spoofed.pdf", png, "unsafe", { reject: "type_mismatch" });
put("bad-utf8.txt", Buffer.from([0xc3, 0x28]), "unsafe", { reject: "invalid_utf8" });
// The harmless industry-standard scanner canary is assembled here, not stored as a loose executable.
const eicar = ["X5O!P%@AP[4\\PZX54(P^)7CC)7}$", "EICAR-STANDARD-ANTIVIRUS-TEST-FILE!", "$H+H*"].join("");
put("eicar.txt", Buffer.from(eicar, "ascii"), "unsafe", { reject: "malware" });

writeFileSync(resolve(out, "manifest.json"), JSON.stringify({ version: 1, synthetic: true, fixtures }, null, 2) + "\n", { mode: 0o600 });
console.log(`Generated ${fixtures.length} synthetic artifacts in the ignored 004 fixture store.`);
