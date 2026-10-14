export { withPilotEnvironment, requireOwnedPilotDatabase, type PilotEnvironment } from "../../../scripts/pilot-environment";
import {withPilotEnvironment,type PilotEnvironment} from '../../../scripts/pilot-environment';
/** Keep one fresh owned environment alive for a suite without borrowing queues
 * or mutable control state from earlier registered suites. */
export async function openOwnedPilotSuite(options:Parameters<typeof withPilotEnvironment>[1]={}){
 let ready!:(environment:PilotEnvironment)=>void,failed!:(error:unknown)=>void,stop!:()=>void;
 const initialized=new Promise<PilotEnvironment>((resolve,reject)=>{ready=resolve;failed=reject;});
 const stopped=new Promise<void>(resolve=>{stop=resolve;});
 const lifecycle=withPilotEnvironment(async environment=>{ready(environment);await stopped;},options);
 void lifecycle.catch(failed);
 return {environment:await initialized,close:async()=>{stop();await lifecycle;}};
}

/** Each full population owns its environment: governance permits only one
 * active pilot workspace per environment. Preserve every earlier population.
 * Only the already selected immutable renderer is carried into this scope. */
export async function openOwnedPilotLoadSuite(options:{renderer?:boolean;http?:boolean}={}){
 const renderer=process.env.TURAS_PILOT_RENDERER_IMAGE;
 if(options.renderer&&(!/^sha256:[a-f0-9]{64}$/.test(renderer??'')||process.env.TURAS_REPORTS_ENABLED!=='true'))throw Error('Explicit prepared renderer required');
 const owned=await openOwnedPilotSuite({postgresMajor:18,queryStatistics:true,deadlineMs:660000});
 try{
  if(options.renderer){process.env.TURAS_PILOT_RENDERER_IMAGE=renderer;process.env.TURAS_REPORTS_ENABLED='true';}
  if(options.http)await owned.environment.startProduction();
  return owned;
 }catch(error){await owned.close();throw error;}
}
