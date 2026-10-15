import type {ResearchSource} from '../solution-research/schema';
import {researchPassages} from '../solution-research/source-integrity';

const normalizedText=(value:string)=>value.replace(/\s+/gu,' ').trim();
/** The search index packs paragraphs into 2,000-character chunks. Return the
 * original complete research passages inside a hit. Never invent citation IDs
 * or truncate quotations. Unmapped index content is withheld. */
export function retainedPracticePassages(source:ResearchSource,chunk:string,query:string){
 const hit=normalizedText(chunk);
 if(!hit)return [];
 const terms=[...new Set(query.toLowerCase().match(/[\p{L}\p{N}]+/gu)??[])];
 return researchPassages(source).flatMap(passage=>{
  const text=normalizedText(passage.text);
  if(!text||!hit.includes(text))return [];
  const lower=text.toLowerCase();
  return [{passage,score:terms.filter(term=>lower.includes(term)).length}];
 }).sort((a,b)=>b.score-a.score).map(({passage})=>passage);
}
