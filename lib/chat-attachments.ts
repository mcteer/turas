export function getWebUrl(value: string): URL | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

export function getMessageLinks(text: string): string[] {
  const candidates = text.match(/https?:\/\/[^\s<>"`]+/gi) ?? [];
  return [...new Set(candidates.map(cleanMessageLink))]
    .filter((value) => getWebUrl(value) !== undefined);
}

function cleanMessageLink(value: string): string {
  let link = value.replace(/[.,;!]+$/, "");
  for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
    while (link.endsWith(close) && link.split(close).length > link.split(open).length) {
      link = link.slice(0, -1);
    }
  }
  return link;
}

export function removeMessageLink(text: string, url: string): string {
  return text.replace(/https?:\/\/[^\s<>"`]+/gi, (value) =>
    cleanMessageLink(value) === url ? value.slice(url.length) : value,
  );
}

export function getFileType(mediaType: string, filename?: string): string {
  if (mediaType === "application/pdf") return "PDF document";
  if (mediaType.startsWith("image/")) return "Image";
  if (mediaType.startsWith("audio/")) return "Audio";
  if (mediaType.startsWith("video/")) return "Video";
  if (mediaType.startsWith("text/")) return "Text document";
  const extension = filename?.split(".").at(-1);
  return filename?.includes(".") && extension ? `${extension.toUpperCase()} file` : "File";
}

export function formatBytes(size: number | undefined): string | undefined {
  if (size === undefined) return undefined;
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}
