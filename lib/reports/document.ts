import {z} from 'zod';
import {HttpFailure} from '../contracts/http';
import {canonicalReportJson} from './canonical';
export const WEEKLY_SECTIONS=['Executive Summary','Completed and Accepted','Next Week','Milestones and Scope','Risks, Issues and Decisions','Effort and Capacity','Customer Actions and Outcomes','Source and Review Footer'] as const;
export const EXECUTIVE_SECTIONS=['Executive Decision Brief','Maturity Journey','Value and Adoption','Delivery Portfolio','Risk and Readiness','Next Period Plan','Appendix'] as const;
const text=z.string().min(1).max(16000);
const block=z.strictObject({type:z.enum(['fact','measurement','gap','proposal','note']),text,citations:z.array(z.string().regex(/^S[1-9]\d*$/)).max(2000)});
export const reportDocumentSchema=z.strictObject({schemaVersion:z.literal('reports-v1'),projectionVersion:z.literal('report-projection-v1'),formulaVersion:z.literal('report-metrics-v1'),
 templateVersion:z.enum(['weekly-status-v1','executive-review-v1']),kind:z.enum(['weekly','monthly','quarterly']),title:z.string().min(1).max(200),
 audience:z.enum(['delivery','account_team','leadership']),classification:z.string().min(1).max(200),timezone:z.string(),period:z.strictObject({fromDate:z.string(),toDate:z.string()}),asOf:z.string(),partial:z.boolean(),
 ownerLabel:z.string().min(1).max(200),sponsorLabel:z.string().min(1).max(200),sections:z.array(z.strictObject({heading:z.string().min(1).max(200),blocks:z.array(block).max(1000)})).min(7).max(8),
 metrics:z.array(z.strictObject({label:z.string().min(1).max(200),value:z.string().max(200).nullable(),unit:z.string().max(100),reason:z.string().max(500).nullable(),citations:z.array(z.string().regex(/^S[1-9]\d*$/)).max(2000)})).max(500),
 citations:z.array(z.strictObject({label:z.string().regex(/^S[1-9]\d*$/),description:z.string().min(1).max(500)})).max(2000),
 gaps:z.array(z.string().min(1).max(2000)).max(1000),annotations:z.array(z.string().trim().min(1).max(2000)).max(20),correctionOf:z.string().nullable()});
export type ReportDocument=z.infer<typeof reportDocumentSchema>;
export function validateReportDocument(raw:unknown):ReportDocument{
 const parsed=reportDocumentSchema.safeParse(raw);if(!parsed.success)throw new HttpFailure(422,'invalid_input','Invalid structured report');
 const document=parsed.data,required=document.kind==='weekly'?WEEKLY_SECTIONS:EXECUTIVE_SECTIONS;
 if(document.sections.length!==required.length || required.some((heading,index)=>document.sections[index].heading!==heading))throw new HttpFailure(422,'invalid_input','Required report sections missing');
 const labels=new Set(document.citations.map(citation=>citation.label));
 if(labels.size!==document.citations.length || [...document.sections.flatMap(section=>section.blocks.flatMap(block=>block.citations)),...document.metrics.flatMap(metric=>metric.citations)].some(label=>!labels.has(label)))throw new HttpFailure(422,'invalid_input','Report citation mismatch');
 if(document.sections.some(section=>section.blocks.some(block=>block.type==='fact' || block.type==='measurement'?block.citations.length===0:false)))throw new HttpFailure(422,'incomplete_sources','Factual blocks require accepted sources');
 if(new TextEncoder().encode(canonicalReportJson(document)).length>1048576)throw new HttpFailure(422,'scope_too_large','Narrow the report content');
 return document;
}
