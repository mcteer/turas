/** Admission passes the Date object unchanged through the root model hook.
 * Weak identity preserves its failure callback without editing agent/agent.ts. */
export type ExpansionModelFailure = {code: string; inputTokens?: number; outputTokens?: number};
const callbacks=new WeakMap<Date,(failure?:ExpansionModelFailure)=>Promise<void>>();
export function registerExpansionModelFailure(deadline:Date,callback:(failure?:ExpansionModelFailure)=>Promise<void>){callbacks.set(deadline,callback);}
export async function failExpansionModel(deadline:Date,failure?:ExpansionModelFailure){try{await callbacks.get(deadline)?.(failure);}catch{/* Preserve the original provider failure; current actor/source fences still deny retry. */}}
