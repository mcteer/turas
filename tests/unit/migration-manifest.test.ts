import {CURRENT_SCHEMA_VERSION} from '../../lib/contracts/current-schema';
import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';

describe('migration manifest release contract',()=>{
 it('declares the physical schema reached by the ordered migration list',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../../migrations/manifest.json',import.meta.url),'utf8'));
  const versions=manifest.migrations.map((entry:{file:string})=>Number(entry.file.match(/^(\d+)-/)?.[1]));
  expect(versions).toEqual(Array.from({length:versions.length},(_,index)=>index+1));
  expect(manifest.version).toBe(versions.at(-1));
  expect(CURRENT_SCHEMA_VERSION).toBe(manifest.version);
 });
});
