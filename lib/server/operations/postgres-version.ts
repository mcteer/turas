/** Deliberately bounded supported versions, selected from actual server metadata.
 * Neither operator input nor a mutable image tag can silently change the client. */
export const recoveryPostgresImages=Object.freeze({
 17:'pgvector/pgvector:pg17@sha256:cf134a767f474095eeba57e0117be8e568e011a63f33fbf252f14c9b760f8e6f',
 18:'pgvector/pgvector:0.8.6-pg18@sha256:2ba9ca5f2e7daa0f0e7723cba1ee9167bab54efd3640516a44ac1a928dd67e7a',
});
export type RecoveryPostgresMajor=17|18;
export function recoveryPostgresMajor(serverVersion:number):RecoveryPostgresMajor{
 if(!Number.isSafeInteger(serverVersion))throw Error('Compatible PostgreSQL server required');
 const major=Math.floor(serverVersion/10000);if(major!==17&&major!==18)throw Error('Compatible PostgreSQL 17 or 18 server required');return major;
}
export function recoveryPostgresImage(major:RecoveryPostgresMajor){if(major!==17&&major!==18)throw Error('Compatible recovery client required');return recoveryPostgresImages[major];}
export function matchesRecoveryClient(version:string,program:'pg_dump'|'pg_restore',major:RecoveryPostgresMajor){return new RegExp('^'+program+' \\(PostgreSQL\\) '+major+'\\.[0-9]+(?:\\s|$)').test(version);}
