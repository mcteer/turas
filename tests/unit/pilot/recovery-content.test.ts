import {it,expect} from 'vitest';
import {recoveryDigest} from '../../../lib/contracts/pilot-recovery';
import {connectionMetadata} from '../../../lib/server/mcp/management';
import {randomUUID} from 'node:crypto';
it('hashes identical recovery inventories independently of object property order',()=>{
 expect(recoveryDigest([{key:'owned/object',sizeBytes:10,digest:'a'.repeat(64)}])).toBe(recoveryDigest([{digest:'a'.repeat(64),key:'owned/object',sizeBytes:10}]));
 expect(recoveryDigest({nested:{a:1,b:2}})).toBe(recoveryDigest({nested:{b:2,a:1}}));
 expect(recoveryDigest([{id:1},{id:2}])).not.toBe(recoveryDigest([{id:2},{id:1}]));
});
it('reports permanently removed MCP credentials as revoked without inventing a human revoker',()=>{
 const row={id:randomUUID(),name:'Synthetic quarantined credential',categories:['profiles'],created_at:new Date(Date.now()-1000),expires_at:new Date(Date.now()+60000),revoked_at:null,last_used_at:null,credential_hash:null};
 const metadata=connectionMetadata(row);expect(metadata).toMatchObject({state:'revoked',revokedAt:null});expect(metadata).not.toHaveProperty('credential_hash');
 expect(connectionMetadata({...row,credential_hash:'a'.repeat(64)}).state).toBe('active');
 expect(connectionMetadata({...row,expires_at:new Date(Date.now()-1)}).state).toBe('expired');
});
it('refuses non-JSON recovery identity and detects changed content',()=>{
 expect(()=>recoveryDigest(undefined)).toThrow();const cycle:any={};cycle.self=cycle;expect(()=>recoveryDigest(cycle)).toThrow();expect(recoveryDigest({accepted:'before'})).not.toBe(recoveryDigest({accepted:'after'}));
});
