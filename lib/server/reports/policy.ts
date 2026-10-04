import type {PoolClient} from 'pg';
import type {CurrentSession} from '../auth/sessions';
import {DEMO_IDS} from '../bootstrap-ids';
import {lockProfileActor} from '../profiles/policy';
import {HttpFailure,hiddenRecord} from '../../contracts/http';
import type {ReportAudience} from '../../reports/periods';
import {requireReportEnvironment} from './readiness';
export type ReportCapability='read'|'prepare'|'revise'|'publish'|'brand'|'policy'|'send'|'reconcile'|'addresses';
export function isReportReviewer(actor:CurrentSession){return actor.kind==='internal' && actor.role==='admin' && actor.principalId===DEMO_IDS.mcteer;}
export function requireReportCapability(actor:CurrentSession,capability:ReportCapability,audience:ReportAudience,published=false){
 if(actor.kind==='partner' && (capability!=='read' || audience!=='delivery' || !published))throw hiddenRecord();
 if(['publish','brand','policy','send','reconcile','addresses'].includes(capability) && !isReportReviewer(actor))throw new HttpFailure(403,'forbidden','Action not allowed');
}
export function reportSourceAudience(audience:ReportAudience):Array<'internal'|'delivery'>{return audience==='delivery'?['delivery']:['delivery','internal'];}
export async function lockReportActor(db:PoolClient,actor:CurrentSession,customerId:string,capability:ReportCapability,audience:ReportAudience,published=false,write=false){
 await lockProfileActor(db,actor,customerId,undefined,true);requireReportCapability(actor,capability,audience,published);await requireReportEnvironment(db,write);
}
