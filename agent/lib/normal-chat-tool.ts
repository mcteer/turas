import {defineDynamic} from 'eve/tools';
import {responseFeature} from '../../lib/server/conversations/feature';
/** Legacy ordinary-chat capabilities do not widen governed workflow catalogs. */
export function normalChatTool<T>(tool:T){
 return defineDynamic({events:{
  async 'turn.started'(_event,ctx){return (await responseFeature(ctx.session.auth.current))?.kind==='normal'?tool:null;},
  async 'step.started'(_event,ctx){return (await responseFeature(ctx.session.auth.current))?.kind==='normal'?tool:null;},
 }});
}
