import type {Client} from 'pg';
import {readDatabaseSafetyBoundary} from '../../../lib/server/operations/database-safety-boundary';
import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {legacySafetyContextSchema,observedSafetyContextSchema} from '../../../scripts/pilot-legacy-safety-rehearsal';
import {workRecoveryKeyReferenceSchema} from '../../../scripts/pilot-database-safety-copy';
const fixture=()=>({contract:'pilot-database-safety-copy-v2',id:randomUUID(),sourceProjectId:'prj_synthetic',environmentId:'synthetic-production',schemaVersion:55,capturedAt:new Date().toISOString(),ledgerDigest:'a'.repeat(64),applicationContentDigest:'b'.repeat(64),sourceDatabaseName:'neondb',serverMajor:18,dumpDigest:'c'.repeat(64),dumpBytes:1000,matchedServiceCheckpoint:false});
it('accepts only the explicitly incomplete authenticated legacy database context',()=>{expect(legacySafetyContextSchema.parse(fixture())).toMatchObject({schemaVersion:55,matchedServiceCheckpoint:false});});
it('rejects old missing content proof unsupported schemas and readiness claims',()=>{const value=fixture();for(const extra of [{contract:'pilot-database-safety-copy-v1'},{applicationContentDigest:undefined},{schemaVersion:57},{serverMajor:16},{matchedServiceCheckpoint:true},{restorationReady:true}])expect(()=>legacySafetyContextSchema.parse({...value,...extra})).toThrow();});
it('rejects unsafe database names and oversized legacy dumps',()=>{for(const extra of [{sourceDatabaseName:'db; DROP DATABASE x'},{sourceDatabaseName:'../db'},{dumpBytes:67108865},{dumpBytes:0}])expect(()=>legacySafetyContextSchema.parse({...fixture(),...extra})).toThrow();});
it('binds independent key references to generated work key names without key bytes',()=>{const reference={projectId:'prj_synthetic',variableId:'synthetic_variable',name:'TURAS_RECOVERY_KEY_'+'A'.repeat(32)};expect(workRecoveryKeyReferenceSchema.parse(reference)).toEqual(reference);for(const extra of [{name:'DATABASE_URL_UNPOOLED'},{variableId:'../env/foreign'},{value:'0'.repeat(64)},{projectId:'arbitrary'}])expect(()=>workRecoveryKeyReferenceSchema.parse({...reference,...extra})).toThrow();});

const observed=()=>{const v=fixture();return {...v,contract:'pilot-database-safety-copy-v4',sourceTarget:'production',schemaVersion:77,databaseBoundary:{contract:'pilot-database-safety-boundary-v1',capturedAt:v.capturedAt,requiredObjectsDigest:'d'.repeat(64),requiredObjectCount:0,requiredObjectBytes:0,leaseInventoryDigest:'e'.repeat(64),activeLeaseCount:0,pendingUploadCount:0,dispatchingDeliveryCount:0,externalAdmissionVerified:false,privateBytesVerified:false,fullServiceCheckpoint:false}};};
it('binds current safety context to exact snapshot observations without claiming a service checkpoint',()=>{
 const v=observed();expect(observedSafetyContextSchema.parse(v)).toMatchObject({schemaVersion:77,databaseBoundary:{requiredObjectCount:0,externalAdmissionVerified:false},matchedServiceCheckpoint:false});
 for(const extra of [{databaseBoundary:undefined},{schemaVersion:55},{capturedAt:new Date(Date.parse(v.capturedAt)-1).toISOString()},{matchedServiceCheckpoint:true}])expect(()=>observedSafetyContextSchema.parse({...v,...extra})).toThrow();
});
it('rejects supplied fencing byte integrity readiness and unbounded observation claims',()=>{
 const v=observed();for(const extra of [{externalAdmissionVerified:true},{privateBytesVerified:true},{fullServiceCheckpoint:true},{activeLeaseCount:-1},{requiredObjectCount:100001},{requiredObjectBytes:1024**4+1},{restorationReady:true}])expect(()=>observedSafetyContextSchema.parse({...v,databaseBoundary:{...v.databaseBoundary,...extra}})).toThrow();
});

it('stops snapshot boundary enumeration before another query after cancellation',async()=>{
 const controller=new AbortController(),now=new Date();let calls=0;
 const db={query:async()=>{calls++;switch(calls){
  case 1:return {rows:[{read_only:'on',isolation:'repeatable read',captured_at:now}]};
  case 2:return {rows:[{environment_id:'synthetic',schema_version:77,owner:true}]};
  case 3:return {rows:[]};
  case 4:return {rows:[{table_name:'synthetic_one',column_name:'lease_until',has_state:true},{table_name:'synthetic_two',column_name:'lease_until',has_state:true}]};
  case 5:controller.abort();return {rows:[{count:'0'}]};
  default:throw Error('Unexpected query after cancellation');
 }}} as unknown as Client;
 await expect(readDatabaseSafetyBoundary(db,'synthetic',now,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(calls).toBe(5);
 const before=calls;await expect(readDatabaseSafetyBoundary(db,'synthetic',now,controller.signal)).rejects.toMatchObject({name:'AbortError'});expect(calls).toBe(before);
});
