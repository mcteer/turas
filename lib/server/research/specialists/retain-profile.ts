import { withTransaction } from "../../db/client";
import { requireResearchAccount } from "./account";
import type { AppIdentity } from "./identity";
import type { ResearchSource } from "./solution-research/schema";
import { researchPassageView } from "./research-cache/passage-view";
import { communityAttributionWarning } from "./solution-research/attribution";
import { persistSpecialistCustomerResearch } from "../public-persistence";
import { assertCheckedPublicPage,publicDigest,publicSubjectMention,dossierAreas,
  type CheckedPublicPage } from "../public-dossier";

function requestUuid(value:string) {
  const hex=publicDigest(value);
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
}

/** Retain quotations through the governed profile writer and vector queue.
 * A model interpretation is never the accepted fact. */
export async function retainSpecialistProfileSources(identity:AppIdentity,accountId:string,sources:ResearchSource[]) {
  const account=await requireResearchAccount(identity,accountId);
  let updated=0,skipped=0;
  for(const source of sources) {
    if(!source.cache){skipped++;continue;}
    const row=await withTransaction(async db=>(await db.query<{check_receipt:CheckedPublicPage|null}>(
      `SELECT s.check_receipt FROM turas_evidence_snapshots s
       JOIN turas_evidence_accounts a ON a.environment_id=s.environment_id AND a.workspace_id=s.workspace_id AND a.snapshot_id=s.id
       WHERE s.environment_id=$1 AND s.workspace_id=$2 AND s.id=$3 AND a.account_id=$4 AND a.visibility='public' LIMIT 1`,
      [identity.environmentId,identity.workspaceId,source.cache!.snapshotId,accountId])).rows[0]);
    if(!row?.check_receipt)throw new Error('The retained source has no verified fetch receipt');
    const page=row.check_receipt;assertCheckedPublicPage(page);
    if(page.url!==source.url || !publicSubjectMention(page.text,account.name)){skipped++;continue;}
    const quotes=[...new Set(researchPassageView(source).passages.map(passage=>{
      if(passage.text.length>=40)return passage.text;
      const start=page.text.indexOf(passage.text);
      return start<0?'':page.text.slice(start,start+100);
    }).filter(quote=>quote.length>=40 && page.text.includes(quote)))].slice(0,12);
    if(!quotes.length){skipped++;continue;}
    const caveat=communityAttributionWarning(source);
    const dossier={description:'',findings:quotes.map(quote=>({area:'architecture_outcomes' as const,
      statement:quote,sourceIndex:0,quote,attribution:'Retained public source',
      caveats:caveat?[caveat]:[]})),coverage:dossierAreas.map(area=>({area,
      state:area==='architecture_outcomes'?'supported' as const:'incomplete' as const,
      explanation:area==='architecture_outcomes'?'Exact source passages were retained.':'A source read does not establish a complete assessment of this area.'})),
      unknowns:['Source retention does not establish private operating status or a complete customer-state assessment.']};
    const requestKey=requestUuid(JSON.stringify([accountId,source.cache.snapshotId,page.retrievedAt,quotes]));
    const result=await persistSpecialistCustomerResearch(identity,{requestKey,
      batchDigest:publicDigest(JSON.stringify([source.cache.snapshotId,page.normalizedDigest,quotes])),
      customer:{name:account.name,industries:[],directoryListed:false,stories:[{url:page.url,title:page.title}]},dossier,
      usage:{searches:0,fetches:0,inputTokens:0,outputTokens:0,costUsd:null,model:'server-source-retention',modelCalls:0}},[page],accountId);
    if(!result.replayed)updated++;
  }
  return {updated,skipped};
}
