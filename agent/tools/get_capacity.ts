import {defineTool} from 'eve/tools';
import {normalChatTool} from '../lib/normal-chat-tool';
import {periodSchema,readOrdinaryCapacity} from '../../lib/server/ordinary-operations/reads';
export const authoredTool=defineTool({description:'Read the real authorized team roster and dated capacity, qualified skills, protected time and explicit missing coverage. Does not reveal private personnel notes or other customer assignment identities.',inputSchema:periodSchema,availableInSubagents:false,execute:(input,ctx)=>readOrdinaryCapacity(ctx.session.auth.current,input)});
export default normalChatTool(authoredTool);
