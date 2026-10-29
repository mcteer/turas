export function executionBackend(env:NodeJS.ProcessEnv=process.env){
 if(env.VERCEL==='1'&&env.TURAS_JOB_EXECUTOR!=='sandbox')throw Error('Hosted processing requires explicit Sandbox configuration');
 const backend=env.TURAS_JOB_EXECUTOR??'local';if(backend!=='local'&&backend!=='sandbox')throw Error('Unknown job executor');return backend;
}
