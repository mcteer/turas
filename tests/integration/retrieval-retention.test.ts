import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import { describe,expect,it,vi } from "vitest";
import { DEMO_IDS } from "../../lib/server/bootstrap-ids";
import { withTestDatabase } from "../fixtures/database";
import { runRetrievalCleanupTick } from "../../lib/server/retrieval/cleanup";
import {insertRetrievalProfileOrigin} from '../fixtures/retrieval-profile-origin';
import {passageDigest} from '../../lib/server/retrieval/chunker';

it('advances retired-passage cleanup past empty sources across bounded runtime batches',async()=>{
 for(const [key,value] of Object.entries({
  DATABASE_URL:'postgres://localhost/turas_unused',DATABASE_URL_UNPOOLED:'postgres://localhost/turas_unused',
  TURAS_ENVIRONMENT_ID:process.env.TURAS_TEST_ENVIRONMENT_ID!,TURAS_APP_ORIGIN:'http://127.0.0.1:3000',
  TURAS_DEMO_USERNAME:'mcteer',TURAS_DEMO_PASSWORD:'synthetic',PANEL_USERNAME:'panel',PANEL_PASSWORD:'synthetic',
  PARTNER_USERNAME:'partner',PARTNER_PASSWORD:'synthetic',TURAS_MAINTENANCE_SECRET:'s'.repeat(32),
 }))vi.stubEnv(key,value);
 try{await withTestDatabase(async db=>{
  await db.query('BEGIN');
  try{
   const environment=process.env.TURAS_TEST_ENVIRONMENT_ID!,workspace=randomUUID(),customer=randomUUID();
   await db.query("INSERT INTO workspaces(id,name) VALUES($1,'Cleanup fixture')",[workspace]);
   await db.query("INSERT INTO customer_references(id,workspace_id,display_name,synthetic) VALUES($1,$2,'Cleanup customer',true)",[customer,workspace]);
   const retired:string[]=[],controls:string[]=[],empty:string[]=[];
   const vector=JSON.stringify([1,...Array(1535).fill(0)]);
   for(let index=0;index<105;index++){
    const id=randomUUID(),revisionId=randomUUID(),text=`Synthetic retired passage ${index}`,digest=passageDigest(text);
    await insertRetrievalProfileOrigin(db,{workspaceId:workspace,customerId:customer,revisionId,text,digest});
    const state=index===103?'current':index===102?'tombstoned':'retired';
    const age=index===104?30:index<2?7200:3600;
    await db.query(`INSERT INTO retrieval_sources(id,environment_id,workspace_id,customer_id,scope,source_kind,
     source_revision_id,audience,projection_contract,contract_digest,source_generation,content_digest,lifecycle_state,updated_at)
     VALUES($1,$2,$3,$4,'customer','accepted_profile',$5,'internal','test-v1',$6,1,$7,$8,now()-$9*interval '1 second')`,
     [id,environment,workspace,customer,revisionId,'a'.repeat(64),digest,state,age]);
    if(index<2){empty.push(id);continue;}
    await db.query(`INSERT INTO retrieval_passages(id,source_id,ordinal,passage_digest,passage_text,locators,
     embedding,embedding_state,embedding_contract,embedded_at) VALUES($1,$2,1,$3,$4,$5,$6::vector,'ready','embedding-v1',now())`,
     [randomUUID(),id,digest,text,JSON.stringify([{kind:'profile_field',fieldPath:'text'}]),vector]);
    (index<103?retired:controls).push(id);
   }
   expect(retired).toHaveLength(101);
   await db.query('SET LOCAL ROLE turas_runtime');
   const remaining=async(ids:string[])=>Number((await db.query('SELECT count(*)::int AS count FROM retrieval_passages WHERE source_id=ANY($1::uuid[])',[ids])).rows[0].count);
   await runRetrievalCleanupTick(db);expect(await remaining(retired)).toBe(1);
   await runRetrievalCleanupTick(db);expect(await remaining(retired)).toBe(0);
   await runRetrievalCleanupTick(db);expect(await remaining(controls)).toBe(2);
   expect(Number((await db.query('SELECT count(*)::int AS count FROM retrieval_sources WHERE id=ANY($1::uuid[])',[[...retired,...empty]])).rows[0].count)).toBe(103);
  }finally{await db.query('ROLLBACK');}
 });}finally{vi.unstubAllEnvs();}
});

describe("bounded retrieval receipt retention",() => {
  it("removes at most 100 expired receipts per maintenance tick",async () => {
    await withTestDatabase(async (client) => {
      await client.query("BEGIN");
      try {
        const marker = await client.query<{ schema_version: number; environment_id: string }>(
          "SELECT schema_version,environment_id FROM turas_environment");
        expect(marker.rows[0].schema_version).toBeGreaterThanOrEqual(28);
        expect(marker.rows[0].environment_id).toBe(process.env.TURAS_TEST_ENVIRONMENT_ID);
        await client.query(`INSERT INTO retrieval_receipts
          (id,environment_id,actor_membership_id,scope,workspace_id,
           customer_id,mode,citation_ids,as_of,valid_until)
          SELECT gen_random_uuid(),$1,$2,'customer',$3,$4,'lexical_degraded',
            '[]'::jsonb,now()-interval '32 days',now()-interval '31 days'
          FROM generate_series(1,101)`,
        [marker.rows[0].environment_id,DEMO_IDS.mcteerMembership,
          DEMO_IDS.workspace,DEMO_IDS.sharedCustomer]);
        expect(Number((await client.query<{ removed: number }>(
          "SELECT turas_expire_retrieval_receipts() AS removed")).rows[0].removed)).toBe(100);
        expect(Number((await client.query<{ removed: number }>(
          "SELECT turas_expire_retrieval_receipts() AS removed")).rows[0].removed)).toBe(1);
      } finally { await client.query("ROLLBACK"); }
    });
  });
  it("removes terminal embedding receipts in bounded 30-day batches",async () => {
    for (const [key,value] of Object.entries({
      DATABASE_URL: "postgres://localhost/turas_unused",
      DATABASE_URL_UNPOOLED: "postgres://localhost/turas_unused",
      TURAS_ENVIRONMENT_ID: process.env.TURAS_TEST_ENVIRONMENT_ID!,
      TURAS_APP_ORIGIN: "http://127.0.0.1:3000",
      TURAS_DEMO_USERNAME: "mcteer",TURAS_DEMO_PASSWORD: "synthetic",
      PANEL_USERNAME: "panel",PANEL_PASSWORD: "synthetic",
      PARTNER_USERNAME: "partner",PARTNER_PASSWORD: "synthetic",
      TURAS_MAINTENANCE_SECRET: "s".repeat(32),
    })) vi.stubEnv(key,value);
    try {
      await withTestDatabase(async (client) => {
        await client.query("BEGIN");
        try {
          const environment = process.env.TURAS_TEST_ENVIRONMENT_ID!;
          await client.query(`INSERT INTO retrieval_embedding_operations
            (id,environment_id,operation_kind,operation_key,state,
             embedding_contract,model_id,dimensions,input_characters,
             dispatched_at,completed_at,created_at)
            SELECT gen_random_uuid(),$1,'query','old-embedding-'||n,'succeeded',
              'embedding-v1','synthetic',1536,10,
              now()-interval '31 days',now()-interval '31 days',
              now()-interval '31 days' FROM generate_series(1,101) n`,[environment]);
          await client.query(`INSERT INTO retrieval_embedding_operations
            (id,environment_id,operation_kind,operation_key,state,
             embedding_contract,model_id,dimensions,input_characters,
             dispatched_at,created_at)
            VALUES(gen_random_uuid(),$1,'query','old-dispatched-embedding','dispatched',
              'embedding-v1','synthetic',1536,10,
              now()-interval '31 days',now()-interval '31 days')`,[environment]);
          // Payloads are append-only to runtime. SELECT FOR UPDATE requires an
          // UPDATE grant even when the intended maintenance operation is DELETE.
          await client.query("SET LOCAL ROLE turas_runtime");
          expect((await client.query("SELECT has_table_privilege(current_user,'research_observation_payloads','UPDATE') AS allowed")).rows[0].allowed).toBe(false);
          await runRetrievalCleanupTick(client);
          const remaining = async () => Number((await client.query<{ count: string }>(`
            SELECT count(*)::text AS count FROM retrieval_embedding_operations
            WHERE environment_id=$1 AND operation_key LIKE 'old-embedding-%'`,
          [environment])).rows[0].count);
          expect(await remaining()).toBe(1);
          await runRetrievalCleanupTick(client);
          expect(await remaining()).toBe(0);
          expect((await client.query(`SELECT 1 FROM retrieval_embedding_operations
            WHERE environment_id=$1 AND operation_key='old-dispatched-embedding'`,
          [environment])).rowCount).toBe(1);
        } finally { await client.query("ROLLBACK"); }
      });
    } finally { vi.unstubAllEnvs(); }
  });
});

// The migration's original runtime grant does not cover a replacement restricted role.
it("refreshes bounded receipt maintenance for a separately provisioned restricted runtime",async()=>{
 await withTestDatabase(async client=>{
  const role="retrieval_runtime_"+randomUUID().replaceAll("-","");
  await client.query("BEGIN");
  try{
   await client.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`);
   await client.query(`SET LOCAL ROLE ${role}`);
   await client.query("SAVEPOINT no_receipt_grant");
   await expect(client.query("SELECT turas_expire_retrieval_receipts()")).rejects.toMatchObject({code:"42501"});
   await client.query("ROLLBACK TO SAVEPOINT no_receipt_grant");
   await client.query("RESET ROLE");
   await client.query(readFileSync("scripts/db-role-setup.sql","utf8").replace(/\bturas_runtime\b/g,role));
   await client.query(`SET LOCAL ROLE ${role}`);
   const privileges=(await client.query("SELECT has_function_privilege(current_user,'turas_expire_retrieval_receipts()','EXECUTE') AS receipt_execute,has_table_privilege(current_user,'operations_control','UPDATE') AS control_update,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user")).rows[0];
   expect(privileges).toEqual({receipt_execute:true,control_update:false,rolsuper:false,rolcreatedb:false,rolcreaterole:false,rolbypassrls:false});
   const removed=(await client.query("SELECT turas_expire_retrieval_receipts() AS removed")).rows[0].removed;
   expect(Number(removed)).toBeGreaterThanOrEqual(0);expect(Number(removed)).toBeLessThanOrEqual(100);
  }finally{await client.query("ROLLBACK");}
 });
});
