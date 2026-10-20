import {it,expect} from 'vitest';
import {requireOriginalWorkDenialCapture} from '../../../scripts/pilot-denial-snapshot';
import {requireAuthenticatedRetainedDenials} from '../../../scripts/pilot-denial-reader';
it('rejects serialized current snapshots and healthy labels without an actual retained-reader result',()=>{
 for(const value of [{},{snapshot:{contract:'pilot-denial-replay-snapshot-v7'},contextDigest:'a'.repeat(64),backupCapturedAt:new Date().toISOString()},{currentAuthorityVerified:true,independentColdBytesVerified:true}])expect(()=>requireAuthenticatedRetainedDenials(value as any,'synthetic')).toThrow('Actual independently retained');
});

it('refuses caller-authored original-source capture receipts and current authority labels',()=>{
 const original={databaseUrl:'postgresql://owner:synthetic@original.neon.tech/source?sslmode=verify-full',projectId:'prj_source',target:'production',environmentId:'synthetic',schemaVersion:79};
 const restored={...original,databaseUrl:'postgresql://owner:synthetic@restored.neon.tech/target?sslmode=verify-full'};
 expect(()=>requireOriginalWorkDenialCapture({independentRetentionVerified:true},original,restored,{contextDigest:'a'.repeat(64),backupCapturedAt:new Date().toISOString(),snapshot:{} as any})).toThrow('Actual independently retained');
});
