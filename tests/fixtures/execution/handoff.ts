import {randomUUID} from "node:crypto";
import {registerBase} from "./registers";
import {readExecutionOverview,previewExecutionCommand,submitExecutionCommand} from "../../../lib/server/execution/service";
import type {ExecutionActor} from "../../../lib/server/execution/policy";
export const referenceTo=(record:{id:string;revisionId:string;revisionNumber:number;contentDigest:string})=>({id:record.id,kind:"execution_record" as const,
  sourceRevisionId:record.revisionId,generation:record.revisionNumber,contentDigest:record.contentDigest});
export const handoffRecord=(reference:ReturnType<typeof referenceTo>)=>({...registerBase(),kind:"handoff",title:"Synthetic handoff",
  references:[reference],deliverables:[{milestoneKey:"proof_done",evidenceReferenceId:reference.id}],receiver:{kind:"external",label:"Synthetic receiving owner"},
  acknowledgement:{state:"not_recorded",eventDate:null as string|null,evidenceReferenceIds:[] as string[]},openObligationIds:[] as string[]});
export const outcomeRecord=()=>({...registerBase(),kind:"outcome",title:"Synthetic measured outcome",status:"not_measured",measure:null as string|null,unit:null as string|null,
  currentValue:null as string|null,baselineValue:null as string|null,baselineUnknownReason:null as string|null,comparisonValue:null as string|null,comparisonUnknownReason:null as string|null,
  measurementStart:null as string|null,measurementEnd:null as string|null,limitationReason:"Measurement has not been collected" as string|null});
export async function waiveMilestones(f:{reviewer:ExecutionActor;engagementId:string;baselineId:string}){
  for(const key of ["proof_done","ready"]){
    const view=await readExecutionOverview(f.reviewer,f.engagementId),m=view.milestones.find(m=>m.key===key)!;
    const candidate={version:"execution-v1",action:"milestone.decide",expectedVersions:{execution:view.version,milestone:m.version},
      payload:{baselineId:f.baselineId,milestoneKey:key,decision:"waive",evidenceRevisionIds:[]}};
    await submitExecutionCommand(f.reviewer,f.engagementId,{...candidate,...await previewExecutionCommand(f.reviewer,f.engagementId,candidate),requestKey:randomUUID(),rationale:"Human explicitly waived this synthetic criterion with retained ownership"});
  }
}
