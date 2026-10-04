import { describe,it,expect } from 'vitest';
import { verifyReportSuiteCoverage,verifyReportTestResult } from '../../scripts/test-reports';
describe('report test gate',()=>{
  it('includes every report suite exactly once',()=>expect(verifyReportSuiteCoverage().length).toBeGreaterThan(0));
  it('rejects an omitted or duplicated suite',()=>{
    expect(()=>verifyReportSuiteCoverage([])).toThrow();
    expect(()=>verifyReportSuiteCoverage(['tests/unit/report-test-manifest.test.ts','tests/unit/report-test-manifest.test.ts'])).toThrow();
  });
  it('rejects skipped, empty and failed assertions',()=>{
    const report={success:true,numTotalTests:1,numPassedTests:1,numFailedTests:0,numPendingTests:0,testResults:[{name:'tests/unit/example.test.ts',status:'passed',assertionResults:[{status:'passed'}]}]};
    expect(()=>verifyReportTestResult(report,['tests/unit/example.test.ts'])).not.toThrow();
    expect(()=>verifyReportTestResult({...report,numPendingTests:1},['tests/unit/example.test.ts'])).toThrow();
    expect(()=>verifyReportTestResult({...report,testResults:[]},['tests/unit/example.test.ts'])).toThrow();
    expect(()=>verifyReportTestResult({...report,testResults:[{...report.testResults[0],assertionResults:[{status:'skipped'}]}]},['tests/unit/example.test.ts'])).toThrow();
  });
  it('rejects duplicate reported paths and invented assertion totals',()=>{
   const suite={name:'tests/unit/a.test.ts',status:'passed',assertionResults:[{status:'passed'}]};
   const result={success:true,numTotalTests:2,numPassedTests:2,numFailedTests:0,numPendingTests:0,testResults:[suite,suite]};
   expect(()=>verifyReportTestResult(result,['tests/unit/a.test.ts','tests/unit/b.test.ts'])).toThrow();
   expect(()=>verifyReportTestResult({...result,testResults:[suite]},['tests/unit/a.test.ts'])).toThrow();
  });
});
