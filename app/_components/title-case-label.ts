/** Format canonical UI labels only; preserve the spelling of names and authored content. */
export function titleCaseLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b[a-z]/g, letter => letter.toUpperCase()).replace(/\bAi\b/g, "AI");
}
