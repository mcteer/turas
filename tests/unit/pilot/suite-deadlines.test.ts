import {it,expect} from 'vitest';
import catalog from '../../../scripts/pilot-suites.json';
import {pilotSuiteDeadlineMs} from '../../../scripts/pilot-suite-deadlines';
it('allows the declared restore setup and cases inside a finite whole-file bound',()=>{
 // One beforeAll plus three cases each independently allow210s, then cleanup.
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/isolated-restore.test.ts')).toBeGreaterThanOrEqual(4*210000+15000);
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/isolated-restore.test.ts')).toBeLessThanOrEqual(900000);
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/released-safety-restore.test.ts')).toBeGreaterThanOrEqual(4*210000+15000);
 const phases:Record<string,number>={'legacy-safety-restore':6*210000,'owned-database-restore':720000+420000,'work-isolated-restore':420000,'preview-safety-restore':420000,'database-safety-content':2*210000,'recovery-read-probe':3*210000,'recovery':9*210000,'recovery-credential-denials':16*210000,'hosted-sdk':240000+5*60000,'load-mcp':240000+660000};
 for(const [name,total] of Object.entries(phases))expect(pilotSuiteDeadlineMs('tests/integration/pilot/'+name+'.test.ts')).toBeGreaterThanOrEqual(total+15000);
});
it('keeps every registered suite within a finite controller deadline',()=>{
 for(const suite of catalog.suites){const ms=pilotSuiteDeadlineMs(suite.file);expect(Number.isSafeInteger(ms)).toBe(true);expect(ms).toBeGreaterThan(0);expect(ms).toBeLessThan(3600000);}
});
it('rejects unregistered suite names before process execution',()=>{
 for(const file of ['tests/integration/pilot/unknown.test.ts','../isolated-restore.test.ts',''])expect(()=>pilotSuiteDeadlineMs(file)).toThrow('Registered pilot suite required');
});
