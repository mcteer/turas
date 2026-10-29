/** An exact bounded source substring; short or whitespace-only text cannot be padded. */
export function checkedResearchExcerpt(passage: string): string | null {
  const characters = Array.from(passage);
  for (let start = 0; start <= characters.length - 40; start += 1) {
    if (/\s/.test(characters[start])) continue;
    let candidate = "";
    for (let end = start; end < characters.length && end < start + 100; end += 1) {
      if (candidate.length + characters[end].length > 100) break;
      candidate += characters[end];
    }
    candidate = candidate.trimEnd();
    if (Array.from(candidate.replace(/\s+/g," ")).length >= 40) return candidate;
  }
  return null;
}
