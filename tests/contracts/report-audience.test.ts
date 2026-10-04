import {it,expect} from 'vitest';
import {publishedReportFixture} from '../fixtures/reports/published';
import {createProfileTestSession} from '../fixtures/profiles';
import {reportTransaction} from '../../lib/server/reports/commands';
import {readReport,listCustomerReports} from '../../lib/server/reports/read';
import {readReportHistory,readReportSourceLabels} from '../../lib/server/reports/history';
import {listReportPolicies,listReportDeliveries} from '../../lib/server/reports/management';
import {downloadReportArtifact} from '../../lib/server/reports/artifacts';
import {DEMO_IDS} from '../../lib/server/bootstrap-ids';

it('enforces current role/grant/session boundaries across report content, history, sources, private management and files',async()=>{
 const fixture=await publishedReportFixture(),partner=await reportTransaction(db=>createProfileTestSession(db,'partner'));
 const publishedId=fixture.published.reportId as string,draftId=fixture.reports[1].reportId as string;
 const read=await readReport(partner,publishedId);expect(read.document).not.toBeNull();expect(read.canReview).toBe(false);
 const list=await listCustomerReports(partner,fixture.customerId,{});expect(list.reports).toHaveLength(1);expect(list.reports[0].reportId).toBe(publishedId);
 const history=await readReportHistory(partner,publishedId,{}),sources=await readReportSourceLabels(partner,publishedId);
 for(const value of [read,list,history,sources]){
  const bytes=JSON.stringify(value);for(const forbidden of ['recipient_identity','recipientDigest','providerMessageId','request_bytes','object_key',fixture.reviewer.membershipId])expect(bytes).not.toContain(forbidden);
 }
 await expect(readReport(partner,draftId)).rejects.toMatchObject({status:404});
 await expect(readReportHistory(partner,draftId,{})).rejects.toMatchObject({status:404});
 await expect(readReportSourceLabels(partner,draftId)).rejects.toMatchObject({status:404});
 await expect(listReportPolicies(partner,fixture.customerId,{})).rejects.toMatchObject({status:404});
 await expect(listReportDeliveries(partner,publishedId,{})).rejects.toMatchObject({status:404});
 expect(await listReportPolicies(fixture.author,fixture.customerId,{})).toMatchObject({canManage:false,policies:[]});
  expect(await listReportDeliveries(fixture.author,publishedId,{})).toMatchObject({canManage:false,deliveries:[]});
  await expect(listCustomerReports(partner,DEMO_IDS.deniedCustomer,{})).rejects.toMatchObject({status:404});
  await expect(listReportPolicies(partner,DEMO_IDS.deniedCustomer,{})).rejects.toMatchObject({status:404});
 const file=await reportTransaction(async db=>(await db.query('SELECT id FROM report_artifacts WHERE revision_id=$1 LIMIT 1',[fixture.reports[1].revisionId])).rows[0]);
  await expect(downloadReportArtifact(partner,draftId,file.id)).rejects.toMatchObject({status:404});
  // A revoked interactive session must not release content even while its member
  // and customer grants remain active. Exercise each independent read adapter.
  await reportTransaction(db=>db.query('UPDATE login_sessions SET revoked_at=now() WHERE id=$1',[fixture.author.sessionId]));
  for(const operation of [()=>readReport(fixture.author,publishedId),()=>listCustomerReports(fixture.author,fixture.customerId,{}),()=>readReportHistory(fixture.author,publishedId,{}),()=>readReportSourceLabels(fixture.author,publishedId),()=>listReportPolicies(fixture.author,fixture.customerId,{}),()=>listReportDeliveries(fixture.author,publishedId,{})])await expect(operation()).rejects.toMatchObject({status:401});
  await expect(downloadReportArtifact(fixture.author,draftId,file.id)).rejects.toMatchObject({status:401});
 await reportTransaction(db=>db.query("UPDATE customer_grants SET state='revoked' WHERE id=$1",[DEMO_IDS.partnerSharedGrant]));
 for(const operation of [()=>readReport(partner,publishedId),()=>listCustomerReports(partner,fixture.customerId,{}),()=>readReportHistory(partner,publishedId,{}),()=>readReportSourceLabels(partner,publishedId)])await expect(operation()).rejects.toMatchObject({status:404});
 await reportTransaction(db=>db.query('UPDATE memberships SET active=false WHERE id=$1',[fixture.reviewer.membershipId]));
 await expect(readReport(fixture.reviewer,publishedId)).rejects.toMatchObject({status:401});
 await expect(downloadReportArtifact(fixture.reviewer,draftId,file.id)).rejects.toMatchObject({status:401});
},300000);
