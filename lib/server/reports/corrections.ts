import type {ReportDocument} from '../../reports/document';
import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {reportReadProjection} from './read';
import {reportDigest} from './commands';
import {HttpFailure} from '../../contracts/http';

/** Compare only documents already released through current authority/source fences. */
export function compareReportDocuments(previous:ReportDocument,current:ReportDocument){
 const priorSections=new Map(previous.sections.map(section=>[section.heading,reportDigest(section.blocks)]));
 const changedSections=current.sections.filter(section=>priorSections.get(section.heading)!==reportDigest(section.blocks)).map(section=>section.heading);
 const priorMetrics=new Map(previous.metrics.map(metric=>[metric.label,reportDigest(metric)]));
 const changedMeasures=current.metrics.filter(metric=>priorMetrics.get(metric.label)!==reportDigest(metric)).map(metric=>metric.label);
 return {changedSections,changedMeasures,annotationsChanged:reportDigest(previous.annotations)!==reportDigest(current.annotations)};
}
export async function reportCorrectionComparison(db:PoolClient,actor:CurrentSession,reportId:string,revisionId:string,
 project:(revisionId:string)=>ReturnType<typeof reportReadProjection>=id=>reportReadProjection(db,actor,reportId,id)){
 const current=await project(revisionId);
 const predecessor=(await db.query('SELECT predecessor_id FROM report_revisions WHERE id=$1 AND report_id=$2 AND environment_id=$3 AND workspace_id=$4',[revisionId,reportId,process.env.TURAS_ENVIRONMENT_ID,actor.workspaceId])).rows[0]?.predecessor_id;
 if(!predecessor)return null;
 let previous;
 try{previous=await project(predecessor);}
 catch(error){if(!(error instanceof HttpFailure)||error.status!==404)throw error;return {available:false as const,reason:'Previous content is unavailable to the current audience'};}
 if(!current.document||!previous.document)return {available:false as const,reason:'Previous or current content is withheld by current eligibility'};
 return {available:true as const,...compareReportDocuments(previous.document,current.document)};
}
