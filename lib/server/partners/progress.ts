import type {PartnerAvailability} from "../../contracts/partners";
type Checkpoint={id:string;required:boolean;prerequisiteIds:readonly string[]};
/** Credit belongs to one exact assignment. Callers first check each immutable
 * verification's original evidence under current authorization. */
export function calculatePartnerProgress(availability:PartnerAvailability,checkpoints:readonly Checkpoint[],eligibleVerified:ReadonlySet<string>){
 if(availability!=="eligible")return null;
 const byId=new Map(checkpoints.map(cp=>[cp.id,cp])),visiting=new Set<string>(),memo=new Map<string,boolean>();
 const current=(id:string):boolean=>{if(memo.has(id))return memo.get(id)!;const cp=byId.get(id);if(!cp||!eligibleVerified.has(id)||visiting.has(id))return false;visiting.add(id);const value=cp.prerequisiteIds.every(current);visiting.delete(id);memo.set(id,value);return value;};
 const required=checkpoints.filter(cp=>cp.required),verifiedRequired=required.filter(cp=>current(cp.id)).length,totalRequired=required.length;
 if(totalRequired===0)throw Error("A delivery guide requires a required checkpoint");
 return {verifiedRequired,totalRequired,percentage:Math.floor(100*verifiedRequired/totalRequired)};
}
