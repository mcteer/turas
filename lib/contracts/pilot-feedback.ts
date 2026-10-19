import {z} from 'zod';
import {createHash} from 'node:crypto';
const digest=z.string().regex(/^[a-f0-9]{64}$/);
const reference=z.string().trim().min(1).max(150);
const participant=z.strictObject({reference,principalId:z.uuid(),membershipId:z.uuid(),kind:z.enum(['internal','partner'])});
export const pilotFeedbackScopeSchema=z.strictObject({
 contract:z.literal('pilot-feedback-scope-v1'),environmentId:z.string().min(1).max(256),workspaceId:z.uuid(),
 customerIds:z.array(z.uuid()).min(1).max(250),participants:z.array(participant).min(2).max(25),
}).superRefine((v,c)=>{
 for(const values of [v.customerIds,v.participants.map(p=>p.reference),v.participants.map(p=>p.principalId),v.participants.map(p=>p.membershipId)])
  if(new Set(values).size!==values.length)c.addIssue({code:'custom',message:'Distinct scope and participant identities required'});
 if(!v.participants.some(p=>p.kind==='internal')||!v.participants.some(p=>p.kind==='partner'))c.addIssue({code:'custom',message:'Internal and assigned partner participants required'});
});
export const pilotFeedbackItemSchema=z.strictObject({
 id:z.uuid(),journey:z.string().regex(/^J00[2-9]$|^J01[0-5]$/),participantReference:reference,severity:z.enum(['blocker','major','minor']),
 observedAt:z.iso.datetime({offset:true}),observationReference:reference,observation:z.string().trim().min(1).max(4000),
});
const transition=z.discriminatedUnion('state',[
 z.strictObject({state:z.literal('recorded'),at:z.iso.datetime({offset:true}),ownerReference:reference}),
 z.strictObject({state:z.literal('triaged'),at:z.iso.datetime({offset:true}),ownerReference:reference,rationale:z.string().trim().min(1).max(2000)}),
 z.strictObject({state:z.literal('resolved'),at:z.iso.datetime({offset:true}),ownerReference:reference,rationale:z.string().trim().min(1).max(2000),recheckReference:reference,recheckDigest:digest}),
 z.strictObject({state:z.literal('deferred'),at:z.iso.datetime({offset:true}),ownerReference:reference,rationale:z.string().trim().min(1).max(2000),followUpAt:z.iso.datetime({offset:true})}),
]);
const feedbackRecordFields={
 scope:pilotFeedbackScopeSchema,scopeDigest:digest,item:pilotFeedbackItemSchema,
 transitions:z.array(transition).min(1).max(3),previousDigest:digest.nullable(),
 sourceCommit:z.string().regex(/^[a-f0-9]{40}$/),sourceDigest:digest,catalogDigest:digest,
};
const automatedObservation=z.strictObject({
 method:z.literal('automated-role-exercise'),deploymentId:reference,
 origin:z.url().refine(value=>{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash;}),
 captureDigest:digest,runnerReference:reference,
});
export const pilotFeedbackRecordSchema=z.discriminatedUnion('contract',[
 z.strictObject({contract:z.literal('pilot-feedback-record-v1'),...feedbackRecordFields,humanReported:z.literal(true),releaseApproved:z.literal(false),messagesSent:z.literal(0)}),
 z.strictObject({contract:z.literal('pilot-feedback-record-v2'),...feedbackRecordFields,humanReported:z.literal(false),releaseApproved:z.literal(false),messagesSent:z.literal(0),automation:automatedObservation}),
]).superRefine((v,c)=>{
 const states=v.transitions.map(t=>t.state);
 if(states[0]!=='recorded'||states[1]!==undefined&&states[1]!=='triaged'||states[2]!==undefined&&!['resolved','deferred'].includes(states[2]))c.addIssue({code:'custom',message:'Feedback transitions differ'});
 if(v.item.severity==='blocker'&&states.includes('deferred'))c.addIssue({code:'custom',message:'Blockers require correction and recheck'});
 if(!v.scope.participants.some(p=>p.reference===v.item.participantReference)||v.transitions.some(t=>!v.scope.participants.some(p=>p.reference===t.ownerReference&&p.kind==='internal')))c.addIssue({code:'custom',message:'Named participant and internal follow-up owner required'});
 if(v.scopeDigest!==feedbackDigest(v.scope))c.addIssue({code:'custom',message:'Feedback scope digest differs'});
 const times=[Date.parse(v.item.observedAt),...v.transitions.map(t=>Date.parse(t.at))];
 if(times.some((at,i)=>i>0&&at<times[i-1])||v.transitions.some(t=>t.state==='deferred'&&Date.parse(t.followUpAt)<=Date.parse(t.at)))c.addIssue({code:'custom',message:'Feedback observation or follow-up time differs'});
 if((v.transitions.length===1)!==(v.previousDigest===null))c.addIssue({code:'custom',message:'Append requires a previous immutable record'});
});
export function feedbackDigest(value:unknown){return createHash('sha256').update(JSON.stringify(value)).digest('hex');}
/** Records attributable observations; neither method grants release acceptance. */
export function validateFeedbackAppend(raw:unknown,previousRaw?:unknown,now=Date.now()){
 const next=pilotFeedbackRecordSchema.parse(raw);
 if(!Number.isFinite(now)||Date.parse(next.transitions.at(-1)!.at)>now)throw Error('Future feedback observation');
 if(previousRaw===undefined){if(next.transitions.length!==1)throw Error('Prior feedback record required');return next;}
 const previous=pilotFeedbackRecordSchema.parse(previousRaw);
 if(next.contract!==previous.contract||JSON.stringify("automation" in next?next.automation:null)!==JSON.stringify("automation" in previous?previous.automation:null)||next.previousDigest!==feedbackDigest(previous)||JSON.stringify(next.scope)!==JSON.stringify(previous.scope)||JSON.stringify(next.item)!==JSON.stringify(previous.item)||next.transitions.length!==previous.transitions.length+1||JSON.stringify(next.transitions.slice(0,-1))!==JSON.stringify(previous.transitions))throw Error('Feedback history or fixed scope differs');
 return next;
}
