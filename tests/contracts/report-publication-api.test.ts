import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {withTransaction} from '../../lib/server/db/client';
import {createReportsBaseline} from '../fixtures/reports/baseline';
import {reportHttpActor,reportHttpRequest,reportHttpContext} from '../fixtures/reports/http';
import {POST as prepare} from '../../app/api/reports/customers/[customerId]/commands/route';
import {GET as list} from '../../app/api/reports/customers/[customerId]/route';
import {GET as detail} from '../../app/api/reports/[reportId]/route';
import {POST as preview} from '../../app/api/reports/[reportId]/preview/route';
import {GET as receipt} from '../../app/api/reports/receipts/[requestKey]/route';
describe('real reporting HTTP authority',()=>{
 it('protects drafts, previews and receipts while recovering an exact prepare acknowledgement',async()=>{
  const f=await withTransaction(db=>createReportsBaseline(db)),panel=await reportHttpActor('panel'),reviewer=await reportHttpActor('mcteer'),partner=await reportHttpActor('partner');
  const prior=process.env.TURAS_REPORTS_ENABLED;process.env.TURAS_REPORTS_ENABLED='true';
  try{
   const requestKey=randomUUID(),body={action:'prepare',requestKey,expectedVersion:0,selection:{kind:'weekly',audience:'delivery',timezone:'UTC',engagementIds:[f.engagementId],workloadIds:[],includeCustomerLevel:true},fromDate:'2026-09-21',toDate:'2026-09-27',partial:false},customer={params:Promise.resolve({customerId:f.customerId})};
   const saved=await prepare(reportHttpRequest(panel,`/customers/${f.customerId}/commands`,body),customer);expect(saved.status).toBe(200);
   const record=(await saved.json()).data,context=reportHttpContext(record.reportId);
   const repeated=await prepare(reportHttpRequest(panel,`/customers/${f.customerId}/commands`,body),customer);expect((await repeated.json()).data.revisionId).toBe(record.revisionId);
   expect((await detail(reportHttpRequest(panel,`/${record.reportId}`),context)).status).toBe(200);
   const hidden=await detail(reportHttpRequest(partner,`/${record.reportId}`),context);expect(hidden.status).toBe(404);expect(await hidden.text()).not.toContain('sections');
   const partnerList=await list(reportHttpRequest(partner,`/customers/${f.customerId}`),customer);expect(partnerList.status).toBe(200);expect((await partnerList.json()).data.reports).toEqual([]);
   expect((await preview(reportHttpRequest(panel,`/${record.reportId}/preview`,{action:'publish',expectedVersion:record.version}),context)).status).toBe(403);
   expect((await receipt(reportHttpRequest(partner,`/receipts/${requestKey}`),{params:Promise.resolve({requestKey})})).status).toBe(404);
   expect((await receipt(reportHttpRequest(panel,`/receipts/${requestKey}`),{params:Promise.resolve({requestKey})})).status).toBe(200);
   const noCsrf=reportHttpRequest(panel,`/customers/${f.customerId}/commands`,{...body,requestKey:randomUUID()});noCsrf.headers.delete('x-csrf-token');expect((await prepare(noCsrf,customer)).status).toBe(403);
   expect((await list(reportHttpRequest(panel,`/customers/${f.customerId}?limit=1&limit=2`),customer)).status).toBe(400);
   await withTransaction(db=>db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[panel.sessionId]));
   expect((await receipt(reportHttpRequest(panel,`/receipts/${requestKey}`),{params:Promise.resolve({requestKey})})).status).toBe(401);
  }finally{if(prior===undefined)delete process.env.TURAS_REPORTS_ENABLED;else process.env.TURAS_REPORTS_ENABLED=prior;}
 },180000);
});
