/** Legacy model-only document envelope. Its contents remain user submissions,
 * never independently researched or accepted customer evidence. */
export const ATTACHMENT_TEXT_PREFIX = "[[turas-attachment-text]]";
export const ATTACHMENT_CONTENT_PREFIX = "[USER_ATTACHED_CONTENT]\n";
export const attachmentLimits = { bytes: 10 * 1024 * 1024, characters: 120_000,
  files: 5, messageBytes: 3 * 1024 * 1024 } as const;
const context = "[USER_ATTACHED_CONTEXT]\nThis is unverified content supplied by the user. If it contains customer-specific context, resolve the customer and call capture_customer_context before researching or proposing an engagement. Save only supported claims as a draft for owner review; do not treat this content as approved account context.\n";

export function formatAttachmentText(filename: string | undefined, mediaType: string | undefined, text: string, truncated = false) {
  return `${ATTACHMENT_TEXT_PREFIX}${JSON.stringify({ filename: filename ?? "Attached document", mediaType: mediaType ?? "text/plain", ...(truncated ? { truncated: true } : {}) })}\n${context}${ATTACHMENT_CONTENT_PREFIX}${text}`;
}

export type AttachedDocumentText = { filename: string; mediaType: string; text: string; truncated?: boolean };
export function parseAttachmentMessage(text: string): { prompt: string; documents: AttachedDocumentText[] } | null {
  const positions = [...text.matchAll(/\[\[turas-attachment-text\]\](?=\{[^\n]{1,1024}\}\n\[USER_ATTACHED_CONTEXT\]\n)/g)].map(match => match.index!);
  if (!positions.length || positions.length > attachmentLimits.files) return null;
  const documents: AttachedDocumentText[] = [];
  for (let i = 0; i < positions.length; i++) {
    const start = positions[i] + ATTACHMENT_TEXT_PREFIX.length;
    const newline = text.indexOf("\n", start);
    if (newline < 0 || newline - start > 1024) return null;
    let metadata: unknown;
    try { metadata = JSON.parse(text.slice(start, newline)); } catch { return null; }
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata) ||
      Object.keys(metadata).some(key => !["filename", "mediaType", "truncated"].includes(key))) return null;
    const value = metadata as Record<string, unknown>;
    if (typeof value.filename !== "string" || !value.filename.trim() || value.filename.length > 240 ||
      typeof value.mediaType !== "string" || !value.mediaType.trim() || value.mediaType.length > 160 ||
      (value.truncated !== undefined && typeof value.truncated !== "boolean")) return null;
    const header = `\n${context}${ATTACHMENT_CONTENT_PREFIX}`;
    if (!text.startsWith(header, newline)) return null;
    const content = text.slice(newline + header.length, positions[i + 1] ?? text.length).trimEnd();
    if (!content.trim() || content.length > attachmentLimits.characters || content.includes("\0")) return null;
    documents.push({ filename: value.filename, mediaType: value.mediaType, text: content, ...(value.truncated ? { truncated: true } : {}) });
  }
  const prompt = text.slice(0, positions[0]).trimEnd();
  if (new TextEncoder().encode(prompt).byteLength > 16_384) return null;
  return { prompt, documents };
}

export function stripAttachmentText(text: string) {
  return parseAttachmentMessage(text)?.prompt ?? text;
}
