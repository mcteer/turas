import { defineDynamic,defineTool } from 'eve/tools';
import { responseFeature } from '../../lib/server/conversations/feature';
import { learningReadSchemas } from '../../lib/server/learning/model-budget';
import { runLearningRead } from '../../lib/server/learning/tools';
export const authoredTool=defineTool({description:'Read exact selected original citation keys; feedback is never an original.',inputSchema:learningReadSchemas.learning_evidence,availableInSubagents:false,execute(input,ctx){return runLearningRead(ctx.session.auth.current,'learning_evidence',input,ctx.callId);}});
export default defineDynamic({events:{async 'turn.started'(_event,ctx){const feature=await responseFeature(ctx.session.auth.current);return feature?.kind==='learning'&&feature.scope.purpose==='draft'?authoredTool:null;}}});
