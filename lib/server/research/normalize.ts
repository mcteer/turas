import { createHash } from "node:crypto";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { HttpFailure } from "../../contracts/http";
import { researchLimits } from "../../contracts/research";

type Span = { normalizedStart: number; normalizedEnd: number;
  sourceStart: number | null; sourceEnd: number | null };
const blockedTags = new Set(["script","style","noscript","template","iframe",
  "frame","form","input","button","select","textarea","svg","canvas",
  "nav","footer","header","aside"]);
const blockTags = new Set(["p","div","section","article","main","li","tr",
  "h1","h2","h3","h4","h5","h6","br","hr","blockquote"]);

export function normalizePublicDocument(source: string,contentType: string) {
  if (source.length > 2 * researchLimits.bytesPerDocument) {
    throw new HttpFailure(413,"document_too_large","Public page too large");
  }
  const spans: Span[] = [];
  let output = "";
  function append(value: string,start: number | null,end: number | null) {
    const clean = value.replace(/\s+/g," ").normalize("NFC").trim();
    if (!clean) return;
    if (output && !output.endsWith("\n")) output += " ";
    const normalizedStart = output.length;
    output += clean;
    spans.push({ normalizedStart,normalizedEnd: output.length,
      sourceStart: start,sourceEnd: end });
    if (output.length > researchLimits.normalizedCharacters) {
      throw new HttpFailure(413,"normalized_too_large","Public page text too large");
    }
  }
  function newline() {
    if (output && !output.endsWith("\n")) output += "\n";
  }
  if (contentType === "text/plain") {
    append(source,0,source.length);
  } else {
    const document = parse(source,{ sourceCodeLocationInfo: true });
    function visit(node: DefaultTreeAdapterTypes.Node,insideBody: boolean) {
      if (node.nodeName === "#text" && "value" in node) {
        if (insideBody) append(node.value,node.sourceCodeLocation?.startOffset ?? null,
          node.sourceCodeLocation?.endOffset ?? null);
        return;
      }
      if (!("childNodes" in node)) return;
      const element = "tagName" in node ? node : null;
      if (element && (blockedTags.has(element.tagName) ||
          element.attrs.some((attr) => attr.name === "hidden" ||
            (attr.name === "aria-hidden" && attr.value === "true") ||
            (attr.name === "style" && /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attr.value))))) return;
      if (element && blockTags.has(element.tagName)) newline();
      const active = insideBody || element?.tagName === "body";
      for (const child of node.childNodes) visit(child,active);
      if (element && blockTags.has(element.tagName)) newline();
    }
    visit(document,false);
  }
  output = output.trim();
  if (!output) throw new HttpFailure(422,"empty_public_page","Public page has no usable text");
  return { text: output,spans,digest: createHash("sha256").update(output).digest("hex") };
}

/** Choose an exact substring from inert normalized text; never paraphrase content. */
export function exactPublicPassage(text: string,query: string) {
  const words = query.toLowerCase().match(/[a-z0-9]{4,}/g) ?? [];
  const lower = text.toLowerCase();
  const phrase = query.trim().toLowerCase();
  const phrasePosition = phrase ? lower.indexOf(phrase) : -1;
  const first = phrasePosition >= 0 ? phrasePosition :
    words.map((word) => lower.indexOf(word)).find((position) => position >= 0) ?? 0;
  const start = Math.max(0,first-400);
  const passage = text.slice(start,start+researchLimits.retainedPassageCharacters).trim();
  if (!passage) throw new HttpFailure(422,"empty_public_page","Public page has no usable text");
  return { text: passage,start: text.indexOf(passage),end: text.indexOf(passage)+passage.length,
    digest: createHash("sha256").update(passage).digest("hex") };
}

export function passageSupportsResearchScope(passage: string,
  mode: string,fields: Record<string,unknown>): boolean {
  const quoted = passage.toLowerCase();
  if (mode === "recon") {
    const name = typeof fields.publicName === "string" ? fields.publicName.trim().toLowerCase() : "";
    return Boolean(name) && quoted.includes(name);
  }
  if (mode === "practices") {
    const product = typeof fields.product === "string" ? fields.product.trim().toLowerCase() : "";
    const topic = typeof fields.topic === "string" ? fields.topic.trim().toLowerCase() : "";
    return Boolean(product && topic) && quoted.includes(product) && quoted.includes(topic);
  }
  return false;
}
