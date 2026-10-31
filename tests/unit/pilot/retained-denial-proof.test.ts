import {CURRENT_SCHEMA_VERSION} from '../../../lib/contracts/current-schema';
import {it,expect} from 'vitest';
import {requireOriginalWorkDenialCapture,requireOriginalWorkDenialSource} from '../../../scripts/pilot-denial-snapshot';
import {requireAuthenticatedRetainedDenials} from '../../../scripts/pilot-denial-reader';
it('rejects serialized current snapshots and healthy labels without an actual retained-reader result',()=>{
 for(const value of [{},{snapshot:{contract:'pilot-denial-replay-snapshot-v7'},contextDigest:'a'.repeat(64),backupCapturedAt:new Date().toISOString()},{currentAuthorityVerified:true,independentColdBytesVerified:true}])expect(()=>requireAuthenticatedRetainedDenials(value as any,'synthetic')).toThrow('Actual independently retained');
});

it('refuses caller-authored original-source capture receipts and current authority labels',()=>{
 const original={databaseUrl:'postgresql://owner:synthetic@original.neon.tech/source?sslmode=verify-full',projectId:'prj_source',target:'production',environmentId:'synthetic',schemaVersion:80};
 const current={...original,schemaVersion:CURRENT_SCHEMA_VERSION};
 expect(()=>requireOriginalWorkDenialSource(original,{...original,databaseUrl:'postgresql://owner:synthetic@restored.neon.tech/target?sslmode=verify-full'})).toThrow('schema');
 const restored={...current,databaseUrl:'postgresql://owner:synthetic@restored.neon.tech/target?sslmode=verify-full'};
 expect(()=>requireOriginalWorkDenialSource(current,{...current,databaseUrl:'postgresql://owner:synthetic@original-pooler.neon.tech/source?sslmode=verify-full'})).toThrow('must differ');
 expect(()=>requireOriginalWorkDenialCapture({independentRetentionVerified:true},current,restored,{contextDigest:'a'.repeat(64),backupCapturedAt:new Date().toISOString(),snapshot:{} as any})).toThrow('Actual independently retained');
});
