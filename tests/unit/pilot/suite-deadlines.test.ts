import {it,expect} from 'vitest';
import catalog from '../../../scripts/pilot-suites.json';
import {pilotCatalogDeadlineMs,pilotSuiteDeadlineMs} from '../../../scripts/pilot-suite-deadlines';
it('allows the declared restore setup and cases inside a finite whole-file bound',()=>{
 // Isolated restore has setup plus three cases; released restore now has four.
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/isolated-restore.test.ts')).toBeGreaterThanOrEqual(4*210000+15000);
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/isolated-restore.test.ts')).toBeLessThanOrEqual(900000);
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/released-safety-restore.test.ts')).toBeGreaterThanOrEqual(5*210000+15000);
 expect(pilotSuiteDeadlineMs('tests/integration/pilot/health-samples.test.ts')).toBe(120000+6*15000+30000);
 const phases:Record<string,number>={'legacy-safety-restore':6*210000,'owned-database-restore':720000+420000,'work-isolated-restore':5*420000,'preview-safety-restore':420000,'database-safety-content':2*210000,'recovery-read-probe':3*210000,'recovery':9*210000,'recovery-credential-denials':16*210000,'hosted-sdk':240000+5*60000,'load-mcp':240000+660000};
 for(const [name,total] of Object.entries(phases))expect(pilotSuiteDeadlineMs('tests/integration/pilot/'+name+'.test.ts')).toBeGreaterThanOrEqual(total+15000);
});
it('keeps every registered suite within a finite controller deadline',()=>{
 expect(pilotCatalogDeadlineMs(false)).toBe(5_400_000);
 expect(pilotCatalogDeadlineMs(true)).toBe(9_000_000);
 for(const suite of catalog.suites){
  const ms=pilotSuiteDeadlineMs(suite.file);expect(Number.isSafeInteger(ms)).toBe(true);expect(ms).toBeGreaterThan(0);
  // The decision suite declares twenty-one210s cases, one420s producer and one270s peer phase,
  // plus60s process startup/cleanup. All other suites retain their60m ceiling.
  if(suite.file==='tests/integration/pilot/work-recovery-decision.test.ts'){
   expect(ms).toBeGreaterThanOrEqual(21*210000+420000+270000+15000);
   expect(ms).toBeLessThanOrEqual(21*210000+420000+270000+60000);
  }else expect(ms).toBeLessThan(3600000);
 }
});
it('rejects unregistered suite names before process execution',()=>{
 for(const file of ['tests/integration/pilot/unknown.test.ts','../isolated-restore.test.ts',''])expect(()=>pilotSuiteDeadlineMs(file)).toThrow('Registered pilot suite required');
});
