import { randomUUID } from 'node:crypto';
import { describe,expect,it } from 'vitest';
import { mcpFixture,mcpInternalPeer,withMcpDatabase } from '../../fixtures/mcp/setup';
import { mcpAcceptedPlan } from '../../fixtures/mcp/plans';
import { mcpPublishedReport } from '../../fixtures/mcp/reports';
import { withMcpConsumer } from '../../fixtures/mcp/consumer';
import { createMcpConnection } from '../../../lib/server/mcp/management';
import { mcpToolOutputs } from '../../../lib/contracts/mcp';
describe('MCP actual SDK delivery readers',()=>{
 it('reads only accepted/published content and rejects every mutation family without side effects',async()=>withMcpDatabase(async db=>{
  const {browser,customerId}=await mcpFixture(db),reviewer=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
  const plan=await mcpAcceptedPlan(browser,reviewer,customerId),report=await mcpPublishedReport(db,browser,customerId);
  const created=await createMcpConnection(browser,{requestKey:randomUUID(),name:'Synthetic delivery consumer',categories:['plans','reports'],customerIds:[customerId],lifetimeDays:7});
  if(!created.secretAvailable)throw Error('No synthetic credential');
  const counts=async()=>Object.fromEntries(await Promise.all(['plan_revisions','plan_decisions','report_revisions','report_publications','report_jobs','report_deliveries','retrieval_passages'].map(async table=>
    [table,(await db.query(`SELECT count(*)::text AS count FROM ${table}`)).rows[0].count])));
  const before=await counts();
  await withMcpConsumer(process.env.TURAS_APP_ORIGIN!,created.credential,async client=>{
   const plans=mcpToolOutputs.turas_plans_list_v1.parse((await client.callTool({name:'turas_plans_list_v1',arguments:{customerId,limit:20}})).structuredContent);
   expect(plans.status).toBe('available');if(plans.status==='available')expect(plans.data.items[0].planId).toBe(plan.created.planId);
   const accepted=mcpToolOutputs.turas_plan_read_v1.parse((await client.callTool({name:'turas_plan_read_v1',arguments:{customerId,planId:plan.created.planId}})).structuredContent);
   expect(accepted.status).toBe('available');
   const reports=mcpToolOutputs.turas_reports_list_v1.parse((await client.callTool({name:'turas_reports_list_v1',arguments:{customerId,limit:20}})).structuredContent);
   expect(reports.status).toBe('available');
   const published=mcpToolOutputs.turas_report_read_v1.parse((await client.callTool({name:'turas_report_read_v1',arguments:{customerId,reportId:report.reportId}})).structuredContent);
   expect(published.status).toBe('available');
   for(const name of ['turas_unknown_v1','turas_profile_write_v1','turas_plan_approve_v1','turas_report_generate_v1','turas_report_export_v1','turas_report_send_v1','agent_start','turas_research_v1']){
    let denied=false;try{const result=await client.callTool({name,arguments:{customerId}});denied=result.isError===true;}catch{denied=true;}expect(denied).toBe(true);
   }
  });
  expect(await counts()).toEqual(before);
 }));
});
