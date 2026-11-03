import {describe,expect,it} from 'vitest';
import {spawnSync} from 'node:child_process';
import {isAbsolute} from 'node:path';
import {ownedParentEnvironment} from '../../scripts/owned-parent-environment';

describe('disposable parent environment',()=>{
 it('omits absent Linux host settings instead of creating string undefined',()=>{
  const env=ownedParentEnvironment({PATH:process.env.PATH,HOME:process.env.HOME,TMPDIR:undefined});
  expect(env).not.toHaveProperty('TMPDIR');expect(env).not.toHaveProperty('LC_ALL');expect(env).not.toHaveProperty('SYSTEMROOT');
  const child=spawnSync(process.execPath,['-e','process.stdout.write(require("node:os").tmpdir())'],{env,encoding:'utf8'});
  expect(child.status).toBe(0);expect(isAbsolute(child.stdout)).toBe(true);
 });
 it('preserves explicit host settings, including an empty locale',()=>{
  expect(ownedParentEnvironment({PATH:'/owned/bin',HOME:'/owned',TMPDIR:'/owned/tmp',LANG:''})).toEqual({PATH:'/owned/bin',HOME:'/owned',TMPDIR:'/owned/tmp',LANG:'',NODE_ENV:'test'});
 });
 it('does not inherit application secrets or selected database authority',()=>{
  expect(ownedParentEnvironment({HOME:'/owned',NODE_ENV:'production',DATABASE_URL:'private',TURAS_DEMO_PASSWORD:'private',VERCEL_TOKEN:'private'})).toEqual({HOME:'/owned',NODE_ENV:'test'});
 });
});
