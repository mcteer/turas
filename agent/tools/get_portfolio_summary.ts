import {defineTool} from 'eve/tools';
import {normalChatTool} from '../lib/normal-chat-tool';
import {periodSchema,readOrdinaryPortfolio} from '../../lib/server/ordinary-operations/reads';
export const authoredTool=defineTool({description:'Read the real currently authorized delivery portfolio, evidence, milestones, blockers, unknowns and decision exceptions for explicit dates. Private finance stays restricted; missing amounts are unknown, never zero.',inputSchema:periodSchema,availableInSubagents:false,execute:(input,ctx)=>readOrdinaryPortfolio(ctx.session.auth.current,input)});
export default normalChatTool(authoredTool);
