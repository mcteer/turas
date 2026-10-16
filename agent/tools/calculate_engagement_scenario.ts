import {defineTool} from 'eve/tools';
import {normalChatTool} from '../lib/normal-chat-tool';
import {scenarioInputSchema,calculateOrdinaryScenario} from '../../lib/server/ordinary-operations/reads';
export const authoredTool=defineTool({description:'Calculate a nonpersistent hypothetical against real governed engagement actual/remaining effort and permitted finance. Remaining hours REPLACE the baseline remainder. Fee/nonlabor/rate overrides are explicit whole-engagement minor-unit assumptions with an explicit currency; reporting-period totals are never used for lifetime EAC, never approved prices or assignments. Missing inputs stay unknown.',inputSchema:scenarioInputSchema,availableInSubagents:false,execute:(input,ctx)=>calculateOrdinaryScenario(ctx.session.auth.current,input)});
export default normalChatTool(authoredTool);
