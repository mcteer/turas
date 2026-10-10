import { learningRequest,learningQuery } from '../../_shared';
import { learningDraftMeta } from '../../../../../lib/server/learning/advisory';
import { readLearningDraft } from '../../../../../lib/server/learning/drafts';
import { z } from 'zod';
export async function GET(request:Request,context:{params:Promise<{id:string}>}){const {id}=await context.params;return learningRequest(request,false,async actor=>{z.object({}).strict().parse(learningQuery(request));const meta=await learningDraftMeta(actor,id);return meta.state==='completed'?{...meta,...await readLearningDraft(actor,id)}:meta;});}
