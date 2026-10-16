import {randomUUID} from 'node:crypto';
import {expect,it} from 'vitest';
import {patternSchema,patternCommandSchema,fitSchema,fitDimensions,validatePublication,validateApplication,type ApplicationCommand} from '../../lib/contracts/solution-patterns';
const text='Synthetic independently reviewed generalized operating practice.';
const pattern=patternSchema.parse({title:'Synthetic scoped pattern',problem:text,prerequisites:text,approach:text,delivery:text,processAndAdoption:text,limitations:text,alternatives:text,lessons:text,outcome:{basis:'implemented',description:text,measurementLimits:text},reviewAfter:'2099-01-01'});
const fit=fitDimensions.map(dimension=>({dimension,status:'compatible' as const,evidence:text,adaptation:text}));
it('requires separate explicit reuse attestations and preserves implemented outcome basis',()=>{
 const command={action:'publish',patternId:randomUUID(),requestId:randomUUID(),expectedVersion:0,rationale:text,sourceRecordId:randomUUID(),pattern};
 expect(pattern.outcome.basis).toBe('implemented');expect(patternCommandSchema.safeParse(command).success).toBe(false);
 expect(patternCommandSchema.safeParse({...command,attestation:{generalizedContentReviewed:true,workspaceReuseApproved:true,outcomeBasisVerified:true}}).success).toBe(true);
});
it('blocks stale review, source customer identity, private URLs, email and credential assignments',()=>{
 expect(()=>validatePublication(pattern,'Source Customer')).not.toThrow();
 for(const unsafe of [{...pattern,reviewAfter:'2000-01-01'},{...pattern,title:'Source Customer private pattern'},{...pattern,approach:'See https://private.example.org/internal'},{...pattern,lessons:'Contact private@example.org for details'},{...pattern,prerequisites:'password=unreviewed-secret-value'}])expect(()=>validatePublication(unsafe,'Source Customer')).toThrow();
});
it('requires all six fit dimensions once and denies both unknown and incompatible approval while permitting explicit withdrawal',()=>{
 expect(fitSchema.safeParse(fit).success).toBe(true);expect(fitSchema.safeParse(fit.slice(1)).success).toBe(false);expect(fitSchema.safeParse([...fit.slice(1),fit[1]]).success).toBe(false);
 const command:ApplicationCommand={action:'approve',applicationId:randomUUID(),requestId:randomUUID(),expectedVersion:0,pattern:{patternId:randomUUID(),version:1},targetContextHash:'0'.repeat(64),fit,validationPlan:text,rationale:text,targetApprovalConfirmed:true};
 expect(()=>validateApplication(command)).not.toThrow();
 for(const status of ['unknown','incompatible'] as const){const changed={...command,fit:fit.map((row,index)=>index?row:{...row,status})};expect(()=>validateApplication(changed)).toThrow('Resolve unknown or incompatible');expect(()=>validateApplication({...changed,action:'withdraw'})).not.toThrow();}
});
