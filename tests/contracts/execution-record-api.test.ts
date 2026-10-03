import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { withTransaction } from '../../lib/server/db/client';
import { createExecutionBaseline } from '../fixtures/execution/baseline';
import { executionHttpActor,executionHttpRequest,executionHttpContext } from '../fixtures/execution/http';
import { POST as command } from '../../app/api/execution/engagements/[engagementId]/commands/route';
import { GET as records } from '../../app/api/execution/engagements/[engagementId]/records/route';
import { GET as review } from '../../app/api/execution/engagements/[engagementId]/review/route';
import { GET as overview } from '../../app/api/execution/engagements/[engagementId]/route';
import { GET as receipt } from '../../app/api/execution/receipts/[requestKey]/route';
import { submitExecutionCommand,readExecutionOverview,readExecutionRecords,previewExecutionCommand } from '../../lib/server/execution/service';
const body=(action:string,expectedVersions:Record<string,number>,payload:unknown)=>({version:'execution-v1',action,requestKey:randomUUID(),expectedVersions,payload});
describe('execution record HTTP projections',()=>{
  it('isolates drafts, protects reviewer queue and keeps foreign lookup/errors and receipts private',async()=>{
    const f=await withTransaction(db=>createExecutionBaseline(db)),panel=await executionHttpActor('panel'),partner=await executionHttpActor('partner'),manager=await executionHttpActor('mcteer');
    const path=`/engagements/${f.engagementId}`,context=executionHttpContext(f.engagementId);
    const setup=await command(executionHttpRequest(panel,`${path}/commands`,body('setup',{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId})),context);
    expect(setup.status).toBe(200);expect(setup.headers.get('cache-control')).toBe('private, no-store');
    const initial=(await (await overview(executionHttpRequest(panel,path),context)).json()).data;
    const request=body('record.create',{execution:initial.version},{baselineId:f.baselineId,record:{kind:'activity',subtype:'work',title:'PRIVATE_EXECUTION_DRAFT_TITLE',
      narrative:'PRIVATE_EXECUTION_DRAFT_TEXT',audience:'internal',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:'proof',milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Unknown synthetic owner',references:[]}});
    const saved=await command(executionHttpRequest(panel,`${path}/commands`,request),context);expect(saved.status).toBe(200);
    const result=(await saved.json()).data;expect(result.commandId).toMatch(/^[a-f0-9-]{36}$/);
    const own=await records(executionHttpRequest(panel,`${path}/records`),context);expect(await own.text()).toContain('PRIVATE_EXECUTION_DRAFT_TEXT');
    const hidden=await records(executionHttpRequest(partner,`${path}/records`),context);expect(hidden.status).toBe(200);expect((await hidden.json()).data.records).toEqual([]);
    expect((await review(executionHttpRequest(panel,`${path}/review`),context)).status).toBe(403);
    expect((await review(executionHttpRequest(manager,`${path}/review`),context)).status).toBe(200);
    const lookup=await receipt(executionHttpRequest(partner,`/receipts/${request.requestKey}`),{params:Promise.resolve({requestKey:request.requestKey})});
    expect(lookup.status).toBe(404);expect(await lookup.text()).not.toMatch(/PRIVATE_EXECUTION|recordId|changed/);
    expect(JSON.stringify(result)).not.toMatch(/PRIVATE_EXECUTION|narrative|title|rationale/);
    const ownReceipt=await receipt(executionHttpRequest(panel,`/receipts/${request.requestKey}`),{params:Promise.resolve({requestKey:request.requestKey})});expect(ownReceipt.status).toBe(200);
    const wrong=await overview(executionHttpRequest(partner,`/engagements/${randomUUID()}`),executionHttpContext(randomUUID()));expect(wrong.status).toBe(404);
    expect((await records(executionHttpRequest(panel,`${path}/records?limit=1&limit=2`),context)).status).toBe(400);
    await withTransaction(db=>db.query("UPDATE customer_grants SET state='revoked' WHERE membership_id=$1 AND customer_id=$2",[partner.membershipId,f.customerId]));
    const denied=await records(executionHttpRequest(partner,`${path}/records`),context);expect(denied.status).toBe(404);expect(await denied.text()).not.toMatch(/PRIVATE_EXECUTION|records/);
  },180000);
  it('requires CSRF, bounded JSON and strict action authority',async()=>{
    const f=await withTransaction(db=>createExecutionBaseline(db)),panel=await executionHttpActor('panel'),context=executionHttpContext(f.engagementId),path=`/engagements/${f.engagementId}/commands`;
    const request=executionHttpRequest(panel,path,body('setup',{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId}));request.headers.delete('x-csrf-token');
    expect((await command(request,context)).status).toBe(403);
    expect((await command(executionHttpRequest(panel,path,{...body('setup',{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId}),reviewer:true}),context)).status).toBe(400);
    const tooLarge=executionHttpRequest(panel,path,{payload:'x'.repeat(131073)});expect((await command(tooLarge,context)).status).toBe(413);
  },180000);
});


it('reveals reviewed history without leaking pending correction identities to another contributor',async()=>{
  const f=await withTransaction(db=>createExecutionBaseline(db)),author=await executionHttpActor('panel'),manager=await executionHttpActor('mcteer'),partner=await executionHttpActor('partner');
  await withTransaction(db=>db.query("UPDATE customer_grants SET state='active' WHERE membership_id=$1 AND customer_id=$2",[partner.membershipId,f.customerId]));
  const path=`/engagements/${f.engagementId}`,context=executionHttpContext(f.engagementId);
  await submitExecutionCommand(author,f.engagementId,body('setup',{baseline:1,plan:f.decision.aggregateVersion},{baselineId:f.baselineId}));
  let view=await readExecutionOverview(author,f.engagementId);
  const content={kind:'activity',subtype:'work',title:'Synthetic accepted history',narrative:'SYNTHETIC_ACCEPTED_HISTORY',audience:'delivery',eventDate:new Date().toISOString().slice(0,10),timezone:'UTC',workPackageKey:'proof',milestoneKeys:[],ownerMembershipId:null,unknownOwnerReason:'Not assigned',references:[]};
  await submitExecutionCommand(author,f.engagementId,body('record.create',{execution:view.version},{baselineId:f.baselineId,record:content}));
  let record=(await readExecutionRecords(author,f.engagementId,{})).records[0];view=await readExecutionOverview(author,f.engagementId);
  await submitExecutionCommand(author,f.engagementId,body('record.submit',{execution:view.version,record:record.version},{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}));
  record=(await readExecutionRecords(manager,f.engagementId,{})).records[0];view=await readExecutionOverview(manager,f.engagementId);
  const candidate={version:'execution-v1',action:'record.accept',expectedVersions:{execution:view.version,record:record.version},payload:{recordId:record.id,revisionId:record.revisionId,contentDigest:record.contentDigest}};
  const preview=await previewExecutionCommand(manager,f.engagementId,candidate);await submitExecutionCommand(manager,f.engagementId,{...candidate,...preview,requestKey:randomUUID(),rationale:'Human reviewed exact synthetic history'});
  record=(await readExecutionRecords(author,f.engagementId,{})).records[0];view=await readExecutionOverview(author,f.engagementId);
  await submitExecutionCommand(author,f.engagementId,body('record.revise',{execution:view.version,record:record.version},{recordId:record.id,record:{...content,narrative:'PRIVATE_PENDING_HISTORY_CORRECTION'}}));
  const own=await records(executionHttpRequest(author,`${path}/records?history=1&recordId=${record.id}`),context);expect(own.status).toBe(200);expect((await own.json()).data.revisions).toHaveLength(2);
  const other=await records(executionHttpRequest(partner,`${path}/records?history=1&recordId=${record.id}`),context);expect(other.status).toBe(200);const projected=(await other.json()).data;
  expect(projected.revisions).toHaveLength(1);expect(JSON.stringify(projected)).not.toContain('PRIVATE_PENDING_HISTORY_CORRECTION');expect(projected.revisions[0].revisionId).toBe(record.revisionId);
  expect((await records(executionHttpRequest(author,`${path}/records?history=1&recordId=${record.id}&limit=51`),context)).status).toBe(400);
},180000);
