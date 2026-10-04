import {it,expect} from 'vitest';
import {REPORT_REGRESSION_SUITES,validateReportRegressionManifest} from '../../scripts/test-reports-regressions';
it('requires the explicit prior-feature unit manifest without omissions or duplicates',()=>{
 expect(validateReportRegressionManifest()).toHaveLength(15);
 expect(()=>validateReportRegressionManifest(REPORT_REGRESSION_SUITES.slice(1))).toThrow();
 expect(()=>validateReportRegressionManifest([...REPORT_REGRESSION_SUITES,REPORT_REGRESSION_SUITES[0]])).toThrow();
});
