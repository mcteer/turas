import {mcpAcceptedPlan} from '../../fixtures/mcp/plans';
import {projectMcpTool} from '../../../lib/server/mcp/projections';
import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,withMcpDatabase } from '../../fixtures/mcp/setup';
import { withTransaction } from '../../../lib/server/db/client';
import { syntheticPlanContent } from '../../fixtures/plans/seed';
import { submitPlanCommand } from '../../../lib/server/plans/commands';
import { createPlanReviewPreview,decidePlan } from '../../../lib/server/plans/decisions';
import { readMcpPlan,listMcpPlans } from '../../../lib/server/mcp/plans';
describe('MCP accepted delivery baseline',()=>{
  it('denies internal plans to partners, grant loss and oversized complete projections',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db,'partner'),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const internal=await mcpAcceptedPlan(reviewer,reviewer,customerId,{audience:'internal'});
    await expect(withTransaction(client=>readMcpPlan(client,actor,{customerId,planId:internal.created.planId}))).rejects.toMatchObject({status:404});
    const large=await mcpAcceptedPlan(reviewer,reviewer,customerId,{large:true});
    const output=await withTransaction(client=>projectMcpTool(client,actor,'turas_plan_read_v1','plans',customerId,()=>readMcpPlan(client,actor,{customerId,planId:large.created.planId})));
    expect(output.structuredContent.status).toBe('unavailable');expect(output.structuredContent).toHaveProperty('reason','oversized');
    await db.query("UPDATE customer_grants SET state='revoked',revision=revision+1 WHERE membership_id=$1",[browser.membershipId]);
    await expect(withTransaction(client=>readMcpPlan(client,actor,{customerId,planId:large.created.planId}))).rejects.toMatchObject({status:404});
  }));
  it('withholds drafts and retains the exact accepted baseline while a newer draft exists',async()=>withMcpDatabase(async db=>{
    const {actor,browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
    const content=syntheticPlanContent();content.assertions=[];content.sourceDependencies=[];
    const created=await submitPlanCommand(browser,{action:'create',requestKey:'mcp-plan-'+randomUUID(),workspaceId:browser.workspaceId,
      customerId,workloadId:null,audience:'delivery',ownerMembershipId:browser.membershipId,content});
    expect((await withTransaction(client=>readMcpPlan(client,actor,{customerId,planId:created.planId}))).status).toBe('unavailable');
    const submitted=await submitPlanCommand(browser,{action:'submit',requestKey:'mcp-submit-'+randomUUID(),planId:created.planId,
      expectedAggregateVersion:created.aggregateVersion,revisionId:created.revisionId,contentDigest:created.contentDigest});
    const preview=await createPlanReviewPreview(reviewer,created.planId,{requestKey:'mcp-preview-'+randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,
      revisionId:submitted.revisionId,contentDigest:submitted.contentDigest});
    await decidePlan(reviewer,created.planId,{action:'accept',requestKey:'mcp-accept-'+randomUUID(),expectedAggregateVersion:submitted.aggregateVersion,
      revisionId:submitted.revisionId,contentDigest:submitted.contentDigest,reviewPreviewId:preview.previewId,rationale:'Reviewed synthetic delivery baseline',deliverySuitabilityConfirmed:true});
    const accepted=await withTransaction(client=>readMcpPlan(client,actor,{customerId,planId:created.planId}));
    expect(accepted.status).toBe('available');if(!accepted.data)throw Error('No baseline');
    expect(accepted.data.revisionId).toBe(created.revisionId);expect(accepted.data.content.sections.some(section=>section.key==='staffing')).toBe(false);
    expect(accepted.data.content.workPackages.every(work=>!('effort'in work))).toBe(true);
    const head=(await db.query('SELECT aggregate_version FROM delivery_plans WHERE id=$1',[created.planId])).rows[0];
    const draft=await submitPlanCommand(browser,{action:'save',requestKey:'mcp-save-'+randomUUID(),planId:created.planId,
      expectedAggregateVersion:Number(head.aggregate_version),parentRevisionId:created.revisionId,baseAcceptedRevisionId:created.revisionId,content:{...content,title:'New synthetic draft'},changeReason:'Synthetic change'});
    const current=await withTransaction(client=>readMcpPlan(client,actor,{customerId,planId:created.planId}));
    expect(current.data?.revisionId).toBe(created.revisionId);expect(current.data?.content.title).toBe(content.title);
    expect((await withTransaction(client=>readMcpPlan(client,actor,{customerId,planId:created.planId,expectedRevisionId:draft.revisionId}))).status).toBe('unavailable');
    const listing=await withTransaction(client=>listMcpPlans(client,actor,{customerId,limit:20}));expect(listing.data?.items).toHaveLength(1);
  }));
});
