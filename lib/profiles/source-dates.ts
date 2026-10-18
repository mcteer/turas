/** Dates supplied in a reviewed legacy journey retain their original precision.
 * A fresh source check never invents a newer observation date. */
export function profileSourceDates(payload:Record<string,unknown>){
 const journey=payload.legacyJourney && typeof payload.legacyJourney==='object'?payload.legacyJourney as Record<string,unknown>:null;
 return {observed:payload.observedAt??payload.observationEnd??journey?.observedAt,
  review:payload.reviewAt??journey?.reviewAfter};
}
