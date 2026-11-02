import {wrapLanguageModel} from 'ai';
type Model=Parameters<typeof wrapLanguageModel>[0]['model'];

/** Eve resolves model selection before instructions. Reserve governed work only
 * when the assembled request reaches provider I/O. Keep one guarded model per
 * selection so repeated SDK calls cannot obtain another paid reservation. */
export function deferModelAdmission(model:Model,admit:()=>Promise<Model>){
 let admitted:Promise<ReturnType<typeof wrapLanguageModel>>|undefined;
 const ready=()=>admitted??=admit().then(selected=>wrapLanguageModel({model:selected,middleware:[]}));
 return wrapLanguageModel({model,middleware:{
  wrapGenerate:async({params})=>(await ready()).doGenerate(params),
  wrapStream:async({params})=>(await ready()).doStream(params),
 }});
}
