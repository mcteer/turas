import { z } from "zod";
import { rateFreshness } from "./freshness";
import { verifiedPublicationDate } from "./source-integrity";
import type { CustomerResearchContext, ResearchSource } from "./schema";

export function sourceAgeDate(source: ResearchSource) {
  const publication = verifiedPublicationDate(source);
  if (publication) return { evidenceDate: publication, dateBasis: "publication" as const };
  // Only an unambiguous leading dated title qualifies; never use URL dates,
  // copyright years, event mentions or retrieval as publication metadata.
  const match = /^(January|February|March|April|May|June|July|August|September|October|November|December) (\d{1,2}), (\d{4})\s*[–—:|-]/.exec(source.title);
  if (match) {
    const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"].indexOf(match[1]) + 1;
    const date = `${match[3]}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
    if (z.iso.date().safeParse(date).success && date <= source.retrievedAt.slice(0, 10)) return { evidenceDate: date, dateBasis: "source_title" as const };
  }
  return { evidenceDate: null };
}

export function sourceFreshness(sources: ResearchSource[], now = new Date()) {
  return sources.map(source => ({ id: source.id, url: source.url,
    ...rateFreshness({ informationType: source.informationType, ...sourceAgeDate(source), checkedAt: source.cache?.checkedAt ?? source.retrievedAt }, now),
  }));
}
// Public context loader maps publishedAt to observedAt; it is not snapshot review time.
export function contextFreshness(context: CustomerResearchContext, now = new Date()) {
  return context.evidence.map(evidence => ({ id: evidence.id, url: null,
    ...rateFreshness({ informationType: evidence.basis === "reviewed_public_snapshot" ? "product_capability" : "account_status",
      evidenceDate: evidence.observedAt, dateBasis: evidence.basis === "reviewed_public_snapshot" ? "publication" : "observation",
      checkedAt: evidence.basis === "reviewed_public_snapshot" ? null : evidence.observedAt + "T00:00:00.000Z", reviewAfter: evidence.reviewAfter }, now),
  }));
}
