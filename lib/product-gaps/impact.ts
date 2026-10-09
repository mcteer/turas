export type ImpactSetRow={customerId:string;classification:'suspected'|'confirmed'|'resolved';retired?:boolean;eligible?:boolean};
/** Historical resolution is intentionally nonadditive with current customer sets. */
export function impactSets(rows:readonly ImpactSetRow[]){const confirmed=new Set<string>(),suspected=new Set<string>(),resolved=new Set<string>();for(const row of rows){if(row.retired||row.eligible===false)continue;(row.classification==='confirmed'?confirmed:row.classification==='suspected'?suspected:resolved).add(row.customerId);}return {confirmed:[...confirmed].sort(),suspectedOnly:[...suspected].filter(id=>!confirmed.has(id)).sort(),resolvedHistory:[...resolved].sort(),methodVersion:'gap-impact-v1' as const};}

export type EvidenceFreshness='recent'|'aging'|'stale'|'unknown'|'no_evidence'|'unavailable';
/** Conservative source freshness is independent of review recency and ranking. */
export function evidenceFreshness(values:readonly ('Recent'|'Aging'|'Stale'|'Unknown'|'Unavailable')[]):EvidenceFreshness{
 if(!values.length)return 'no_evidence';
 for(const state of ['Unavailable','Stale','Unknown','Aging','Recent'] as const)if(values.includes(state))return state.toLowerCase() as EvidenceFreshness;
 return 'unknown';
}
