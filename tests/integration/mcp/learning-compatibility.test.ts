import { describe,expect,it } from 'vitest';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { requireOwnedMcpDatabase } from '../../../scripts/mcp-environment';
import { activateLearning } from '../../../scripts/learning-activate';
describe('explicit learning operator schema compatibility',()=>{
 it('accepts explicit supported 054–057 owner activation and restores the original schema after compatibility probes',async()=>withMcpDatabase(async db=>{
  const {actor}=await mcpFixture(db),owner=requireOwnedMcpDatabase(process.env,true),runtime=requireOwnedMcpDatabase(process.env,false);
  const original=Number((await db.query('SELECT schema_version FROM turas_environment')).rows[0].schema_version);
  try{
   for(const version of [54,55,56,57]){
    await db.query('UPDATE turas_environment SET schema_version=$1',[version]);
    await activateLearning(actor.environmentId,actor.workspaceId,false,owner);
    expect((await db.query('SELECT gate_activated_at FROM learning_workspace_state WHERE workspace_id=$1',[actor.workspaceId])).rows[0].gate_activated_at).not.toBeNull();
   }
   await expect(activateLearning(actor.environmentId,actor.workspaceId,false,runtime)).rejects.toThrow('migration owner');
   for(const version of [53,58]){await db.query('UPDATE turas_environment SET schema_version=$1',[version]);await expect(activateLearning(actor.environmentId,actor.workspaceId,false,owner)).rejects.toThrow('054–057');}
  }finally{await db.query('UPDATE turas_environment SET schema_version=$1',[original]);}
 }));
});
