export function operationalCodeVersion(env:NodeJS.ProcessEnv=process.env){
 const version=optionalOperationalCodeVersion(env);
 if(!version)throw Error('Exact operational code version required');return version;
}
export function optionalOperationalCodeVersion(env:NodeJS.ProcessEnv=process.env){
 const version=env.VERCEL_GIT_COMMIT_SHA??env.TURAS_CODE_VERSION;
 return version&&/^[a-f0-9]{40}$/.test(version)?version:null;
}
