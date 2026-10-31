import {z} from 'zod';
import type {HostedJourneyRequest} from './pilot-hosted-baseline';

const matchItem=z.object({resourceId:z.uuid(),status:z.string(),constraints:z.array(z.object({
 kind:z.string(),outcome:z.string(),reason:z.string(),skillId:z.uuid().optional(),
}))});
const matchPage=z.object({resultId:z.uuid(),demandId:z.uuid(),demandRevisionId:z.uuid(),
 inputDigest:z.string().regex(/^[a-f0-9]{64}$/),expiresAt:z.iso.datetime({offset:true}),
 items:z.array(matchItem).max(50),nextCursor:z.string().min(1).max(2048).nullable()});
export type HostedMatchingIdentity={resultId:string;demandId:string;demandRevisionId:string;inputDigest:string;expiresAt:string};

/** Read the complete bounded result through the same authenticated transport.
 * The server rechecks its original actor and snapshot on every cursor read;
 * this helper never creates or refreshes a result or changes the caller. */
export async function readHostedStaffingMatchPages(input:{request:HostedJourneyRequest;signal:AbortSignal;expected:HostedMatchingIdentity}){
 const {expected,request,signal}=input,items:z.infer<typeof matchItem>[]=[],resources=new Set<string>(),cursors=new Set<string>();
 let cursor:string|undefined;
 for(let pageNumber=0;pageNumber<10;pageNumber++){
  signal.throwIfAborted();
  if(!Number.isFinite(Date.parse(expected.expiresAt))||Date.now()>=Date.parse(expected.expiresAt))throw Error('Original staffing comparison expired');
  const query=new URLSearchParams({resultId:expected.resultId,pageSize:'50'});if(cursor)query.set('cursor',cursor);
  const page=matchPage.parse(z.object({data:z.unknown()}).parse(await request('/api/staffing/demands/'+expected.demandId+'/matches?'+query,'GET')).data);
  signal.throwIfAborted();
  if(page.resultId!==expected.resultId||page.demandId!==expected.demandId||page.demandRevisionId!==expected.demandRevisionId||
   page.inputDigest!==expected.inputDigest||page.expiresAt!==expected.expiresAt||Date.now()>=Date.parse(page.expiresAt))throw Error('Original staffing comparison changed');
  if(!page.items.length&&(pageNumber>0||page.nextCursor!==null))throw Error('Staffing comparison cursor made no progress');
  for(const item of page.items){if(resources.has(item.resourceId))throw Error('Duplicate staffing comparison resource');resources.add(item.resourceId);items.push(item);}
  if(items.length>500)throw Error('Staffing comparison exceeds original resource bound');
  if(page.nextCursor===null)return items;
  if(page.items.length!==50||cursors.has(page.nextCursor)||pageNumber===9)throw Error('Invalid or overflowing staffing comparison cursor');
  cursors.add(page.nextCursor);cursor=page.nextCursor;
 }
 throw Error('Staffing comparison exceeds original resource bound');
}
