import type {PoolClient} from 'pg';
import {isMcpReadActor,type CurrentReadActor} from '../auth/read-actor';
import {DEMO_IDS} from '../bootstrap-ids';
import {lockProfileActor} from '../profiles/policy';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import type {ReportAudience} from '../../reports/periods';
import {requireReportEnvironment} from './readiness';
export type ReportCapability='read'|'prepare'|'revise'|'publish'|'brand'|'policy'|'send'|'reconcile'|'addresses';
export function isReportReviewer(actor:CurrentReadActor){return !isMcpReadActor(actor) && actor.kind==='internal' && actor.role==='admin' && actor.principalId===DEMO_IDS.mcteer;}
export function requireReportCapability(actor:CurrentReadActor,capability:ReportCapability,audience:ReportAudience,published=false){
 if(isMcpReadActor(actor) && capability!=='read')throw new HttpFailure(403,'forbidden','Action not allowed');
 if(actor.kind==='partner' && (capability!=='read' || audience!=='delivery' || !published))throw hiddenRecord();
 if(['publish','brand','policy','send','reconcile','addresses'].includes(capability) && !isReportReviewer(actor))throw new HttpFailure(403,'forbidden','Action not allowed');
}
export function reportSourceAudience(audience:ReportAudience):Array<'internal'|'delivery'>{return audience==='delivery'?['delivery']:['delivery','internal'];}
export async function lockReportActor(db:PoolClient,actor:CurrentReadActor,customerId:string,capability:ReportCapability,audience:ReportAudience,published=false,write=false){
 if(isMcpReadActor(actor) && write)throw new HttpFailure(403,'forbidden','Action not allowed');
 await lockProfileActor(db,actor,customerId,undefined,true);requireReportCapability(actor,capability,audience,published);await requireReportEnvironment(db,write);
}
