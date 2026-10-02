import { spawnSync } from "node:child_process";
import { ownedEvalTimeout } from "./eval-deadline";

const copier = `
import { cp } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const { source, destination, excludeRuntime, allowMissing } = JSON.parse(readFileSync(0, 'utf8'));
try {
  await cp(source, destination, { recursive: true, force: true,
    filter: excludeRuntime ? path => !path.split(/[/\\\\]/).some(part => part === 'node_modules' || part === '.eve') : undefined });
} catch (error) {
  if (!allowMissing || error.code !== 'ENOENT') process.exitCode = 1;
}
`;

/** The caller supplies an already-owned destination. A separate local copier
 * can be killed at the original deadline before cleanup removes its target;
 * racing an uncancellable fs.cp promise against a timer would leave writes alive.
 * No app credentials, model key or Node preload options reach this child. */
export function copyOwnedEvalFiles(source: string, destination: string,
  options: { deadlineAt?: number; excludeRuntime?: boolean; allowMissing?: boolean } = {}): void {
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", copier], {
    input: JSON.stringify({ source, destination, excludeRuntime: options.excludeRuntime ?? false,
      allowMissing: options.allowMissing ?? false }),
    env: { NODE_ENV: "test" }, encoding: "utf8", stdio: ["pipe", "ignore", "ignore"],
    timeout: ownedEvalTimeout(options.deadlineAt, 120_000), killSignal: "SIGKILL",
  });
  if (result.error || result.status !== 0) throw new Error("Owned evaluation copy failed or exceeded its original allowance");
  ownedEvalTimeout(options.deadlineAt, 1);
}
