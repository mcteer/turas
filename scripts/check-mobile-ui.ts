import { spawn } from 'node:child_process';
import { withStaffingEvalEnvironment } from './staffing-eval-environment';

process.env.AI_GATEWAY_API_KEY = '';
process.env.TURAS_ALLOW_LIVE_MODEL_TESTS = '0';
console.log('Preparing owned mobile UI environment.');
await withStaffingEvalEnvironment(async environment => {
  try {
    environment.bootstrapDemo();
    console.log('Setup complete; starting the disposable application.');
    await environment.start();
    await new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [
        'node_modules/@playwright/test/cli.js', 'test',
        '--config=playwright.mobile.config.ts', '--reporter=line', '--retries=0', '--forbid-only',
      ], {
        env: { ...process.env, TURAS_UI_BASE_URL: environment.origin },
        stdio: 'inherit', timeout: 780_000,
      });
      child.on('error', reject);
      child.on('close', code => code === 0 ? resolve() : reject(new Error('Mobile UI check failed')));
    });
  } finally { await environment.stop(); }
}, { deadlineAt: Date.now() + 1_320_000 });
