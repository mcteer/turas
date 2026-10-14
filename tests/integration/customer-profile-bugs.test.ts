import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { withMcpEnvironment } from '../../scripts/mcp-environment';
import { withMcpDatabase, mcpFixture, mcpInternalPeer, mcpAcceptedFact } from '../fixtures/mcp/setup';
import { listCustomers } from '../../lib/server/access/customers';
import { persistPublicCustomerResearch } from '../../lib/server/research/public-persistence';
import { publicDigest, signCheckedPublicPage, dossierAreas } from '../../lib/server/research/public-dossier';
import { searchEvidence } from '../../lib/server/retrieval/search';
import { readProfile } from '../../lib/server/profiles/read';
import { closeRuntimePool } from '../../lib/server/db/client';

it('searches the whole authorized directory with stable filtered pagination and literal wildcard characters', async () => {
  await withMcpEnvironment(async () => {
    await withMcpDatabase(async db => {
      const {browser,customerId} = await mcpFixture(db), partner = await mcpFixture(db,'partner');
      for(let index=0;index<55;index++)await db.query('INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,$3,true)',[randomUUID(),browser.workspaceId,`Synthetic Customer ${String(index).padStart(2,'0')}`]);
      const target=randomUUID();await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'ZZ Synthetic Target 100%_literal',true)",[target,browser.workspaceId]);
      expect((await listCustomers(browser,25,null,' target ')).items.map(row=>row.id)).toEqual([target]);
      expect((await listCustomers(browser,25,null,'%_')).items.map(row=>row.id)).toEqual([target]);
      const first=await listCustomers(browser,25,null,'Synthetic Customer');
      expect(first.items).toHaveLength(25);expect(first.nextCursor).not.toBe(null);
      const next=await listCustomers(browser,25,first.nextCursor,'Synthetic Customer');
      expect(next.items).toHaveLength(25);expect(new Set([...first.items,...next.items].map(row=>row.id)).size).toBe(50);
      await expect(listCustomers(browser,25,first.nextCursor,'Target')).rejects.toMatchObject({code:'invalid_cursor'});
      expect((await listCustomers(partner.browser,50,null,'Target')).items).toEqual([]);
      expect((await listCustomers(partner.browser,50,null,'Synthetic MCP')).items.map(row=>row.id)).toEqual([partner.customerId]);
      await expect(listCustomers(browser,25,null,'x'.repeat(201))).rejects.toMatchObject({code:'invalid_query'});
      expect(customerId).not.toBe(target);
    });
  }, {deadlineMs:180000});
},180000);

it('automatically accepts checked research without human review while retaining date, scope, manual-claim and withdrawal boundaries', async () => {
  await withMcpEnvironment(async () => {
    await withMcpDatabase(async db => {
      const {browser,customerId}=await mcpFixture(db),admin=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
      const text='Synthetic Customer Workers run on Vercel Sandbox to execute customer-written code in isolation. This describes the Workers workload only.';
      const page=signCheckedPublicPage({url:'https://example.com/synthetic-workers',title:'Synthetic Workers on Sandbox',text,bodyDigest:publicDigest(text),normalizedDigest:publicDigest(text),retrievedAt:new Date().toISOString(),publishedAt:null,discoveryPurpose:'architecture_outcomes'});
      const command={requestKey:randomUUID(),batchDigest:'a'.repeat(64),customer:{name:'Synthetic Customer',industries:[],directoryListed:false,stories:[]},dossier:{description:'Synthetic researched business overview',findings:[{area:'architecture_outcomes',statement:text,quote:text,sourceIndex:0,attribution:'Synthetic independent case study',caveats:['Workers workload only']}],coverage:dossierAreas.map(area=>({area,state:area==='architecture_outcomes'?'supported':'not_found',explanation:'Synthetic bounded source check'})),unknowns:['Maturity is not assessed']},usage:{searches:0,fetches:1,inputTokens:0,outputTokens:0,costUsd:0,model:'synthetic-test',modelCalls:0}};
      await persistPublicCustomerResearch(admin,command,[page],customerId);
      const profile=await readProfile(browser,customerId) as {acceptedFacts:unknown[];attributedResearch:Array<{sourceRevisionId:string;acceptanceState:string;acceptanceBasis:string}>};
      expect(profile.acceptedFacts).toEqual([]);
      expect(profile.attributedResearch).toEqual([expect.objectContaining({acceptanceState:'accepted',acceptanceBasis:'independent_research'})]);
      expect((await db.query('SELECT count(*)::int AS n FROM profile_review_decisions d JOIN profile_revisions v ON v.id=d.revision_id WHERE v.customer_id=$1',[customerId])).rows[0].n).toBe(0);
      const accepted=await searchEvidence(browser,{scope:'customer',customerId,query:'Sandboxes',use:'accepted_fact',limit:10});
      expect(accepted.results).toHaveLength(1);expect(accepted.results[0].text).toBe(text);expect(accepted.results[0].quality.freshness).toBe('Unknown');
      expect((await searchEvidence(browser,{scope:'customer',customerId,query:'Sandboxes',use:'current_fact',limit:10})).results).toEqual([]);
      await mcpAcceptedFact(db,browser,admin,customerId,{accepted:false});
      expect((await searchEvidence(browser,{scope:'customer',customerId,query:'synthetic',use:'accepted_fact',limit:10})).results.every(row=>row.sourceKind==='verified_research')).toBe(true);
      const source=profile.attributedResearch[0].sourceRevisionId;
      const {withTransaction}=await import('../../lib/server/db/client');
      const {flagTypedConflict,decideTypedConflict}=await import('../../lib/server/retrieval/conflicts');
      const opposite='Synthetic Customer Workers do not run on Vercel Sandbox according to a conflicting synthetic source. This refers only to the Workers workload.';
      const secondPage=signCheckedPublicPage({...page,url:'https://example.com/synthetic-conflicting-workers',text:opposite,bodyDigest:publicDigest(opposite),normalizedDigest:publicDigest(opposite)});
      await persistPublicCustomerResearch(admin,{...command,requestKey:randomUUID(),dossier:{...command.dossier,findings:[{...command.dossier.findings[0],statement:opposite,quote:opposite}]}},[secondPage],customerId);
      const second=(await readProfile(browser,customerId) as typeof profile).attributedResearch.find(row=>row.sourceRevisionId!==source)!.sourceRevisionId;
      const flag=await withTransaction(client=>flagTypedConflict(client,admin,{idempotencyKey:randomUUID(),scope:'customer',customerId,first:{kind:'verified_research',revisionId:source},second:{kind:'verified_research',revisionId:second},periodStart:'2026-10-01',periodEnd:'2026-10-14',rationale:'Synthetic conflicting workload reports'}));
      const confirmed=await withTransaction(client=>decideTypedConflict(client,admin,flag.id,{idempotencyKey:randomUUID(),expectedVersion:flag.version,action:'confirm',rationale:'Synthetic confirmed material conflict'}));
      expect((await searchEvidence(browser,{scope:'customer',customerId,query:'Sandboxes',use:'accepted_fact',limit:10})).results).toEqual([]);
      const conflicted=await readProfile(browser,customerId) as typeof profile & {publicResearchCoverage:unknown};
      expect(conflicted.attributedResearch).toEqual([]);expect(conflicted.publicResearchCoverage).toBe(null);
      expect((await searchEvidence(browser,{scope:'customer',customerId,query:'Sandboxes',use:'discovery',limit:10})).results.every(row=>row.acceptance?.state==='discovery_only')).toBe(true);
      await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic conflicting source withdrawal')",[randomUUID(),second]);
      await withTransaction(client=>decideTypedConflict(client,admin,flag.id,{idempotencyKey:randomUUID(),expectedVersion:confirmed.version,action:'resolve',rationale:'Synthetic test resolution retaining both source histories'}));

      await db.query("INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale) VALUES($1,$2,1,'withdraw','Synthetic source withdrawal')",[randomUUID(),source]);
      expect((await searchEvidence(browser,{scope:'customer',customerId,query:'Sandboxes',use:'accepted_fact',limit:10})).results).toEqual([]);
      expect((await readProfile(browser,customerId) as typeof profile).attributedResearch).toEqual([]);
      await closeRuntimePool();
    });
  },{deadlineMs:180000});
},180000);

it('shows actual active delivery separately from maturity and excludes closed or internal-only engagements from partner summaries', async () => {
  await withMcpEnvironment(async () => {
    await withMcpDatabase(async db => {
      const {browser,customerId}=await mcpFixture(db),admin=await mcpInternalPeer(db,browser.workspaceId,false,'admin');
      const {mcpAcceptedPlan}=await import('../fixtures/mcp/plans');
      const {submitExecutionCommand}=await import('../../lib/server/execution/service');
      for(const audience of ['delivery','internal'] as const){
        const plan=await mcpAcceptedPlan(browser,admin,customerId,{audience});
        await submitExecutionCommand(browser,plan.decision.engagementId!,{version:'execution-v1',action:'setup',requestKey:randomUUID(),expectedVersions:{baseline:Number((await db.query('SELECT baseline_number FROM milestone_baselines WHERE id=$1',[plan.decision.baselineId])).rows[0].baseline_number),plan:plan.decision.aggregateVersion},payload:{baselineId:plan.decision.baselineId!}});
      }
      expect((await readProfile(browser,customerId) as {activeDelivery:unknown}).activeDelivery).toEqual({state:'ready',activeCount:2});
      const {issueSession,getCurrentSession,sessionCookieName}=await import('../../lib/server/auth/sessions');
      const organizationId=randomUUID(),membershipId=randomUUID(),principalId=randomUUID();
      const {DEMO_IDS}=await import('../../lib/server/bootstrap-ids');
      await db.query("INSERT INTO partner_organizations(id,workspace_id,name) VALUES($1,$2,'Synthetic assigned organization')",[organizationId,browser.workspaceId]);
      await db.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Synthetic profile partner')",[principalId,'synthetic-profile-partner-'+principalId]);
      await db.query("INSERT INTO memberships(id,principal_id,workspace_id,kind,role,partner_org_id) VALUES($1,$2,$3,'partner','member',$4)",[membershipId,principalId,browser.workspaceId,organizationId]);
      const identity={principalId,membershipId,workspaceId:browser.workspaceId,kind:'partner' as const,role:'member' as const,loginName:'synthetic-profile-partner-'+principalId,displayName:'Synthetic assigned partner'};
      const issued=await issueSession(identity);
      const partner=await getCurrentSession(new Request(process.env.TURAS_APP_ORIGIN!,{headers:{cookie:sessionCookieName()+"="+issued.token}}));if(!partner)throw Error("Synthetic partner session unavailable");
      await expect(readProfile(partner,customerId)).rejects.toMatchObject({status:404});
      await db.query("INSERT INTO customer_grants(id,membership_id,workspace_id,customer_id,state,revision,granted_by) VALUES($1,$2,$3,$4,'active',1,$5)",[randomUUID(),membershipId,browser.workspaceId,customerId,DEMO_IDS.mcteer]);
      expect((await readProfile(partner,customerId) as {activeDelivery:unknown}).activeDelivery).toEqual({state:'ready',activeCount:1});
      await db.query("UPDATE execution_workspaces SET state='closed' WHERE customer_id=$1",[customerId]);
      expect((await readProfile(browser,customerId) as {activeDelivery:unknown}).activeDelivery).toEqual({state:'ready',activeCount:0});
    });
  },{deadlineMs:180000});
},180000);
