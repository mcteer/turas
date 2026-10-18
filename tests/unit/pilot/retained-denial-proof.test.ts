import {it,expect} from 'vitest';
import {requireAuthenticatedRetainedDenials} from '../../../scripts/pilot-denial-reader';
it('rejects serialized current snapshots and healthy labels without an actual retained-reader result',()=>{
 for(const value of [{},{snapshot:{contract:'pilot-denial-replay-snapshot-v7'},contextDigest:'a'.repeat(64),backupCapturedAt:new Date().toISOString()},{currentAuthorityVerified:true,independentColdBytesVerified:true}])expect(()=>requireAuthenticatedRetainedDenials(value as any,'synthetic')).toThrow('Actual independently retained');
});
