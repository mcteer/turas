/** Credential shape only: Blob verifies the project identity and connected-store
 * permission. Never infer authority by decoding an unverified JWT. */
export type PrivateBlobAuth={token:string}|{storeId:string;oidcToken?:string};
export function privateBlobAuth(env:NodeJS.ProcessEnv=process.env):PrivateBlobAuth{
 const storeId=env.BLOB_STORE_ID?.replace(/^store_/,'');
 if(!storeId||!/^[a-zA-Z0-9-]{1,128}$/.test(storeId))throw Error('Explicit private Blob store configuration required');
 const token=env.BLOB_READ_WRITE_TOKEN;
 if(token){
  if(!token.startsWith('vercel_blob_rw_')||token.split('_')[3]!==storeId||!token.split('_')[4])throw Error('Private Blob token/store identity differs');
  return {token};
 }
 const oidcToken=env.VERCEL_OIDC_TOKEN;
 if(oidcToken){if(oidcToken.length>16384||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(oidcToken))throw Error('Private Blob OIDC configuration required');return {storeId,oidcToken};}
 // The pinned SDK obtains a fresh request identity on Vercel. Provider denial
 // remains fatal; no static token or local storage is substituted.
 if(env.VERCEL==='1')return {storeId};
 throw Error('Explicit private Blob store configuration required');
}
