import {closeRuntimePool} from '../../lib/server/db/client';
import {historicalContentWithdrawn} from '../../lib/server/retrieval/content-withdrawal';
import {Client} from 'pg';
import {isolatedChatActor} from '../fixtures/isolated-chat-actor';
import {settleSyntheticConversationAttempts} from '../fixtures/ordinary-attempt-cleanup';
import {assertHistoricalNamedContentRetained} from '../../lib/server/conversations/named-content';
import {captureGeneralContext} from '../../lib/server/conversations/general-context';
import {createOwnedConversation,getOwnedConversation} from '../../lib/server/conversations/repository';
import {assertNativeContextCurrentInTransaction} from '../../lib/server/conversations/context-fence';
import {insertBoundFixtureSession} from "../fixtures/bound-session";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { requireTestDatabaseUrl,withTestDatabase } from "../fixtures/database";
import { passageDigest } from "../../lib/server/retrieval/chunker";
import { assertRetrievalContentRetained, assertRetrievalDependenciesCurrent,
  recordRetrievalConsumption } from "../../lib/server/retrieval/fences";
import { resolveRetrievalCitation } from "../../lib/server/retrieval/citations";
import { guardNativeStream } from "../../lib/server/conversations/stream";
import { prepareAttempt } from "../../lib/server/conversations/dispatch";
import type { CurrentSession } from "../../lib/server/auth/sessions";

describe("monotonic retrieval context fence", () => {
  it("denies a prior consumed source after its accepted head is removed", async () => {
    const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: environment,TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const workspace = randomUUID();
          const customer = randomUUID();
          const principal = randomUUID();
          const membership = randomUUID();
          const conversation = randomUUID();
          const record = randomUUID();
          const revision = randomUUID();
          const receipt = randomUUID();
          const citation = randomUUID();
          const projection = randomUUID();
          const passageId = randomUUID();
          const loginSession = randomUUID();
          const session = `synthetic-${randomUUID()}`;
          const digest = passageDigest("Synthetic accepted context");
          await client.query("INSERT INTO workspaces(id,name) VALUES($1,'Synthetic fence')",[workspace]);
          await client.query("INSERT INTO principals(id,login_name,display_name) VALUES($1,$2,'Fence tester')",
            [principal,`fence-${principal}`]);
          await client.query(`INSERT INTO memberships(id,principal_id,workspace_id,kind,role)
            VALUES($1,$2,$3,'internal','admin')`,[membership,principal,workspace]);
          await client.query(`INSERT INTO customer_references(id,workspace_id,display_name,synthetic)
            VALUES($1,$2,'Synthetic fence customer',true)`,[customer,workspace]);
          await client.query(`INSERT INTO profile_records(id,workspace_id,customer_id,kind,created_by)
            VALUES($1,$2,$3,'claim',$4)`,[record,workspace,customer,membership]);
          await client.query(`INSERT INTO profile_revisions
            (id,record_id,workspace_id,customer_id,revision_number,payload_schema_version,
             payload,quality_input,author_membership_id,origin,audience,data_category,content_digest)
            VALUES($1,$2,$3,$4,1,'profile-v1',$5,'{}'::jsonb,$6,'manual',
              'internal','internal_operations',$7)`,
          [revision,record,workspace,customer,JSON.stringify({ kind: "claim",
            text: "Synthetic accepted context",sourceType: "manual" }),membership,digest]);
          await client.query(`INSERT INTO profile_review_decisions
            (revision_id,decision,reviewer_membership_id,rationale,command_receipt_id)
            VALUES($1,'accept',$2,'Synthetic review',$3)`,[revision,membership,randomUUID()]);
          await client.query("UPDATE profile_records SET current_accepted_revision_id=$2 WHERE id=$1",
            [record,revision]);
          await client.query(`INSERT INTO conversations
            (id,environment_id,workspace_id,customer_id,owner_principal_id,
             eve_session_id,creation_operation_id,binding_state,title)
            VALUES($1,$2,$3,$4,$5,$6,$7,'bound','Synthetic fence conversation')`,
          [conversation,environment,workspace,customer,principal,session,randomUUID()]);
          await insertBoundFixtureSession(client,{id:loginSession,principalId:principal,membershipId:membership,workspaceId:workspace,tokenHash:"a".repeat(64),expiresAt:new Date(Date.now()+3600000)});
          await client.query(`UPDATE conversations SET context_snapshot_schema='customer-context-v1',
            context_login_session_id=$2,context_membership_id=$3,
            context_audience='internal',context_generation=(SELECT internal_generation
              FROM customer_profile_state WHERE customer_id=$4)
            WHERE id=$1`,[conversation,loginSession,membership,customer]);
          await client.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at)
            VALUES($1,'synthetic-retrieval-fence',now())`,[environment]);
          await client.query(`INSERT INTO retrieval_sources
            (id,environment_id,workspace_id,customer_id,scope,source_kind,
             source_revision_id,audience,projection_contract,contract_digest,
             source_generation,content_digest)
            VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal',
              'test-v1',$6,1,$7)`,
          [projection,environment,workspace,customer,revision,"b".repeat(64),"c".repeat(64)]);
          const locators = [{ kind: "profile_field",fieldPath: "text" }];
          await client.query(`INSERT INTO retrieval_passages
            (id,source_id,ordinal,passage_digest,passage_text,locators)
            VALUES($1,$2,1,$3,'Synthetic accepted context',$4)`,
          [passageId,projection,digest,JSON.stringify(locators)]);
          await client.query(`INSERT INTO retrieval_receipts
            (id,environment_id,actor_membership_id,scope,workspace_id,customer_id,
             mode,citation_ids,as_of,valid_until)
            VALUES($1,$2,$3,'customer',$4,$5,'lexical_degraded',$6,
              now(),now()+interval '1 hour')`,
          [receipt,environment,membership,workspace,customer,JSON.stringify([citation])]);
          await client.query(`INSERT INTO retrieval_receipt_sources
            (id,receipt_id,ordinal,source_id,passage_id,source_kind,source_revision_id,
             source_generation,passage_digest,projection_contract,locators,valid_until)
            VALUES($1,$2,1,$3,$4,'accepted_profile',$5,1,$6,'test-v1',$7,
              now()+interval '1 hour')`,
          [citation,receipt,projection,passageId,revision,digest,JSON.stringify(locators)]);
          const actor = { sessionId: loginSession,principalId: principal,
            membershipId: membership,workspaceId: workspace,kind: "internal",role: "admin",
            token: "synthetic",loginName: "mcteer",displayName: "Fence tester",
            expiresAt: new Date(Date.now()+3_600_000) } as CurrentSession;
          await recordRetrievalConsumption(client,actor,receipt,conversation);
          await recordRetrievalConsumption(client,actor,receipt,conversation);
          const dependencies = await client.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM session_evidence_dependencies
            WHERE conversation_id=$1`,[conversation]);
          expect(dependencies.rows[0]?.count).toBe("1");
          await expect(assertRetrievalDependenciesCurrent(client,conversation))
            .resolves.toBeUndefined();
          await expect(resolveRetrievalCitation(client,actor,citation)).resolves
            .toMatchObject({ text: "Synthetic accepted context" });
          await client.query("SAVEPOINT confirmed_after_receipt");
          await client.query(`INSERT INTO evidence_conflict_targets
            (id,environment_id,scope,workspace_id,customer_id,first_kind,
             first_revision_id,second_kind,second_revision_id,period_start,period_end,
             state,rationale,updated_at)
            VALUES($1,$2,'customer',$3,$4,'accepted_profile',$5,
              'verified_research',$6,'2026-01-01','2026-12-31',
              'confirmed','Synthetic material conflict',now()+interval '1 second')`,
          [randomUUID(),environment,workspace,customer,revision,randomUUID()]);
          await expect(recordRetrievalConsumption(client,actor,receipt,conversation))
            .rejects.toMatchObject({ code: "retrieval_context_changed" });
          await expect(assertRetrievalDependenciesCurrent(client,conversation))
            .rejects.toMatchObject({ code: "retrieval_context_changed" });
          await expect(resolveRetrievalCitation(client,actor,citation))
            .rejects.toMatchObject({ status: 404 });
          await client.query("ROLLBACK TO SAVEPOINT confirmed_after_receipt");
          await client.query("RELEASE SAVEPOINT confirmed_after_receipt");
          await client.query("UPDATE retrieval_sources SET lifecycle_state='retired' WHERE id=$1",
            [projection]);
          await expect(recordRetrievalConsumption(client,actor,receipt,conversation))
            .rejects.toMatchObject({ status: 409 });
          await client.query("UPDATE retrieval_sources SET lifecycle_state='current' WHERE id=$1",
            [projection]);
          let native: ReadableStreamDefaultController<Uint8Array> | undefined;
          const guarded = guardNativeStream(new Response(new ReadableStream<Uint8Array>({
            start(controller) { native = controller; },
          })),async () => {
            await assertRetrievalDependenciesCurrent(client,conversation);
            return true;
          },10_000,5_000,async (_chunk,enqueue) => {
            await assertRetrievalDependenciesCurrent(client,conversation);
            enqueue();
          });
          const reader = guarded.body!.getReader();
          native!.enqueue(new TextEncoder().encode("current claim"));
          expect(new TextDecoder().decode((await reader.read()).value)).toBe("current claim");
          // Ordinary history may refresh receipt age or unrelated inventory;
          // withdrawal remains a content boundary even on route-style checks.
          await client.query('UPDATE conversations SET live_customer_context=true WHERE id=$1',[conversation]);
          const prepared = await prepareAttempt(actor,conversation,session,randomUUID(),
            'Current supported content',[],client);
          await captureGeneralContext(client,actor,conversation,prepared.attemptId);
          await client.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids)
            SELECT $1,$2,'internal',internal_generation,$3 FROM customer_profile_state WHERE customer_id=$2`,[prepared.attemptId,customer,['accepted_manual:'+revision]]);
          expect((await client.query('SELECT citation_id FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[conversation])).rows).toEqual([{citation_id:'accepted_manual:'+revision}]);

          await client.query('UPDATE customer_profile_state SET internal_generation=internal_generation+1 WHERE customer_id=$1',[customer]);
          await expect(getOwnedConversation(actor,conversation,client)).resolves.toMatchObject({contextStatus:'current'});
          await expect(assertRetrievalContentRetained(client,conversation)).resolves.toBeUndefined();
          await client.query("UPDATE profile_records SET current_accepted_revision_id=NULL WHERE id=$1",
            [record]);
          await expect(assertRetrievalDependenciesCurrent(client,conversation))
            .rejects.toMatchObject({ status: 409 });
          native!.enqueue(new TextEncoder().encode("stale prior-turn claim"));
          expect((await reader.read()).done).toBe(true);
          await expect(prepareAttempt(actor,conversation,session,randomUUID(),
            "Follow-up about the consumed claim",[],client))
            .rejects.toMatchObject({ code: "retrieval_context_changed" });
          const refresh=randomUUID();
          await client.query(`INSERT INTO ordinary_context_refreshes(id,attempt_id,conversation_id,packet_digest,customer_ids)
            VALUES($1,$2,$3,$4,$5)`,[refresh,prepared.attemptId,conversation,"a".repeat(64),[customer]]);
          await client.query(`INSERT INTO ordinary_evidence_refreshes(dependency_id,refresh_id)
            SELECT id,$2 FROM session_evidence_dependencies WHERE conversation_id=$1`,[conversation,refresh]);
          // The old freshness fence intentionally excludes refreshed rows.
          await expect(assertRetrievalDependenciesCurrent(client,conversation)).resolves.toBeUndefined();
          await expect(assertRetrievalContentRetained(client,conversation)).rejects.toMatchObject({status:409,code:'retrieval_context_changed'});
          await expect(getOwnedConversation(actor,conversation,client)).rejects.toMatchObject({status:409});
          await expect(assertNativeContextCurrentInTransaction(client,actor,session,undefined,false)).rejects.toMatchObject({status:409});
          await expect(prepareAttempt(actor,conversation,session,randomUUID(),
            'No continuation after ordinary refresh',[],client)).rejects.toMatchObject({status:409});
          // Customer practice captures the exact support head when consumed.
          // Scope refresh alone must never substitute a future canonical head.
          const practiceSource=randomUUID(),practiceOne=randomUUID(),practiceTwo=randomUUID(),practiceSnapshot='d'.repeat(64),practiceUrl='https://vercel.com/docs/exact-support-fixture';
          await client.query(`INSERT INTO evidence_sources(id,workspace_id,customer_id,origin,canonical_location,trusted_ingest_identity)
            VALUES($1,$2,$3,'independent_research',$4,'public-batch-fetch-v1')`,[practiceSource,workspace,customer,practiceUrl]);
          async function checkedPracticeRevision(id:string,version:number){
            await client.query(`INSERT INTO evidence_source_revisions(id,source_id,workspace_id,customer_id,version,location,title,passage,supported_claim,passage_digest,retrieval_at,rights,audience,quality_input)
              VALUES($1,$2,$3,$4,$5,$6,'Synthetic product documentation','Synthetic public product guidance only, not customer adoption.','Public documentation only',$7,clock_timestamp(),'Synthetic public fixture','internal','{}')`,[id,practiceSource,workspace,customer,version,practiceUrl,passageDigest('Synthetic public product guidance only, not customer adoption.')]);
            await client.query(`INSERT INTO research_checks(source_revision_id,trusted_ingest_identity,check_version,identity_result,scope_result,integrity_result,content_result,rationale)
              VALUES($1,'public-batch-fetch-v1','fixture-v1',true,true,true,true,'Synthetic checked metadata fixture')`,[id]);
          }
          await checkedPracticeRevision(practiceOne,1);
          await client.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
            VALUES($1,$2,$3,$3,$4,$3,'{}',false,now(),now()+interval '1 hour')`,[environment,workspace,practiceSnapshot,practiceUrl]);
          await client.query(`INSERT INTO turas_vercel_practice_sources(environment_id,workspace_id,product,topic,snapshot_id,url,title,source_type,information_type,checked_at,refresh_after)
            VALUES($1,$2,'Sandbox','Synthetic exact support',$3,$4,'Synthetic exact support','vercel_documentation','product_capability',now(),now()+interval '1 hour')`,[environment,workspace,practiceSnapshot,practiceUrl]);
          await client.query(`UPDATE general_customer_read_scopes SET citation_ids=citation_ids||$2::text[] WHERE attempt_id=$1`,[prepared.attemptId,['public_practice:'+practiceSnapshot]]);
          const supportIds=async()=>(await client.query('SELECT citation_id FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[conversation])).rows.map(row=>row.citation_id).sort();
          expect(await supportIds()).toContain('attributed_research:'+practiceOne);
          await checkedPracticeRevision(practiceTwo,2);
          await client.query('UPDATE general_customer_read_scopes SET generation=generation+1,citation_ids=citation_ids WHERE attempt_id=$1',[prepared.attemptId]);
          expect(await supportIds()).not.toContain('attributed_research:'+practiceTwo);
          await client.query('SELECT turas_record_customer_practice_support($1,$2,$3,$4,$5)',[prepared.attemptId,principal,loginSession,customer,[practiceSnapshot]]);
          expect(await supportIds()).toContain('attributed_research:'+practiceTwo);
          await client.query(`INSERT INTO evidence_source_events(id,source_revision_id,lifecycle_version,event_type,rationale)
            VALUES($1,$2,1,'withdraw','Synthetic explicit prior-revision withdrawal')`,[randomUUID(),practiceOne]);
          expect(await historicalContentWithdrawn(client,[{kind:'verified_research',id:practiceOne,workspaceId:workspace,customerId:customer}])).toBe(true);
          expect(await historicalContentWithdrawn(client,[{kind:'verified_research',id:practiceTwo,workspaceId:workspace,customerId:customer}])).toBe(false);
          // A runtime caller cannot suppress auditing with the custom owner
          // restore flag, including when tests connect as owner then SET ROLE.
          const runtimeSnapshot='e'.repeat(64);await client.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
            VALUES($1,$2,$3,$3,'https://vercel.com/docs/runtime-restore-flag-fixture',$3,'{}',false,now(),now()+interval '1 hour')`,[environment,workspace,runtimeSnapshot]);
          await client.query(`INSERT INTO turas_vercel_practice_sources(environment_id,workspace_id,product,topic,snapshot_id,url,title,source_type,information_type,checked_at,refresh_after)
            VALUES($1,$2,'Sandbox','Runtime restore flag',$3,'https://vercel.com/docs/runtime-restore-flag-fixture','Synthetic flag metadata','vercel_documentation','product_capability',now(),now()+interval '1 hour')`,[environment,workspace,runtimeSnapshot]);
          await client.query('SET LOCAL ROLE turas_runtime');await client.query("SET LOCAL turas.restore_loading='on'");
          // A runtime temp relation must not spoof the authoritative table owner.
          await client.query('CREATE TEMP TABLE pg_class(oid oid,relowner oid)');
          await client.query("INSERT INTO pg_temp.pg_class SELECT 'public.ordinary_named_content_coverage'::regclass,oid FROM pg_catalog.pg_roles WHERE rolname='turas_runtime'");
          await client.query('UPDATE general_customer_read_scopes SET citation_ids=citation_ids||$2::text[] WHERE attempt_id=$1',[prepared.attemptId,['public_practice:'+runtimeSnapshot]]);
          const runtimeCreated=(await createOwnedConversation(actor,{requestKey:randomUUID(),title:'Runtime flag cannot suppress coverage'},client)).conversation.id;
          await client.query('RESET ROLE');await client.query("SET LOCAL turas.restore_loading='off'");
          await client.query('DROP TABLE pg_temp.pg_class');
          expect(await supportIds()).toContain('public_practice:'+runtimeSnapshot);
          expect((await client.query('SELECT coverage FROM ordinary_named_content_coverage WHERE conversation_id=$1',[runtimeCreated])).rows[0].coverage).toBe('complete');
          // Active scopes/attempts have a shorter lifetime than owner history.
          const retainedBeforeScopeDeletion=await supportIds();
          await client.query('DELETE FROM general_customer_read_scopes WHERE attempt_id=$1',[prepared.attemptId]);
          expect(await supportIds()).toEqual(retainedBeforeScopeDeletion);
          await expect(assertHistoricalNamedContentRetained(client,actor,conversation)).rejects.toMatchObject({status:404});
          const privileges=(await client.query(`SELECT has_table_privilege('turas_runtime','ordinary_named_content_dependencies','SELECT') AS readable,
            has_table_privilege('turas_runtime','ordinary_named_content_dependencies','INSERT,UPDATE,DELETE') AS mutable`)).rows[0];
          expect(privileges).toEqual({readable:true,mutable:false});
          async function deniedMetadata(sql:string,params:unknown[],code:string){
            await client.query('SAVEPOINT metadata_boundary');
            try{await expect(client.query(sql,params)).rejects.toMatchObject({code});}
            finally{await client.query('ROLLBACK TO SAVEPOINT metadata_boundary');await client.query('RELEASE SAVEPOINT metadata_boundary');}
          }
          await deniedMetadata('DELETE FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[conversation],'23514');
          // An unrelated nested trigger cannot masquerade as FK retention purge.
          await client.query('CREATE TEMP TABLE nested_named_delete_fixture(conversation_id uuid)');
          await client.query(`CREATE FUNCTION pg_temp.nested_named_delete_fixture() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
            DELETE FROM ordinary_named_content_dependencies WHERE conversation_id=NEW.conversation_id;RETURN NEW;END $$`);
          await client.query(`CREATE TRIGGER nested_named_delete_fixture AFTER INSERT ON nested_named_delete_fixture
            FOR EACH ROW EXECUTE FUNCTION pg_temp.nested_named_delete_fixture()`);
          await client.query('CREATE TEMP TABLE conversations(id uuid)');
          await deniedMetadata('INSERT INTO nested_named_delete_fixture VALUES($1)',[conversation],'23514');
          await client.query('DROP TABLE pg_temp.conversations');

          await deniedMetadata("UPDATE ordinary_named_content_coverage SET coverage='legacy_gap' WHERE conversation_id=$1",[conversation],'23514');
          // Restore-loading never manufactures a complete-history assertion.
          await client.query("SET LOCAL turas.restore_loading='on'");
          const legacy=(await createOwnedConversation(actor,{requestKey:randomUUID(),title:'Synthetic restored coverage'},client)).conversation.id;
          const unknown=(await createOwnedConversation(actor,{requestKey:randomUUID(),title:'Synthetic unknown coverage'},client)).conversation.id;
          const legacyNative='wrun_'+randomUUID();
          await client.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[legacy,legacyNative]);
          // Controlled owner data-only restore loads active scopes before
          // audit/coverage rows without auto-generated completeness/conflicts.
          const restoredMessage=randomUUID(),restoredAttempt=randomUUID();
          await client.query(`INSERT INTO submitted_messages(id,conversation_id,request_key,body_digest,text) VALUES($1,$2,$3,$4,'Synthetic restored owner question')`,[restoredMessage,unknown,randomUUID(),'f'.repeat(64)]);
          await client.query(`INSERT INTO response_attempts(id,conversation_id,message_id,input_digest,dispatch_state,response_state) VALUES($1,$2,$3,$4,'prepared','completed')`,[restoredAttempt,unknown,restoredMessage,'f'.repeat(64)]);
          await client.query(`INSERT INTO general_context_receipts(attempt_id,conversation_id,workspace_id,environment_id,owner_principal_id,login_session_id,membership_id,as_of,valid_until,snapshot_digest)
            SELECT $1,$2,workspace_id,environment_id,owner_principal_id,login_session_id,membership_id,as_of,valid_until,snapshot_digest FROM general_context_receipts WHERE attempt_id=$3`,[restoredAttempt,unknown,prepared.attemptId]);
          await client.query(`INSERT INTO general_customer_read_scopes(attempt_id,customer_id,audience,generation,citation_ids) VALUES($1,$2,'internal',1,$3)`,[restoredAttempt,customer,['accepted_manual:'+revision]]);
          expect((await client.query('SELECT count(*)::int AS n FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[unknown])).rows[0].n).toBe(0);
          await client.query("SET LOCAL turas.restore_loading='off'");
          await client.query("INSERT INTO ordinary_named_content_coverage(conversation_id,coverage) VALUES($1,'legacy_gap')",[legacy]);
          await expect(getOwnedConversation(actor,legacy,client)).resolves.toMatchObject({contextStatus:'changed'});
          await expect(assertNativeContextCurrentInTransaction(client,actor,legacyNative,undefined,false)).rejects.toMatchObject({status:409,code:'named_content_legacy_gap'});
          await expect(getOwnedConversation(actor,unknown,client)).rejects.toMatchObject({status:503,code:'evidence_history_unavailable'});
          // The bounded ledger never silently drops old IDs. Only conversation
          // purge may cascade its metadata, not mutable-scope cleanup.
          const scratch=(await createOwnedConversation(actor,{requestKey:randomUUID(),title:'Synthetic metadata retention'},client)).conversation.id;
          await client.query('SAVEPOINT cumulative_capacity');
          try{
            await client.query(`INSERT INTO ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
              SELECT $1,NULL,'public_practice:'||encode(sha256(convert_to('capacity-'||i::text,'UTF8')),'hex'),$2 FROM generate_series(1,1001) i`,[scratch,prepared.attemptId]);
            await expect(client.query('SET CONSTRAINTS named_content_capacity IMMEDIATE')).rejects.toMatchObject({code:'54000'});
          }finally{await client.query('ROLLBACK TO SAVEPOINT cumulative_capacity');await client.query('RELEASE SAVEPOINT cumulative_capacity');}
          expect((await client.query('SELECT count(*)::int AS n FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[scratch])).rows[0].n).toBe(0);
          await client.query(`INSERT INTO ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id)
            VALUES($1,NULL,$2,$3)`,[scratch,'public_practice:'+'a'.repeat(64),prepared.attemptId]);
          await client.query('DELETE FROM conversations WHERE id=$1',[scratch]);
          expect((await client.query('SELECT count(*)::int AS n FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[scratch])).rows[0].n).toBe(0);
        } finally { await client.query("ROLLBACK"); }
      });
          // Real two-client metadata admission: shared receipt locks must not be
          // upgraded by parallel tools; repeatable-read appends cannot claim a
          // fresh committed capacity snapshot after waiting for another writer.
          const ownedTestUrl=requireTestDatabaseUrl(),priorRuntimeUrl=process.env.DATABASE_URL;
          const runtimeUrl=new URL(ownedTestUrl);runtimeUrl.searchParams.set('options','-c role=turas_runtime');
          vi.stubEnv('DATABASE_URL',runtimeUrl.href);await closeRuntimePool();
          const setup=new Client({connectionString:ownedTestUrl,connectionTimeoutMillis:5000});await setup.connect();
          const readers=[new Client({connectionString:ownedTestUrl,connectionTimeoutMillis:5000}),new Client({connectionString:ownedTestUrl,connectionTimeoutMillis:5000})];
          let parallelConversation:string|undefined;
          try{
            const parallelActor=await isolatedChatActor(setup,'internal','admin');await setup.query('BEGIN');
            parallelConversation=(await createOwnedConversation(parallelActor,{requestKey:randomUUID(),title:'Synthetic parallel metadata'},setup as never)).conversation.id;
            const parallelNative='wrun_'+randomUUID();await setup.query("UPDATE conversations SET binding_state='bound',eve_session_id=$2 WHERE id=$1",[parallelConversation,parallelNative]);
            await setup.query(`INSERT INTO maintenance_workers(environment_id,worker_id,last_seen_at) VALUES($1,'parallel-metadata',clock_timestamp()) ON CONFLICT(environment_id,worker_id) DO UPDATE SET last_seen_at=EXCLUDED.last_seen_at`,[environment]);
            const parallelAttempt=await prepareAttempt(parallelActor,parallelConversation,parallelNative,randomUUID(),'Synthetic metadata only',[],setup as never);
            await captureGeneralContext(setup as never,parallelActor,parallelConversation,parallelAttempt.attemptId);
            const snapshot='b'.repeat(64);await setup.query(`INSERT INTO turas_evidence_snapshots(environment_id,workspace_id,id,fetch_key,url,content_hash,source,truncated,checked_at,refresh_after)
              VALUES($1,$2,$3,$3,'https://vercel.com/docs/parallel-metadata-fixture',$3,'{}',false,now(),now()+interval '1 hour')`,[environment,parallelActor.workspaceId,snapshot]);
            await setup.query(`INSERT INTO turas_vercel_practice_sources(environment_id,workspace_id,product,topic,snapshot_id,url,title,source_type,information_type,checked_at,refresh_after)
              VALUES($1,$2,'Sandbox','Synthetic metadata',$3,'https://vercel.com/docs/parallel-metadata-fixture','Synthetic metadata','vercel_documentation','product_capability',now(),now()+interval '1 hour')`,[environment,parallelActor.workspaceId,snapshot]);
            await setup.query('COMMIT');
            const args=[parallelAttempt.attemptId,parallelActor.principalId,parallelActor.sessionId,[snapshot]];
            for(const invalid of[null,[],[null]])await expect(setup.query('SELECT turas_record_workspace_practice_content($1,$2,$3,$4)',[...args.slice(0,3),invalid])).rejects.toMatchObject({code:'23514'});
            await setup.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
            await expect(setup.query('SELECT turas_record_workspace_practice_content($1,$2,$3,$4)',args)).rejects.toMatchObject({code:'25001'});await setup.query('ROLLBACK');
            await setup.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
            await setup.query(`INSERT INTO ordinary_named_content_dependencies(conversation_id,customer_id,citation_id,first_attempt_id) VALUES($1,NULL,$2,$3)`,[parallelConversation,'public_practice:'+'c'.repeat(64),parallelAttempt.attemptId]);
            await expect(setup.query('SET CONSTRAINTS named_content_capacity IMMEDIATE')).rejects.toMatchObject({code:'25001'});await setup.query('ROLLBACK');
            await Promise.all(readers.map(async reader=>{await reader.connect();await reader.query('BEGIN');await reader.query("SET LOCAL statement_timeout='3s'");await reader.query('SELECT 1 FROM general_context_receipts WHERE attempt_id=$1 FOR KEY SHARE',[parallelAttempt.attemptId]);}));
            await Promise.all(readers.map(async reader=>{await reader.query('SELECT turas_record_workspace_practice_content($1,$2,$3,$4)',args);await reader.query('COMMIT');}));
            expect((await setup.query('SELECT count(*)::int AS n FROM ordinary_named_content_dependencies WHERE conversation_id=$1',[parallelConversation])).rows[0].n).toBe(1);
            await settleSyntheticConversationAttempts(setup,[parallelConversation]);
          }finally{
            await Promise.all(readers.map(async reader=>{await reader.query('ROLLBACK').catch(()=>{});await reader.end().catch(()=>{});}));
            await setup.query('ROLLBACK').catch(()=>{});if(parallelConversation)await settleSyntheticConversationAttempts(setup,[parallelConversation]);await setup.end();await closeRuntimePool();vi.stubEnv('DATABASE_URL',priorRuntimeUrl!);
          }

    } finally { vi.unstubAllEnvs(); }
  });
});
