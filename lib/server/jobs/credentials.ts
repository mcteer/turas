import {getContext} from '@vercel/oidc';

export function hostedExecutionIdentity(env:NodeJS.ProcessEnv=process.env){
 const {VERCEL_PROJECT_ID:projectId,VERCEL_TEAM_ID:teamId}=env;
 if(!projectId||!teamId)throw Error('Explicit hosted execution credentials required');
 return {projectId,teamId};
}

/** Read fresh platform request credentials for each operation. The provider
 * authenticates the bearer; these checks bind it to our admitted target and
 * leave enough lifetime for the original five-minute job plus cleanup. */
export function hostedExecutionCredentials(env:NodeJS.ProcessEnv=process.env){
 const identity=hostedExecutionIdentity(env);
 if(env.VERCEL_TOKEN)return {token:env.VERCEL_TOKEN,...identity};
 try{
  if(env.VERCEL!=='1'||!['preview','production'].includes(env.VERCEL_ENV??''))throw Error();
  const token=getContext().headers?.['x-vercel-oidc-token'];
  if(typeof token!=='string'||token.length>32768)throw Error();
  const parts=token.split('.');
  if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))throw Error();
  const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'));
  if(claims.project_id!==identity.projectId||claims.owner_id!==identity.teamId||
    !Number.isSafeInteger(claims.exp)||claims.exp*1000<Date.now()+330000||
    typeof claims.iss!=='string'||!/^https:\/\/oidc\.vercel\.com(?:\/[A-Za-z0-9_-]+)?$/.test(claims.iss))throw Error();
  return {token,...identity};
 }catch{
  throw Error('Current project OIDC execution credentials required');
 }
}
