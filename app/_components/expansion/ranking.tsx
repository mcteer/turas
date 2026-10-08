"use client";
import type {z} from 'zod';
import type {expansionRankingProjectionSchema} from '../../../lib/server/expansion/projection-schema';
type ExpansionRanking=z.infer<typeof expansionRankingProjectionSchema>;
export function ExpansionRankingExplanation({ranking}:{ranking:ExpansionRanking}){
 const labels={measurable_target:'Measurable Target',qualitative_outcome:'Qualitative Outcome',unknown:'Unknown',satisfied:'Satisfied',validation_needed:'Validation Needed',blocked:'Blocked',qualification_supported:'Qualification Supported',discovery_only:'Discovery Only',unavailable:'Unavailable'};
 return <details><summary>Why This Order</summary><p>{ranking.version}</p>{ranking.kind==='active'?<><p>Review: {ranking.categories.review==='required'?'Required':'Current'}</p><p>Benefit: {labels[ranking.categories.benefit]}</p><p>Prerequisites: {labels[ranking.categories.prerequisite]}</p><p>Evidence: {labels[ranking.categories.evidence]}</p><p>Next Review: {ranking.categories.nextReviewDate??'Unknown'}</p><p>Ordered by review, benefit specificity, prerequisites, evidence, next review date, creation time, then record ID.</p></>:<><p>Revisit: {ranking.categories.revisitDate??'Not Scheduled'}</p><p>Decision Date: {ranking.categories.decisionAt??'Unavailable'}</p><p>Ordered by revisit date, decision date, then record ID.</p></>}</details>;
}
