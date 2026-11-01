import {projectSpecialistFact} from '../research/specialists/discussion-events';
import type {AttachSessionFn} from 'eve/channels';
import type {SessionStreamEvent} from 'eve/client';
import {emptySessionView,foldEvents,position} from 'eve/events';
import {projectEveEvents} from './eve-events';

export async function readEveTail(attach:AttachSessionFn,id:string):Promise<number>{
 let tail=-1;
 for await(const event of attach(id).stream({startIndex:-1,follow:false,signal:AbortSignal.timeout(5000)})){
  tail=Math.max(tail,event.meta.position.line,(event.meta.next??0)-1);
 }
 return tail;
}

/** Read from the original source so every referenced run/interaction has its
 * authoritative context. Only complete commits enter reconciliation. */
export async function readEveHistory(attach:AttachSessionFn,id:string,start:number){
 const events:SessionStreamEvent[]=[];let view=emptySessionView();let committed=0;
 for await(const event of attach(id).stream({startIndex:0,follow:false,signal:AbortSignal.timeout(15000)})){
  if(event.meta.position.line>10000)throw new Error('Native replay window too large');
  events.push(event);view=foldEvents(view,[event]);
  const next=position(view);
  if(next>committed){
   for(const fact of events.filter(item=>item.meta.position.line>=committed&&item.meta.position.line<next))
    await projectSpecialistFact(id,fact,fact.meta.position,fact.meta.at,view);
   committed=next;
  }
 }
 const next=position(view);
 return projectEveEvents(id,events.filter(event=>event.meta.position.line>=start&&event.meta.position.line<next),view);
}
