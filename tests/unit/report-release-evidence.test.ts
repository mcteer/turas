import {it,expect} from 'vitest';
import {validateReportReleaseEvidence} from '../../scripts/check-reports-release';
import {verifyReportSuiteCoverage} from '../../scripts/test-reports';
const digest='a'.repeat(64);
it('keeps missing local/recovery/live gates blocked rather than accepting an intermediate green summary',()=>{
 const result=validateReportReleaseEvidence([{gate:'reports-deterministic',sourceDigest:digest,status:'passed',suites:verifyReportSuiteCoverage().length,passed:1,failed:0,skipped:0}],digest);
 expect(result.pending).toContain('reports-controlled-delivery');expect(result.pending).toContain('reports-recovery');
});
it('rejects stale, duplicate, partial, mock and acceptance-only evidence',()=>{
 const base={gate:'reports-deterministic',sourceDigest:digest,status:'passed'};
 expect(()=>validateReportReleaseEvidence([base,base],digest)).toThrow();
 expect(()=>validateReportReleaseEvidence([base],'b'.repeat(64))).toThrow();
 expect(()=>validateReportReleaseEvidence([{...base,pending:['local work']}],digest)).toThrow();
 for(const extra of [{transport:'fixture',evidence:'delivered'},{transport:'live',evidence:'accepted'}])expect(()=>validateReportReleaseEvidence([{...base,gate:'reports-controlled-delivery',provider:'resend',hostedProof:false,...extra}],digest)).toThrow();
 expect(()=>validateReportReleaseEvidence([{...base,gate:'reports-artifacts',pairs:5,rasters:121}],digest)).toThrow();
 expect(()=>validateReportReleaseEvidence([{...base,gate:'reports-load',scopeOverflowDenied:true,pending:[]}],digest)).toThrow();
 expect(()=>validateReportReleaseEvidence([{...base,gate:'reports-recovery',matchedSnapshot:true,suites:[],pending:[],hostedProof:false}],digest)).toThrow();
});
