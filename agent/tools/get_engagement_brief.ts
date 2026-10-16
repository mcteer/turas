import {defineTool} from 'eve/tools';
import {normalChatTool} from '../lib/normal-chat-tool';
import {engagementInputSchema,readOrdinaryEngagement} from '../../lib/server/ordinary-operations/reads';
export const authoredTool=defineTool({description:'Read a real canonical engagement and reviewed baseline, scope, milestones, owners, evidence, actual and remaining effort and authorized economics. Use exact engagement ID and dates; a missing estimate or private finance input remains unknown.',inputSchema:engagementInputSchema,availableInSubagents:false,execute:(input,ctx)=>readOrdinaryEngagement(ctx.session.auth.current,input)});
export default normalChatTool(authoredTool);
