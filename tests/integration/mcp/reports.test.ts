import {projectMcpTool} from '../../../lib/server/mcp/projections';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpAcceptedFact,mcpInternalPeer,withMcpDatabase } from '../../fixtures/mcp/setup';
import { mcpPublishedReport } from '../../fixtures/mcp/reports';
import { withTransaction } from '../../../lib/server/db/client';
import { readMcpReport,listMcpReports } from '../../../lib/server/mcp/reports';
import { mcpToolOutputs } from '../../../lib/contracts/mcp';
describe('MCP current report publication projection',()=>{
 it('withholds a report whose supporting original closure contains commercial data',async()=>withMcpDatabase(async db=>{
  const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
  const root=await mcpAcceptedFact(db,browser,reviewer,customerId),commercial=await mcpAcceptedFact(db,browser,reviewer,customerId,{audience:'internal',category:'commercial'});
  await db.query(`INSERT INTO profile_evidence_links(id,workspace_id,customer_id,profile_revision_id,supporting_profile_revision_id,support_role,scope_explanation)
    VALUES(gen_random_uuid(),$1,$2,$3,$4,'support','Synthetic excluded dependency')`,[actor.workspaceId,customerId,root.revisionId,commercial.revisionId]);
  const report=await mcpPublishedReport(db,browser,customerId,true,{sources:[{kind:'accepted_profile',id:root.recordId,revisionId:root.revisionId,generation:root.generation,contentDigest:root.digest,engagementId:null,decisionId:null}]});
  const result=await withTransaction(client=>readMcpReport(client,actor,{customerId,reportId:report.reportId}));expect(result.status).toBe('unavailable');expect(result.data).toBeNull();
 }));
 it('enforces partner delivery audience and preserves correction identity while bounding large bodies',async()=>withMcpDatabase(async db=>{
  const {actor,browser,customerId}=await mcpFixture(db,'partner');
  const internal=await mcpPublishedReport(db,browser,customerId,true,{audience:'leadership'});
  await expect(withTransaction(client=>readMcpReport(client,actor,{customerId,reportId:internal.reportId}))).rejects.toMatchObject({status:404});
  const previous=await mcpPublishedReport(db,browser,customerId);
  const correction=await mcpPublishedReport(db,browser,customerId,true,{correctionOf:previous.publicationId});
  const current=await withTransaction(client=>readMcpReport(client,actor,{customerId,reportId:correction.reportId}));
  expect(current.data?.document.correctionOf).toBe(previous.publicationId);
  const large=await mcpPublishedReport(db,browser,customerId,true,{large:true});
  const output=await withTransaction(client=>projectMcpTool(client,actor,'turas_report_read_v1','reports',customerId,()=>readMcpReport(client,actor,{customerId,reportId:large.reportId})));
  expect(output.structuredContent).toHaveProperty('reason','oversized');expect(output.structuredContent.data).toBeNull();
 }));
 it('excludes drafts, artifacts, owner labels and effort and stops on withdrawn visibility',async()=>withMcpDatabase(async db=>{
  const {actor,browser,customerId}=await mcpFixture(db);
  const draft=await mcpPublishedReport(db,browser,customerId,false);
  expect((await withTransaction(client=>readMcpReport(client,actor,{customerId,reportId:draft.reportId}))).status).toBe('unavailable');
  const published=await mcpPublishedReport(db,browser,customerId);
  const result=mcpToolOutputs.turas_report_read_v1.parse(await withTransaction(client=>readMcpReport(client,actor,{customerId,reportId:published.reportId})));
  expect(result.status).toBe('available');if(result.status!=='available')throw Error('Missing synthetic publication');
  expect(result.data.document.sections).toHaveLength(7);expect(result.data.document).not.toHaveProperty('ownerLabel');expect(result.data).not.toHaveProperty('artifacts');
  const listing=mcpToolOutputs.turas_reports_list_v1.parse(await withTransaction(client=>listMcpReports(client,actor,{customerId,limit:20})));
  expect(listing.status).toBe('available');if(listing.status==='available')expect(listing.data.items).toHaveLength(1);
  await db.query("UPDATE report_revision_states SET visibility='withheld',generation=generation+1 WHERE revision_id=$1",[published.revisionId]);
  const withdrawn=await withTransaction(client=>readMcpReport(client,actor,{customerId,reportId:published.reportId}));expect(withdrawn.status).toBe('unavailable');expect(withdrawn.data).toBeNull();
 }));
});
