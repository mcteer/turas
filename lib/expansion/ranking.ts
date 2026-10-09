import type {ExpansionDisposition,ExpansionHypothesis} from '../contracts/expansion';
export const expansionRankingVersion='expansion-ranking-v1' as const;
export type ExpansionRankingInput={id:string;createdAt:string;disposition:ExpansionDisposition;reviewRequired:boolean;content:ExpansionHypothesis|null;qualificationSupported:boolean;revisitDate:string|null;decisionAt:string|null};
export function rankExpansion(input:ExpansionRankingInput){
 if(input.disposition==='deferred'||input.disposition==='dismissed')return {version:expansionRankingVersion,kind:'paused' as const,
  categories:{revisitDate:input.revisitDate,decisionAt:input.decisionAt},tuple:[input.revisitDate??'9999-12-31',input.decisionAt??input.createdAt,input.id] as const};
 const content=input.content,benefit=content?.benefit.kind??'unknown';
 const prerequisite=!content?'unknown':content.prerequisites.some(p=>p.status==='blocked')?'blocked':content.prerequisites.some(p=>p.status==='validation_needed')?'validation_needed':'satisfied';
 const evidence=!content?'unavailable':input.qualificationSupported?'qualification_supported':'discovery_only';
 const nextReviewDate=content?.nextReviewDate??null;
 return {version:expansionRankingVersion,kind:'active' as const,categories:{review:input.reviewRequired?'required' as const:'current' as const,benefit,prerequisite,evidence,nextReviewDate},
  tuple:[input.reviewRequired?0:1,{measurable_target:0,qualitative_outcome:1,unknown:2}[benefit],{satisfied:0,validation_needed:1,blocked:2,unknown:3}[prerequisite],{qualification_supported:0,discovery_only:1,unavailable:2}[evidence],nextReviewDate??'9999-12-31',input.createdAt,input.id] as const};
}
export type ExpansionRanking=ReturnType<typeof rankExpansion>;
export function compareExpansionRanking(a:ExpansionRanking,b:ExpansionRanking){
 if(a.kind!==b.kind)throw Error('Active and paused expansion filters cannot share a ranking page');
 for(let index=0;index<a.tuple.length;index++){
  const left=a.tuple[index]!,right=b.tuple[index]!;if(typeof left!==typeof right)throw Error('Expansion ranking tuple mismatch');
  if(left<right)return -1;if(left>right)return 1;
 }
 return 0;
}
