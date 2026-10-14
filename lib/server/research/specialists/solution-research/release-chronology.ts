import { z } from "zod";
import type { ResearchSource } from "./schema";
import { focusSourcePassages } from "./source-focus";
import { researchPassages } from "./source-integrity";

export const releaseChronologySchema = z.object({
  sourceId: z.string(), url: z.url(), title: z.string(), focusTerm: z.string(),
  dateMeaning: z.literal("documented_by"),
  firstAvailability: z.literal("not_established"),
  omittedDateCount: z.number().int().nonnegative(),
  entries: z.array(z.object({
    documentedBy: z.iso.date(), heading: z.string(),
    datePassageId: z.string(), dateQuote: z.string(),
    passages: z.array(z.object({ id: z.string(), quote: z.string() })).max(24),
  }).strict()).max(4),
}).strict();
export type ReleaseChronology = z.infer<typeof releaseChronologySchema>;

function headingDate(heading: string, retrievedAt: string) {
  const match = /(?:^|\s)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s*(\d{4})/.exec(heading);
  if (!match) return null;
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(match[1]) + 1;
  const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  return z.iso.date().safeParse(date).success && date <= retrievedAt.slice(0, 10) ? date : null;
}

// Keep dated evidence independently of the model's selected findings. A section
// date proves when a capability was documented, not when it first became available.
export function releaseChronology(source: ResearchSource): ReleaseChronology | undefined {
  if (!source.focusTerm) return undefined;
  const passages = researchPassages(source);
  const entries = new Map<string, ReleaseChronology["entries"][number]>();
  for (const match of focusSourcePassages(source, source.focusTerm)) {
    const date = match.precedingDateHeading && headingDate(match.precedingDateHeading, source.retrievedAt);
    const datePassage = passages.find(passage => passage.id === match.datePassageId);
    if (!date || !datePassage || !match.precedingDateHeading) continue;
    const entry = entries.get(date) ?? { documentedBy: date, heading: match.precedingDateHeading,
      datePassageId: datePassage.id, dateQuote: datePassage.text, passages: [] };
    if (!entry.passages.some(passage => passage.id === match.passageId))
      entry.passages.push({ id: match.passageId, quote: match.quote });
    entries.set(date, entry);
  }
  if (!entries.size) return undefined;
  return releaseChronologySchema.parse({ sourceId: source.id, url: source.url, title: source.title,
    focusTerm: source.focusTerm, dateMeaning: "documented_by", firstAvailability: "not_established",
    omittedDateCount: Math.max(0, entries.size - 4),
    entries: [...entries.values()].sort((a, b) => b.documentedBy.localeCompare(a.documentedBy)).slice(0, 4),
  });
}

export function missingChronologyEntries(chronology: ReleaseChronology | undefined,
  findings: { sourceId: string; passageId: string; supportingPassageIds?: string[] }[]) {
  if (!chronology) return [];
  return chronology.entries.filter(entry => !findings.some(finding => {
    if (finding.sourceId !== chronology.sourceId) return false;
    const ids = new Set([finding.passageId, ...(finding.supportingPassageIds ?? [])]);
    return ids.has(entry.datePassageId) && entry.passages.some(passage => ids.has(passage.id));
  }));
}
