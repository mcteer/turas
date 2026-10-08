/** Admission passes the Date object unchanged through the root model hook.
 * Weak identity preserves its failure callback without editing agent/agent.ts. */
const callbacks=new WeakMap<Date,()=>Promise<void>>();
export function registerExpansionModelFailure(deadline:Date,callback:()=>Promise<void>){callbacks.set(deadline,callback);}
export async function failExpansionModel(deadline:Date){try{await callbacks.get(deadline)?.();}catch{/* Preserve the original provider failure; current actor/source fences still deny retry. */}}
