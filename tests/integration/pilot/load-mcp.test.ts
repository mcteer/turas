import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {requireOwnedPilotDatabase} from '../../../scripts/pilot-environment';
import {pilotLoadEvidenceFixture} from '../../fixtures/pilot/load';
import {pilotLoadDeliveryFixture} from '../../fixtures/pilot/load-delivery';
import {pilotLoadTrainingFixture} from '../../fixtures/pilot/load-training';
import {pilotLoadKnowledgeFixture} from '../../fixtures/pilot/load-knowledge';
import {pilotLoadMcpConnections} from '../../fixtures/pilot/load-mcp';
import {withMcpConsumer} from '../../fixtures/mcp/consumer';
import {mcpToolOutputs,type McpToolName} from '../../../lib/contracts/mcp';
import {closeRuntimePool} from '../../../lib/server/db/client';
import {openOwnedPilotLoadSuite} from '../../fixtures/pilot/environment';
let owned:Awaited<ReturnType<typeof openOwnedPilotLoadSuite>>;
beforeAll(async()=>{owned=await openOwnedPilotLoadSuite({renderer:true,http:true});},120000);
afterAll(async()=>{await owned?.close();});
it('all twenty-five actual SDK consumers read five categories from normally reviewed load records without widening partner scope',async()=>{
 const pool=new Pool({connectionString:requireOwnedPilotDatabase(process.env,true)}),db=await pool.connect(),signal=AbortSignal.timeout(600000);
 try{const evidence=await pilotLoadEvidenceFixture(db,signal),delivery=await pilotLoadDeliveryFixture(db,evidence,signal);await pilotLoadTrainingFixture(db,evidence,delivery,signal);const knowledge=await pilotLoadKnowledgeFixture(db,evidence),connections=await pilotLoadMcpConnections(evidence);
  const customerId=evidence.customers[0].id,revisionId=evidence.customers[0].revisionIds[0];
  const passageIds:Record<string,string>={};for(const audience of ['internal','delivery']){
   const passage=(await db.query("SELECT p.id FROM retrieval_passages p JOIN retrieval_sources s ON s.id=p.source_id WHERE s.source_revision_id=$1 AND s.audience=$2 AND p.locators->0->>'fieldPath'='usageDescription' ORDER BY p.ordinal LIMIT 1",[revisionId,audience])).rows[0]?.id;
   if(!passage)throw Error('Exact load audience passage missing');passageIds[audience]=passage;
  }
  const operations:{name:McpToolName;arguments:Record<string,unknown>}[]=[{name:'turas_profile_read_v1',arguments:{customerId,section:'facts',limit:1}},{name:'turas_evidence_read_v1',arguments:{customerId,revisionId}},{name:'turas_knowledge_read_v1',arguments:{publicationId:knowledge.publicationId}},{name:'turas_plan_read_v1',arguments:{customerId,planId:delivery.plan.created.planId}},{name:'turas_report_read_v1',arguments:{customerId,reportId:delivery.reports[0].reportId}}];
  for(const connection of connections)await withMcpConsumer(process.env.TURAS_APP_ORIGIN!,connection.credential,async client=>{for(const operation of operations){signal.throwIfAborted();const actor=evidence.actors[connection.actorIndex],args=operation.name==='turas_evidence_read_v1'?{...operation.arguments,passageId:passageIds[actor.kind==='internal'?'internal':'delivery']}:operation.arguments;const result=await client.callTool({...operation,arguments:args});expect(mcpToolOutputs[operation.name].parse(result.structuredContent).status,`SDK actor ${connection.actorIndex} category ${operation.name}`).toBe('available');}});
  expect(connections).toHaveLength(25);expect(connections.every(c=>c.customerIds.length===100)).toBe(true);
  expect(Number((await db.query("SELECT count(*) FROM mcp_access_receipts WHERE workspace_id=$1 AND result='available' AND operation IN ('profiles','evidence','knowledge','plans','reports')",[evidence.workspaceId])).rows[0].count)).toBe(125);
  expect(Number((await db.query("SELECT count(*) FROM customer_grants WHERE workspace_id=$1 AND state='active'",[evidence.workspaceId])).rows[0].count)).toBe(2500);
 }finally{db.release();await pool.end();await closeRuntimePool();}
},660000);
