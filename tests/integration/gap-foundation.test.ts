import { beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { gapActors } from '../fixtures/gaps/seed';
import { withGapDatabase } from '../fixtures/gaps/environment';
import { withTransaction } from '../../lib/server/db/client';
import { lockGapActor, requireGapReviewer } from '../../lib/server/gaps/policy';
import { requireGapSchema } from '../../lib/server/gaps/schema';
import { gapHash, gapOpaqueHashes, gapCommand, readGapReceipt } from '../../lib/server/gaps/commands';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';
import type { CurrentSession } from '../../lib/server/auth/sessions';

describe('Gap authority, receipts and runtime integrity',()=>{
 let actors:Awaited<ReturnType<typeof gapActors>>;
 beforeAll(async()=>{actors=await gapActors();});
 it('allows internal proposal readers but only canonical mcteer can decide',async()=>{
  for(const actor of [actors.panel,actors.mcteer])await withTransaction(db=>lockGapActor(db,actor));
  expect(()=>requireGapReviewer(actors.panel)).toThrow();expect(()=>requireGapReviewer({...actors.mcteer,principalId:randomUUID()})).toThrow();
  expect(()=>requireGapReviewer(actors.mcteer)).not.toThrow();
  await expect(withTransaction(db=>lockGapActor(db,actors.partner))).rejects.toMatchObject({status:404});
 });
 it('locks current session and membership before discovery, rejecting forged scope',async()=>{
  await expect(withTransaction(db=>lockGapActor(db,{...actors.panel,workspaceId:randomUUID()}))).rejects.toMatchObject({status:401});
  const revoked=await gapActors();await withGapDatabase(db=>db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[revoked.panel.sessionId]));
  await expect(withTransaction(db=>lockGapActor(db,revoked.panel))).rejects.toMatchObject({status:401});
 });
 it('requires the marked schema and blocks new work while disabled',async()=>{
  const prior=process.env.TURAS_012_DISABLED;process.env.TURAS_012_DISABLED='1';
  try{await expect(withTransaction(db=>requireGapSchema(db,true))).rejects.toMatchObject({code:'feature_disabled'});await withTransaction(db=>requireGapSchema(db));}finally{if(prior===undefined)delete process.env.TURAS_012_DISABLED;else process.env.TURAS_012_DISABLED=prior;}
 });
 it('serializes duplicate requests, rejects changed input and reconciles minimal identity',async()=>{
  const requestKey=randomUUID(),input={requestKey,expectedVersion:0,contractVersion:'product-gaps-v1'},objectId=randomUUID();
  const run=(actor:CurrentSession,value=1)=>gapCommand(actor,'foundation',input,async db=>{await db.query("INSERT INTO gap_test_probe(id,value) VALUES($1,$2)",[objectId,value]);return {recordId:null,outcome:'proposed',version:1};});
  await withGapDatabase(db=>db.query('CREATE TABLE gap_test_probe(id uuid PRIMARY KEY,value integer); GRANT SELECT,INSERT ON gap_test_probe TO turas_runtime'));
  const [a,b]=await Promise.all([run(actors.panel),run(actors.panel)]);expect(a.id).toBe(b.id);
  expect(await readGapReceipt(actors.panel,requestKey,'foundation')).toEqual(a);
  await expect(gapCommand(actors.panel,'foundation',{...input,expectedVersion:1},async()=>({recordId:null,outcome:'proposed',version:2}))).rejects.toMatchObject({code:'request_conflict'});
  expect((await withGapDatabase(db=>db.query('SELECT count(*) FROM gap_test_probe'))).rows[0].count).toBe('1');
 });
 it('fences expired request identity using the keyring',async()=>{
  const key=randomUUID(),hash=gapOpaqueHashes([process.env.TURAS_ENVIRONMENT_ID!,actors.panel.workspaceId,actors.panel.membershipId,'foundation',key])[0];
  await withGapDatabase(db=>db.query('INSERT INTO gap_expired_request_keys(key_hash) VALUES($1)',[hash]));
  await expect(gapCommand(actors.panel,'foundation',{requestKey:key},async()=>({recordId:null,outcome:'proposed',version:1}))).rejects.toMatchObject({code:'receipt_expired'});
  expect(gapHash({b:2,a:1})).toBe(gapHash({a:1,b:2}));
 });
 it('reconciles a successful receipt only under current actor authority',async()=>{const fresh=await gapActors(),key=randomUUID();const receipt=await gapCommand(fresh.panel,'authority_receipt',{requestKey:key},async()=>({recordId:null,outcome:'proposed',version:1}));expect((await readGapReceipt(fresh.panel,key,'authority_receipt')).id).toBe(receipt.id);await withGapDatabase(db=>db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[fresh.panel.sessionId]));await expect(readGapReceipt(fresh.panel,key,'authority_receipt')).rejects.toMatchObject({status:401});expect((await withGapDatabase(db=>db.query('SELECT count(*) FROM gap_request_receipts WHERE id=$1',[receipt.id]))).rows[0].count).toBe('1');});
 it('expires a 365-day receipt atomically into retained-key tombstones',async()=>{const key=randomUUID(),operation='aged_receipt',receipt=await gapCommand(actors.panel,operation,{requestKey:key},async()=>({recordId:null,outcome:'proposed',version:1}));const hashes=gapOpaqueHashes([process.env.TURAS_ENVIRONMENT_ID!,actors.panel.workspaceId,actors.panel.membershipId,operation,key]);await withGapDatabase(async db=>{expect((await db.query('SELECT turas_gap_expire_receipt($1,$2,$3) AS expired',[process.env.TURAS_ENVIRONMENT_ID,receipt.id,hashes])).rows[0].expired).toBe(false);await db.query('BEGIN');try{await db.query("SELECT set_config('turas.gap_cleanup','yes',true)");await db.query("UPDATE gap_request_receipts SET created_at=clock_timestamp()-interval '366 days' WHERE id=$1",[receipt.id]);await db.query('COMMIT');}catch(error){await db.query('ROLLBACK');throw error;}expect((await db.query('SELECT turas_gap_expire_receipt($1,$2,$3) AS expired',[process.env.TURAS_ENVIRONMENT_ID,receipt.id,hashes])).rows[0].expired).toBe(true);expect((await db.query('SELECT count(*) FROM gap_request_receipts WHERE id=$1',[receipt.id])).rows[0].count).toBe('0');});await expect(gapCommand(actors.panel,operation,{requestKey:key},async()=>({recordId:null,outcome:'proposed',version:1}))).rejects.toMatchObject({code:'receipt_expired'});const prior=process.env.TURAS_012_RECEIPT_HASH_KEYS;process.env.TURAS_012_RECEIPT_HASH_KEYS=JSON.stringify(['synthetic-new-key-with-at-least-32-bytes',...(prior?JSON.parse(prior):[process.env.TURAS_MAINTENANCE_SECRET])]);try{await expect(readGapReceipt(actors.panel,key,operation)).rejects.toMatchObject({code:'receipt_expired'});}finally{if(prior===undefined)delete process.env.TURAS_012_RECEIPT_HASH_KEYS;else process.env.TURAS_012_RECEIPT_HASH_KEYS=prior;}});
 it('runtime cannot rewrite immutable history or delete payloads',async()=>{
  await withGapDatabase(async db=>{await db.query('BEGIN');try{await db.query('SET LOCAL ROLE turas_runtime');await expect(db.query('UPDATE gap_revision_payloads SET content=\'{}\'::jsonb')).rejects.toMatchObject({code:'42501'});}finally{await db.query('ROLLBACK');}
   await db.query('BEGIN');try{await db.query('SET LOCAL ROLE turas_runtime');await expect(db.query('DELETE FROM gap_request_receipts')).rejects.toMatchObject({code:'42501'});}finally{await db.query('ROLLBACK');}});
 });
 it('refuses schema 047 before exposing gap state',async()=>{await withGapDatabase(async db=>{const prior=(await db.query('SELECT schema_version FROM turas_environment LIMIT 1')).rows[0].schema_version;await db.query('UPDATE turas_environment SET schema_version=47');try{await expect(withTransaction(client=>requireGapSchema(client))).rejects.toMatchObject({code:'schema_unavailable'});}finally{await db.query('UPDATE turas_environment SET schema_version=$1',[prior]);}});});
 it('charges rejected business attempts and enforces the rolling write limit',async()=>{for(let i=0;i<30;i++)await expect(gapCommand(actors.panel,'quota_probe',{requestKey:randomUUID()},async()=>{throw Error('Synthetic business rejection');})).rejects.toThrow('Synthetic business rejection');await expect(gapCommand(actors.panel,'quota_probe',{requestKey:randomUUID()},async()=>({recordId:null,outcome:'proposed',version:1}))).rejects.toMatchObject({status:429});});

 it('does not grant review authority to another real active administrator',async()=>{await withGapDatabase(async db=>{await db.query("UPDATE memberships SET role='admin' WHERE id=$1",[actors.panel.membershipId]);try{const otherAdmin={...actors.panel,role:'admin' as const};await withTransaction(client=>lockGapActor(client,otherAdmin));await expect(gapCommand(otherAdmin,'gap_decision',{requestKey:randomUUID()},async()=>({recordId:null,outcome:'accept',version:1}))).rejects.toMatchObject({status:404});}finally{await db.query("UPDATE memberships SET role='member' WHERE id=$1",[actors.panel.membershipId]);}});});

 it('does not elevate customer stewardship or expansion ownership into gap review',async()=>{await withGapDatabase(async db=>{await db.query('BEGIN');try{await db.query('INSERT INTO customer_stewards(customer_id,workspace_id,membership_id,active,assigned_by) VALUES($1,$2,$3,true,$4) ON CONFLICT(customer_id,membership_id) DO UPDATE SET active=true',[DEMO_IDS.sharedCustomer,actors.panel.workspaceId,actors.panel.membershipId,actors.mcteer.principalId]);await db.query('INSERT INTO expansion_account_owners(customer_id,environment_id,workspace_id,owner_membership_id,version,generation) VALUES($1,$2,$3,$4,1,1) ON CONFLICT(customer_id) DO UPDATE SET owner_membership_id=EXCLUDED.owner_membership_id',[DEMO_IDS.sharedCustomer,process.env.TURAS_ENVIRONMENT_ID,actors.panel.workspaceId,actors.panel.membershipId]);expect(()=>requireGapReviewer(actors.panel)).toThrow();}finally{await db.query('ROLLBACK');}});});

});
