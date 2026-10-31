import {afterEach,describe,expect,it,vi} from 'vitest';
import {mkdir,mkdtemp,rm,readFile,writeFile,symlink} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {installBehaviorReviewCapture,recordBehaviorReviewEvent,readBehaviorReviewEvents,verifyBehaviorReviewEvidence} from '../../scripts/pilot-behavior-review-capture';
afterEach(()=>vi.unstubAllEnvs());
describe('private owned behavior review observation',()=>{
 it('rejects a changed sidecar or underlying event when verifying an actual review reference',async()=>{
  const cwd=process.cwd();await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/owned-review-unit-')),app=join(root,'app'),output=join(root,'evidence');await mkdir(join(app,'agent/hooks'),{recursive:true,mode:0o700});
  vi.stubEnv('DATABASE_URL','postgres://synthetic@127.0.0.1:9/turas_test_016_eval_012345abcdef');vi.stubEnv('TURAS_ENVIRONMENT_ID','test-pilot-012345abcdef');vi.stubEnv('TURAS_TEST_ENVIRONMENT_ID','test-pilot-012345abcdef');vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));
  try{
   const binding=await installBehaviorReviewCapture(app,output),attempt=randomUUID(),conversation=randomUUID();process.chdir(app);
   await recordBehaviorReviewEvent(binding,{type:'step.completed',meta:{id:'evt_synthetic'},data:{usage:{inputTokens:1,outputTokens:1}}},'wfr_synthetic',attempt);
   const events=await readBehaviorReviewEvents(output,attempt,'wfr_synthetic');process.chdir(cwd);
   const content=JSON.stringify({contract:'behavior-review-evidence-v1',caseId:'synthetic-case',run:1,conversationId:conversation,attemptId:attempt,nativeSessionId:'wfr_synthetic',events}),path=join(output,'case.json');await writeFile(path,content,{mode:0o600});
   const reference={path,digest:createHash('sha256').update(content).digest('hex')},expected={caseId:'synthetic-case',run:1,conversationId:conversation,modelSteps:1};
   expect((await verifyBehaviorReviewEvidence(reference,expected)).caseId).toBe('synthetic-case');
   const original=await readFile(events[0].path);await writeFile(events[0].path,Buffer.concat([original,Buffer.from(' ')]));await expect(verifyBehaviorReviewEvidence(reference,expected)).rejects.toThrow('event digest');await writeFile(events[0].path,original);
   await writeFile(path,content+' ');await expect(verifyBehaviorReviewEvidence(reference,expected)).rejects.toThrow('evidence digest');
  }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true});}
 });
 it('retains actual event arguments/results privately, redacts credentials and rejects changed replay',async()=>{
  const cwd=process.cwd();await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});
  const root=await mkdtemp(resolve('local-artifacts/016/owned-review-unit-')),app=join(root,'app'),output=join(root,'evidence');await mkdir(join(app,'agent/hooks'),{recursive:true,mode:0o700});
  vi.stubEnv('DATABASE_URL','postgres://synthetic@127.0.0.1:9/turas_test_016_eval_012345abcdef');vi.stubEnv('TURAS_ENVIRONMENT_ID','test-pilot-012345abcdef');vi.stubEnv('TURAS_TEST_ENVIRONMENT_ID','test-pilot-012345abcdef');vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));vi.stubEnv('AI_GATEWAY_API_KEY','SYNTHETIC_PRIVATE_GATEWAY_KEY');
  try{
   const binding=await installBehaviorReviewCapture(app,output),attempt=randomUUID(),event={type:'action.result',meta:{id:'evt_synthetic',at:new Date().toISOString()},data:{callId:'call_synthetic',output:{text:'Exact synthetic result',accidentalCredential:'SYNTHETIC_PRIVATE_GATEWAY_KEY'}}};
   process.chdir(app);await recordBehaviorReviewEvent(binding,event,'wfr_synthetic',attempt);await recordBehaviorReviewEvent(binding,event,'wfr_synthetic',attempt);
   const rows=await readBehaviorReviewEvents(output,attempt,'wfr_synthetic');expect(rows).toHaveLength(1);expect(rows[0].record.event.data.output.text).toBe('Exact synthetic result');expect(rows[0].record.redactedSecrets).toBe(true);expect(await readFile(rows[0].path,'utf8')).not.toContain('SYNTHETIC_PRIVATE_GATEWAY_KEY');
   await expect(recordBehaviorReviewEvent(binding,{...event,data:{different:true}},'wfr_synthetic',attempt)).rejects.toThrow();expect((await readBehaviorReviewEvents(output,attempt,'wfr_synthetic'))[0].digest).toBe(rows[0].digest);
   await expect(readBehaviorReviewEvents(output,attempt,'wfr_foreign')).rejects.toThrow('identity differs');
  }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true});}
 });
 it('rejects the selected app, changed environment and indirect attempt directories',async()=>{
  const cwd=process.cwd();await mkdir(resolve('local-artifacts/016'),{recursive:true,mode:0o700});const root=await mkdtemp(resolve('local-artifacts/016/owned-review-unit-')),app=join(root,'app'),output=join(root,'evidence');await mkdir(join(app,'agent/hooks'),{recursive:true,mode:0o700});
  vi.stubEnv('DATABASE_URL','postgres://synthetic@127.0.0.1:9/turas_test_016_eval_012345abcdef');vi.stubEnv('TURAS_ENVIRONMENT_ID','test-pilot-012345abcdef');vi.stubEnv('TURAS_TEST_ENVIRONMENT_ID','test-pilot-012345abcdef');vi.stubEnv('TURAS_CODE_VERSION','a'.repeat(40));
  try{
   await expect(installBehaviorReviewCapture(cwd,output)).rejects.toThrow('Owned behavior app copy');const binding=await installBehaviorReviewCapture(app,output),attempt=randomUUID(),event={type:'action.result',meta:{id:'evt_synthetic'},data:{}};
   process.chdir(app);vi.stubEnv('TURAS_ENVIRONMENT_ID','production');await expect(recordBehaviorReviewEvent(binding,event,'wfr_synthetic',attempt)).rejects.toThrow('binding differs');vi.stubEnv('TURAS_ENVIRONMENT_ID',binding.environmentId);
   await symlink(root,join(output,attempt));await expect(recordBehaviorReviewEvent(binding,event,'wfr_synthetic',attempt)).rejects.toThrow('Private direct');
  }finally{process.chdir(cwd);await rm(root,{recursive:true,force:true});}
 });
});
