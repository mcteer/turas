import {it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {publishedReportFixture} from '../fixtures/reports/published';
import {reportTransaction} from '../../lib/server/reports/commands';
import {previewReportPublication,submitReportPublicationDecision} from '../../lib/server/reports/service';
import {deleteExactReportObject} from '../../lib/server/reports/store';
import {requireOwnedReportsDatabase} from '../fixtures/reports/environment';
it('blocks both new preview and previously reviewed publication when exact approved artifact bytes are missing',async()=>{
 const fixture=await publishedReportFixture();await requireOwnedReportsDatabase();
 const report=fixture.reports[1],preview=await previewReportPublication(fixture.reviewer,report.reportId,{action:'publish',expectedVersion:report.version});
 const file=await reportTransaction(async db=>(await db.query('SELECT object_key,content_digest,size_bytes FROM report_artifacts WHERE revision_id=$1 LIMIT 1',[report.revisionId])).rows[0]);
 await deleteExactReportObject(file.object_key,file.content_digest,Number(file.size_bytes));
 await expect(previewReportPublication(fixture.reviewer,report.reportId,{action:'publish',expectedVersion:report.version})).rejects.toMatchObject({code:'artifact_unavailable'});
 const requestKey=randomUUID();
 await expect(submitReportPublicationDecision(fixture.reviewer,report.reportId,{action:'publish',expectedVersion:report.version,requestKey,previewId:preview.previewId,previewDigest:preview.previewDigest,rationale:'Exact previously reviewed synthetic publication'})).rejects.toMatchObject({code:'artifact_unavailable'});
 await reportTransaction(async db=>{
  expect((await db.query('SELECT 1 FROM report_publications WHERE report_id=$1',[report.reportId])).rowCount).toBe(0);
  expect((await db.query('SELECT 1 FROM report_command_receipts WHERE request_key=$1',[requestKey])).rowCount).toBe(0);
 });
},300000);
