import type { ResearchSource } from "./source-schema";
import { researchPassages } from "./source-integrity";
import { focusSourcePassages } from "./source-focus";

export function researchPassageView(source: ResearchSource, matches = focusSourcePassages(source, source.focusTerm)) {
  const all = researchPassages(source);
  const multiDate = new Set(matches.map(m => m.precedingDateHeading).filter(Boolean)).size > 1;
  const selected = new Set<string>();
  if (multiDate) {
    for (const match of matches) {
      selected.add(match.passageId);
      if (match.datePassageId) selected.add(match.datePassageId);
    }
  } else if (all.length <= 16) {
    for (const passage of all) selected.add(passage.id);
  } else {
    // Retain the beginning for title/attribution and spread workload matches
    // across the document. Remaining passages stay available by exact ID.
    for (const passage of all.slice(0, 2)) selected.add(passage.id);
    for (const match of [...matches.slice(0, 6), ...matches.slice(-4)]) selected.add(match.passageId);
    for (const passage of all) { if (selected.size >= 12) break; selected.add(passage.id); }
  }
  return {
    passages: all.filter(p => selected.has(p.id)),
    remainingPassages: all.filter(p => !selected.has(p.id)).map(p => ({ id: p.id, preview: p.text.slice(0, 100) })),
    passageCoverage: selected.size < all.length
      ? "Selected passages plus an index of the remaining retained text. Use read_research_passages for omitted attribution, dates, claims or conflicts before concluding. A preview is a navigation hint, not sufficient citation support. Full retrieved evidence remains stored; omitted text does not establish absence."
      : "All retained page passages. Retrieval may still be truncated as indicated.",
  };
}
