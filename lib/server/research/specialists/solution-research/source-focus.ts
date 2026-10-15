import { z } from "zod";
import type { ResearchSource } from "./schema";
import { researchPassages } from "./source-integrity";

export const focusMatchSchema = z.object({
  passageId: z.string(), quote: z.string(),
  precedingDateHeading: z.string().nullable(), datePassageId: z.string().nullable(),
});
// Navigation within retrieved evidence, not generated claims or publication dates.
export function focusSourcePassages(source: ResearchSource, term?: string) {
  if (!term) return [];
  const passages = researchPassages(source);
  const dates = [...source.excerpt.matchAll(/^(?:#{1,6}\s*)?(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},\s*\d{4}[^\n]*$/gm)];
  let cursor = 0;
  const located = passages.map(passage => {
    const start = source.excerpt.indexOf(passage.text, cursor);
    cursor = start + passage.text.length;
    return { ...passage, start, end: cursor };
  });
  const matches: z.infer<typeof focusMatchSchema>[] = [];
  const seen = new Set<string>();
  const text = source.excerpt.toLowerCase();
  const needle = term.toLowerCase();
  for (let position = text.indexOf(needle); position >= 0 && matches.length < 24; position = text.indexOf(needle, position + needle.length)) {
    const passage = located.find(candidate => candidate.start <= position && candidate.end > position);
    if (!passage) continue;
    const heading = dates.findLast(date => date.index <= position);
    const key = `${passage.id}:${heading?.index ?? "undated"}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const datePassage = heading ? located.find(candidate => candidate.start <= heading.index && candidate.end >= heading.index + heading[0].length) : undefined;
    matches.push({ passageId: passage.id, quote: passage.text,
      precedingDateHeading: heading?.[0] ?? null, datePassageId: datePassage?.id ?? null,
    });
  }
  return matches;
}
