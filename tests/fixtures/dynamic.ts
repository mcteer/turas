import type {DynamicSentinel} from 'eve/tools';

/** Exercise the installed framework's authored callback without starting a model. */
export async function resolveDynamic<Result,Context>(definition:DynamicSentinel<Result,Context>,context:Context):Promise<Result>{
 const callback=Reflect.get(definition,Symbol.for('eve.dynamic'));
 if(typeof callback!=='function')throw new Error('The installed Eve dynamic contract changed');
 return callback(context);
}

/** The selected legacy specialist factories are synchronous definitions. */
export function resolveStaticDynamic<Result>(definition:unknown):Result{
 if(!definition||typeof definition!=='object')throw new Error('Missing dynamic definition');
 const callback=Reflect.get(definition,Symbol.for('eve.dynamic'));
 if(typeof callback!=='function')throw new Error('The installed Eve dynamic contract changed');
 const result=callback({});
 if(result instanceof Promise)throw new Error('Expected a synchronous specialist factory');
 return result;
}
