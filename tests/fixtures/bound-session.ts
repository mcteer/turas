import type {PoolClient,Client} from 'pg';
/** Fixture compatibility only. Runtime session admission remains in the governed
 * server service. The actual marked test schema decides which columns exist. */
export async function insertBoundFixtureSession(db:Client|PoolClient,input:{id:string;principalId:string;tokenHash:string;expiresAt:Date;membershipId:string;workspaceId:string}){
 const marker=(await db.query('SELECT environment_id,schema_version FROM turas_environment')).rows;
 if(marker.length!==1||marker[0].environment_id!==process.env.TURAS_TEST_ENVIRONMENT_ID||!String(marker[0].environment_id).startsWith('test-'))throw Error('Actual marked fixture database required');
 const member=(await db.query('SELECT id FROM memberships WHERE id=$1 AND principal_id=$2 AND workspace_id=$3 AND active',[input.membershipId,input.principalId,input.workspaceId])).rows;
 if(member.length!==1)throw Error('Actual fixture membership required');
 if(Number(marker[0].schema_version)>=78)await db.query('INSERT INTO login_sessions(id,principal_id,token_hash,expires_at,membership_id,workspace_id) VALUES($1,$2,$3,$4,$5,$6)',[input.id,input.principalId,input.tokenHash,input.expiresAt,input.membershipId,input.workspaceId]);
 else await db.query('INSERT INTO login_sessions(id,principal_id,token_hash,expires_at) VALUES($1,$2,$3,$4)',[input.id,input.principalId,input.tokenHash,input.expiresAt]);
}
