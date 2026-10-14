import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import path from "node:path";
export async function pilotProtectedSnapshot(root=process.cwd()) {
 const hashFile=async(name:string)=>{try{return createHash("sha256").update(await readFile(path.join(root,name))).digest("hex");}catch(error){if((error as NodeJS.ErrnoException).code==="ENOENT")return null;throw error;}};
 const workflow=createHash("sha256");let files=0;
 async function visit(relative:string):Promise<void>{
  const full=path.join(root,relative);const stat=await lstat(full).catch(error=>{if(error.code==="ENOENT")return null;throw error;});
  if(!stat)return;
  if(stat.isSymbolicLink())throw new Error("Protected workflow contains an indirect path");
  if(stat.isDirectory()){for(const name of (await readdir(full)).sort())await visit(path.join(relative,name));}
  else if(stat.isFile()){workflow.update(relative);workflow.update(await readFile(full));files++;}
 }
 await visit(".eve/.workflow-data");
 return {model:await hashFile("agent/agent.ts"),configuration:await hashFile(".env.local"),workflow:workflow.digest("hex"),files};
}
