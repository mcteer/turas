import { describe,expect,it } from 'vitest';
import { mcpFixture,withMcpDatabase } from '../../fixtures/mcp/setup';
import { requireOwnedMcpDatabase } from '../../../scripts/mcp-environment';
import { activateLearning } from '../../../scripts/learning-activate';
import {readFileSync} from 'node:fs';
const currentSchema=JSON.parse(readFileSync(new URL('../../../migrations/manifest.json',import.meta.url),'utf8')).version;
describe('explicit learning operator schema compatibility',()=>{
 it('accepts historical and current supported schemas for the migration owner and denies unknown versions/runtime ownership',async()=>withMcpDatabase(async db=>{
  const {actor}=await mcpFixture(db),owner=requireOwnedMcpDatabase(process.env,true),runtime=requireOwnedMcpDatabase(process.env,false);
  try{
   for(const version of [...new Set([54,55,currentSchema])]){
    await db.query('UPDATE turas_environment SET schema_version=$1',[version]);
    await activateLearning(actor.environmentId,actor.workspaceId,false,owner);
    expect((await db.query('SELECT gate_activated_at FROM learning_workspace_state WHERE workspace_id=$1',[actor.workspaceId])).rows[0].gate_activated_at).not.toBeNull();
   }
   await expect(activateLearning(actor.environmentId,actor.workspaceId,false,runtime)).rejects.toThrow('migration owner');
   await db.query('UPDATE turas_environment SET schema_version=$1',[currentSchema+1]);
   await expect(activateLearning(actor.environmentId,actor.workspaceId,false,owner)).rejects.toThrow('current supported schema');
  }finally{await db.query('UPDATE turas_environment SET schema_version=55');}
 }));
});
