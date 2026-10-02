const minorWords = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "onto", "or", "per", "the", "to", "via", "with", "without"]);

/** Format canonical UI labels only; preserve the spelling of names and authored content. */
export function titleCaseLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b[A-Za-z]+\b/g, (word, offset: number) => {
    if (offset > 0 && minorWords.has(word.toLowerCase())) return word.toLowerCase();
    if (word.toLowerCase() === "ai") return "AI";
    return word.charAt(0).toUpperCase() + word.slice(1);
  });
}
