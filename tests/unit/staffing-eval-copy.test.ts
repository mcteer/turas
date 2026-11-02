import { mkdtemp, mkdir, readFile, writeFile, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { copyOwnedEvalFiles } from "../../scripts/eval-owned-copy";
import { withOwnedNestedCloneCallback } from "../../scripts/plan-eval-environment";
import { requireOwnedStaffingClone } from "../../scripts/staffing-eval-environment";

const roots: string[] = [];
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "turas-owned-copy-")); roots.push(root);
  const source = join(root, "source"), destination = join(root, "owned-target");
  await mkdir(source); await writeFile(join(source, "synthetic.txt"), "Synthetic owned bytes\n", { mode: 0o600 });
  return { root, source, destination };
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("original-allowance owned filesystem setup", () => {
  it("copies actual synthetic bytes while excluding runtime dependencies and workflow state", async () => {
    const f = await fixture();
    for (const directory of ["node_modules", ".eve"]) {
      await mkdir(join(f.source, directory)); await writeFile(join(f.source, directory, "private.txt"), "Synthetic excluded state");
    }
    copyOwnedEvalFiles(f.source, f.destination, { deadlineAt: Date.now() + 10_000, excludeRuntime: true });
    expect(await readFile(join(f.destination, "synthetic.txt"), "utf8")).toBe("Synthetic owned bytes\n");
    await expect(access(join(f.destination, "node_modules"))).rejects.toMatchObject({ code: "ENOENT" });
    await expect(access(join(f.destination, ".eve"))).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("refuses an elapsed original deadline before creating a destination and distinguishes optional missing assets", async () => {
    const f = await fixture();
    expect(() => copyOwnedEvalFiles(f.source, f.destination, { deadlineAt: Date.now() - 1 })).toThrow("Original owned evaluation deadline reached");
    await expect(access(f.destination)).rejects.toMatchObject({ code: "ENOENT" });
    expect(() => copyOwnedEvalFiles(join(f.root, "absent"), f.destination)).toThrow("Owned evaluation copy failed");
    expect(() => copyOwnedEvalFiles(join(f.root, "absent"), f.destination, { allowMissing: true })).not.toThrow();
    await expect(access(f.destination)).rejects.toMatchObject({ code: "ENOENT" });
  });
  it("does not inherit Node preload options into the actual copy child", async () => {
    const f = await fixture(), prior = process.env.NODE_OPTIONS;
    try {
      process.env.NODE_OPTIONS = "--synthetic-invalid-option-must-not-reach-child";
      copyOwnedEvalFiles(f.source, f.destination, { deadlineAt: Date.now() + 10_000 });
      expect(await readFile(join(f.destination, "synthetic.txt"), "utf8")).toBe("Synthetic owned bytes\n");
      const clone='postgresql://synthetic:synthetic@127.0.0.1:12345/turas_test_007_eval_abcdefabcdef',source='postgresql://synthetic:synthetic@127.0.0.1:12345/turas_test_016_eval_abcdefabcdef';
      const proof={feature:'007',created:true,databaseName:'turas_test_007_eval_abcdefabcdef',cloneUrl:clone,sourceUrl:source,environmentId:'test-pilot-synthetic',ownership:'turas-owned-007-synthetic',readback:{database_name:'turas_test_007_eval_abcdefabcdef',owner_marker:'turas-owned-007-synthetic',environment_id:'test-pilot-synthetic',schema_version:79}};
      const env:Record<string,string|undefined>={DATABASE_URL:clone,DATABASE_URL_UNPOOLED:clone,TURAS_TEST_DATABASE_URL:clone,TURAS_TEST_SOURCE_DATABASE_URL:source,TURAS_ENVIRONMENT_ID:'test-pilot-synthetic',TURAS_TEST_ENVIRONMENT_ID:'test-pilot-synthetic',TURAS_PILOT_OWNED:'1'};
      await withOwnedNestedCloneCallback(proof,async()=>{expect(env.TURAS_PILOT_OWNED).toBeUndefined();expect(requireOwnedStaffingClone(env)).toBe(clone);},env);expect(env.TURAS_PILOT_OWNED).toBe('1');
      const sentinel=new Error('synthetic callback failure');await expect(withOwnedNestedCloneCallback(proof,async()=>{throw sentinel;},env)).rejects.toBe(sentinel);expect(env.TURAS_PILOT_OWNED).toBe('1');
      delete env.TURAS_PILOT_OWNED;await withOwnedNestedCloneCallback(proof,async()=>undefined,env);expect(Object.hasOwn(env,'TURAS_PILOT_OWNED')).toBe(false);
      env.TURAS_PILOT_OWNED='1';let entered=false;await expect(withOwnedNestedCloneCallback({...proof,cloneUrl:source},async()=>{entered=true;},env)).rejects.toMatchObject({code:'OWNED_NESTED_CLONE_IDENTITY'});expect(entered).toBe(false);expect(env.TURAS_PILOT_OWNED).toBe('1');
      await expect(withOwnedNestedCloneCallback({...proof,created:false},async()=>undefined,env)).rejects.toMatchObject({code:'OWNED_NESTED_CLONE_IDENTITY'});
      await expect(withOwnedNestedCloneCallback({...proof,readback:{...proof.readback,owner_marker:'foreign'}},async()=>undefined,env)).rejects.toMatchObject({code:'OWNED_NESTED_CLONE_IDENTITY'});
      const foreign={...env,DATABASE_URL:'postgresql://synthetic:synthetic@127.0.0.1:12345/production'};expect(()=>requireOwnedStaffingClone(foreign)).toThrow();
      // Exercise the actual owned-runtime environment expressions and a
      // real Node child. Copy children stay unpreloaded; model runtime children
      // must retain only the explicitly selected quality bootstrap.
      const runtimeSource=await readFile(resolve("scripts/plan-eval-environment.ts"),"utf8");
      const expressions=[...runtimeSource.matchAll(/env:(\{\.\.\.process\.env,[\s\S]*?\}),/g)].map(match=>match[1]);
      expect(expressions).toHaveLength(4);
      const bootstrap=join(f.root,"selected-quality-bootstrap.mjs");
      await writeFile(bootstrap,"globalThis.__selectedQualityGuardInstalled = true;\n",{mode:0o600});
      const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
      for(const expression of expressions){
        const compose=new AsyncFunction("process","productionEnv","qualityChildEnvironment","port","evePortLease","options",`return (${expression.replaceAll("evePortLease!.","evePortLease.")});`);
        for(const active of [false,true]){
          const quality=active?{NODE_OPTIONS:`--import=${JSON.stringify(bootstrap)}`,TURAS_016_QUALITY_RUNTIME_FILE:"/synthetic/selected-runtime.json"}:{NODE_OPTIONS:""};
          const childEnv=await compose({env:{NODE_OPTIONS:"--synthetic-invalid-must-not-inherit"}},{},async()=>quality,"12345",{port:12346},{production:false});
          const child=spawnSync(process.execPath,["--input-type=module","-e",`if(Boolean(globalThis.__selectedQualityGuardInstalled)!==${active})process.exit(43);`],{env:childEnv,encoding:"utf8",timeout:5000});
          expect(child.error).toBeUndefined();expect(child.status).toBe(0);
          expect(childEnv.NODE_OPTIONS).toBe(quality.NODE_OPTIONS);
        }
      }
    } finally { if (prior === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = prior; }
  });
});
