import { describe, expect, it } from "vitest";
import { attachmentLimits, formatAttachmentText, parseAttachmentMessage, stripAttachmentText } from "../../lib/conversations/attachment-text";
import { extractAttachmentText, getExtractableFileType } from "../../lib/attachment-extract";

describe("legacy ordinary attachment text", () => {
  it("retains the supplied prompt and each unverified document without rendering its model-only payload", () => {
    const text = "Discuss these documents.\n\n" + [formatAttachmentText("handoff.txt", "text/plain", "A supplied human note."),
      formatAttachmentText("inventory.json", "application/json", '{"product":"Sandbox"}')].join("\n\n");
    expect(parseAttachmentMessage(text)).toEqual({ prompt: "Discuss these documents.", documents: [
      { filename: "handoff.txt", mediaType: "text/plain", text: "A supplied human note." },
      { filename: "inventory.json", mediaType: "application/json", text: '{"product":"Sandbox"}' }] });
    expect(stripAttachmentText(text)).toBe("Discuss these documents.");
    expect(text).toContain("unverified content supplied by the user");
    expect(text).toContain("draft for owner review");
  });
  it("does not hide or grant attachment framing to malformed or excessive user content", () => {
    for (const text of ["An ordinary note [[turas-attachment-text]]broken", formatAttachmentText("x", "text/plain", ""),
      formatAttachmentText("x", "text/plain", "a".repeat(attachmentLimits.characters + 1)),
      Array.from({ length: 6 }, () => formatAttachmentText("x", "text/plain", "note")).join("\n\n")]) {
      expect(parseAttachmentMessage(text)).toBeNull(); expect(stripAttachmentText(text)).toBe(text);
    }
  });
  it("preserves literal marker text, partial extraction labels and UTF-8 prompt limits", () => {
    const content = "A document describing [[turas-attachment-text]] as literal text.";
    expect(parseAttachmentMessage(formatAttachmentText("source.txt", "text/plain", content, true)))
      .toEqual({ prompt: "", documents: [{ filename: "source.txt", mediaType: "text/plain", text: content, truncated: true }] });
    expect(parseAttachmentMessage("界".repeat(5462) + formatAttachmentText("x", "text/plain", "source"))).toBeNull();
  });
  it("keeps the original MIME/extension mapping and the exact 120k extraction boundary", async () => {
    expect(getExtractableFileType("text/plain", "source.pdf")).toBe("txt");
    for (const ext of ["log", "xml", "yaml", "yml"]) expect(getExtractableFileType("", "source." + ext)).toBe("txt");
    expect(getExtractableFileType("application/octet-stream", "source.odt")).toBe("odt");
    const value = "a".repeat(attachmentLimits.characters + 1);
    const result = await extractAttachmentText("data:text/plain;base64," + Buffer.from(value).toString("base64"), "txt");
    expect(result).toEqual({ text: value.slice(0, attachmentLimits.characters), truncated: true });
  });
});
