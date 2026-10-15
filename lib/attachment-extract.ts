import type { SupportedFileType } from "officeparser";
import { attachmentLimits } from "./conversations/attachment-text";
export { formatAttachmentText, stripAttachmentText } from "./conversations/attachment-text";

type ExtractableFileType = SupportedFileType | "json" | "txt";
const MIME_TYPES: Record<string, ExtractableFileType> = {
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/pdf": "pdf", "text/csv": "csv", "text/markdown": "md", "text/plain": "txt",
  "text/yaml": "txt", "text/xml": "txt", "application/json": "json", "application/xml": "txt",
  "application/x-yaml": "txt", "text/html": "html", "application/rtf": "rtf",
};
const EXTENSIONS = new Set(["csv", "docx", "epub", "html", "json", "log", "md", "odp", "ods", "odg", "odt", "pdf", "pptx", "rtf", "txt", "xlsx", "xml", "yaml", "yml"]);
export function getExtractableFileType(mediaType: string | undefined, filename: string | undefined): ExtractableFileType | undefined {
  const ext = filename?.toLowerCase().split(".").at(-1);
  const byExtension = ext && EXTENSIONS.has(ext) ? ["log", "xml", "yaml", "yml"].includes(ext) ? "txt" : ext as ExtractableFileType : undefined;
  return MIME_TYPES[mediaType ?? ""] ?? byExtension;
}

/** Same officeparser and bounds as legacy. Load the parser only for a document;
 * ordinary chat startup does not download its browser bundle. */
export async function extractAttachmentText(dataUrl: string, fileType: ExtractableFileType) {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("The attached document could not be read.");
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength > attachmentLimits.bytes) throw new Error("Attachments must be 10 MB or smaller.");
  const extracted = fileType === "txt" || fileType === "json" ? new TextDecoder().decode(bytes)
    : (await (await (await import("officeparser")).parseOffice(bytes, { fileType })).to("text")).value;
  const text = extracted.replace(/\u0000/g, "").trim();
  if (!text) throw new Error("The attached document does not contain readable text.");
  return { text: text.slice(0, attachmentLimits.characters), truncated: text.length > attachmentLimits.characters };
}
