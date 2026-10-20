import {addFeedbackEvidenceFixture} from '../../fixtures/pilot/feedback-evidence';
// Controlled unit captures only; no hosted exercise or independent review asserted.
import {it,expect,vi} from 'vitest';
import {randomUUID} from 'node:crypto';
import {rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sdkEvidenceFixture} from '../../fixtures/pilot/sdk-evidence';
import {addPartnerEvidenceFixture} from '../../fixtures/pilot/partner-evidence';
import {writeHostedPartnerEvidence} from '../../../scripts/pilot-hosted-partner-evidence';
import {writeHostedFeedbackEvidence,verifyHostedFeedbackEvidence,isVerifiedHostedFeedbackEvidence} from '../../../scripts/pilot-hosted-feedback-evidence';
import {writeEvidence,evidenceDigest,readEvidence} from '../../../scripts/pilot-evidence';
import {feedbackDigest,validateFeedbackAppend} from '../../../lib/contracts/pilot-feedback';
async function fixture(){
 const f=await sdkEvidenceFixture(),partner=await addPartnerEvidenceFixture(f),sdk=await f.complete(),run=await writeHostedPartnerEvidence({directory:f.directory,scope:f.scope,run:sdk.run}),scope=f.scope,at=new Date().toISOString();
 const {review}=await addFeedbackEvidenceFixture(f,run,partner.training);return {...f,run,review};
}
it('binds complete original automated observation histories and typed current rechecks without approving release',async()=>{const f=await fixture();try{const run=await writeHostedFeedbackEvidence(f.directory,f.run),proof=await verifyHostedFeedbackEvidence(f.directory,run);expect(isVerifiedHostedFeedbackEvidence(proof,run)).toBe(true);expect(isVerifiedHostedFeedbackEvidence({...proof},run)).toBe(false);expect(run.receipts.filter(row=>row.gateId==='G21').map(row=>row.role)).toEqual(['internal-member','assigned-partner']);}finally{await rm(f.directory,{recursive:true,force:true});}});
it('rejects arbitrary correction bytes and unmanifested observation histories',async()=>{const f=await fixture();try{const item=f.review.items[0],terminal=await readEvidence(f.directory,item.history[2].file) as Record<string,unknown>,fakeDigest=await writeEvidence(f.directory,'fake-recheck.json',{});await writeFile(join(f.directory,item.history[2].file),JSON.stringify({...terminal,transitions:(terminal.transitions as Record<string,unknown>[]).map((row,i)=>i===2?{...row,recheckReference:'fake-recheck.json',recheckDigest:fakeDigest}:row)})+'\n',{mode:0o600});const digest=evidenceDigest(await import('node:fs/promises').then(fs=>fs.readFile(join(f.directory,item.history[2].file))));await writeFile(join(f.directory,'role-observations-review.json'),JSON.stringify({...f.review,items:[{...item,history:item.history.map((row,i)=>i===2?{...row,digest}:row),recheck:{file:'fake-recheck.json',digest:fakeDigest}},f.review.items[1]]})+'\n',{mode:0o600});await expect(writeHostedFeedbackEvidence(f.directory,f.run)).rejects.toThrow('passing partner recheck');
 await writeFile(join(f.directory,item.history[2].file),JSON.stringify(terminal)+'\n',{mode:0o600});
 const duplicate=await writeEvidence(f.directory,'unmanifested.json',await readEvidence(f.directory,item.history[0].file));
 await writeFile(join(f.directory,'role-observations-review.json'),JSON.stringify({...f.review,items:[{...item,history:item.history.map((row,i)=>i===0?{file:'unmanifested.json',digest:duplicate}:row)},f.review.items[1]]})+'\n',{mode:0o600});
 await expect(writeHostedFeedbackEvidence(f.directory,f.run)).rejects.toThrow('recorded observation differs');}finally{await rm(f.directory,{recursive:true,force:true});}});
it('rejects changed original source and late or overdue independent dispositions',async()=>{const f=await fixture();try{await writeFile(join(f.directory,'role-observations-review.json'),JSON.stringify({...f.review,reviewedAt:'2026-01-01T00:00:00.000Z'})+'\n',{mode:0o600});await expect(writeHostedFeedbackEvidence(f.directory,f.run)).rejects.toThrow('training interval');
 await writeFile(join(f.directory,'role-observations-review.json'),JSON.stringify(f.review)+'\n',{mode:0o600});
 await expect(writeHostedFeedbackEvidence(f.directory,{...f.run,sourceCommit:'f'.repeat(40)})).rejects.toThrow();
 const item=f.review.items[0],terminal=await readEvidence(f.directory,item.history[2].file) as {transitions:Record<string,unknown>[]},followUpAt=new Date(Date.parse(f.review.reviewedAt)+3600000).toISOString();
 const deferred={...terminal,transitions:terminal.transitions.map((row,i)=>i===2?{state:'deferred',at:row.at,ownerReference:row.ownerReference,rationale:'Controlled unit deferral',followUpAt}:row)};
 await writeFile(join(f.directory,item.history[2].file),JSON.stringify(deferred)+'\n',{mode:0o600});
 const digest=evidenceDigest(await import('node:fs/promises').then(fs=>fs.readFile(join(f.directory,item.history[2].file))));
 const {recheck,...withoutRecheck}=item;
 await writeFile(join(f.directory,'role-observations-review.json'),JSON.stringify({...f.review,items:[{...withoutRecheck,history:item.history.map((row,i)=>i===2?{...row,digest}:row)},f.review.items[1]]})+'\n',{mode:0o600});
 const clock=vi.spyOn(Date,'now').mockReturnValue(Date.parse(followUpAt)+1);
 try{await expect(writeHostedFeedbackEvidence(f.directory,f.run)).rejects.toThrow('Unresolved or overdue');}finally{clock.mockRestore();}
 const completed=await writeHostedFeedbackEvidence(f.directory,f.run),verified=await verifyHostedFeedbackEvidence(f.directory,completed);expect(isVerifiedHostedFeedbackEvidence(verified,completed)).toBe(true);expect(isVerifiedHostedFeedbackEvidence(verified,completed,Date.parse(followUpAt)+1)).toBe(false);
}finally{await rm(f.directory,{recursive:true,force:true});}});
