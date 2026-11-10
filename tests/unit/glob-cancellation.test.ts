import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { glob, globSync } from 'glob';
import { expect, it } from 'vitest';

it('preserves migration discovery and stops traversal when aborted during filtering', async () => {
  const cwd = mkdtempSync(join(tmpdir(), 'turas-glob-'));
  try {
    mkdirSync(join(cwd, 'nested'));
    writeFileSync(join(cwd, '001-first.cjs'), '');
    writeFileSync(join(cwd, 'nested', '002-second.cjs'), '');
    expect((await glob('**/*.cjs', { cwd })).sort()).toEqual([
      '001-first.cjs', 'nested/002-second.cjs',
    ]);
    for (const sync of [false, true]) {
      const controller = new AbortController();
      const reason = new Error('cancel migration discovery');
      let checksAfterAbort = 0;
      const options = {
        cwd,
        signal: controller.signal,
        ignore: {
          childrenIgnored: () => {
            if (controller.signal.aborted) checksAfterAbort++;
            else controller.abort(reason);
            return false;
          },
        },
      };
      if (sync) expect(() => globSync('**/*.cjs', options)).toThrow(reason);
      else await expect(glob('**/*.cjs', options)).rejects.toThrow(reason);
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(checksAfterAbort).toBe(0);
    }
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
