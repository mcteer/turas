import { z } from "zod";
import type { ResearchSource } from "./source-schema";

// Conservative page-label extraction. Unlabeled, updated, ambiguous and
// unsupported date formats remain unknown rather than borrowing retrieval time.
export function publicationEvidence(excerpt: string) {
  const candidates: { date: string; quote: string }[] = [];
  for (const line of excerpt.split(/\r?\n/)) {
    const label = line.trim().replace(/^[#*\s]+|[*\s]+$/g, "");
    const match = /^(?:published(?: on| at)?|publication date)\s*:?\s*\*{0,2}\s*(\d{4}-\d{2}-\d{2})\s*\*{0,2}$/i.exec(label);
    if (match && z.iso.date().safeParse(match[1]).success && line.length <= 500)
      candidates.push({ date: match[1], quote: line });
  }
  return new Set(candidates.map((candidate) => candidate.date)).size === 1
    ? candidates[0] ?? null : null;
}

export function verifiedPublicationDate(source: ResearchSource) {
  const publication = source.publication;
  return publication && source.excerpt.includes(publication.quote)
    && publicationEvidence(publication.quote)?.date === publication.date
    && publication.date <= source.retrievedAt.slice(0, 10)
    ? publication.date : null;
}

export function researchPassages(source: ResearchSource) {
  // Compacted handoffs must preserve original boundaries and IDs. Re-splitting
  // joined excerpts could turn noncontiguous page text into a single quotation.
  if (source.retainedPassages)
    return source.retainedPassages.filter(passage => source.excerpt.includes(passage.text));
  const passages: { id: string; text: string }[] = [];
  let remaining = source.excerpt;
  while (remaining.length) {
    let end = Math.min(500, remaining.length);
    if (end < remaining.length) {
      const boundary = Math.max(remaining.lastIndexOf("\n", end - 1), remaining.lastIndexOf(". ", end - 1) + 1);
      if (boundary >= 200) end = boundary;
    }
    const text = remaining.slice(0, end).trim();
    if (text) passages.push({ id: `${source.id}:p${passages.length + 1}`, text });
    remaining = remaining.slice(end);
  }
  return passages;
}

