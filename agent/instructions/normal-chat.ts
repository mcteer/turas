import {defineDynamic,defineInstructions} from 'eve/instructions';
import {responseFeature} from '../../lib/server/conversations/feature';
import content from '../../lib/conversations/ordinary-instructions.md?raw';

export default defineDynamic({events:{async 'turn.started'(_event,ctx){
  if((await responseFeature(ctx.session.auth.current))?.kind!=='normal')return null;
  return defineInstructions({content});
}}});
