import type {DynamicToolResult} from 'eve/tools';
import {defineDynamic} from 'eve/tools';
import {responseFeature} from '../../lib/server/conversations/feature';
/** Legacy ordinary-chat capabilities do not widen governed workflow catalogs. */
export function normalChatTool<T extends DynamicToolResult>(tool:T){
 return defineDynamic(async (ctx) => (await responseFeature(ctx.session.auth.current))?.kind === 'normal' ? tool : null);
}
