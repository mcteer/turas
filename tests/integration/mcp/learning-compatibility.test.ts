import { describe,expect,it } from 'vitest';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { requireOwnedMcpDatabase } from '../../../scripts/mcp-environment';
import { activateLearning } from '../../../scripts/learning-activate';
describe('explicit learning operator schema compatibility',()=>{
 it('accepts exactly 054 and 055 for the migration owner and denies unknown versions/runtime ownership',async()=>withMcpDatabase(async db=>{
  const {actor}=await mcpFixture(db),owner=requireOwnedMcpDatabase(process.env,true),runtime=requireOwnedMcpDatabase(process.env,false);
  try{
   for(const version of [54,55]){
    await db.query('UPDATE turas_environment SET schema_version=$1',[version]);
    await activateLearning(actor.environmentId,actor.workspaceId,false,owner);
    expect((await db.query('SELECT gate_activated_at FROM learning_workspace_state WHERE workspace_id=$1',[actor.workspaceId])).rows[0].gate_activated_at).not.toBeNull();
   }
   await expect(activateLearning(actor.environmentId,actor.workspaceId,false,runtime)).rejects.toThrow('migration owner');
   await db.query('UPDATE turas_environment SET schema_version=56');
   await expect(activateLearning(actor.environmentId,actor.workspaceId,false,owner)).rejects.toThrow('054 or 055');
  }finally{await db.query('UPDATE turas_environment SET schema_version=55');}
 }));
});
