import { createHash } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { verifyOwnedMaintenanceRecovery } from '../../lib/server/operations/owned-maintenance-verification';

type Pending = { id: string; actor: { sessionId: string; token: string }; secret: string };
const fixture = vi.hoisted(() => {
  const source = { sourceCommit: 'a'.repeat(40), sourceDigest: 'source', catalogDigest: 'catalog' };
  return {
    source, application: { ...source, origin: 'http://127.0.0.1:3199' },
    inventory: vi.fn(), issue: vi.fn<() => Promise<Pending>>(), retire: vi.fn(),
    admissions: new Map<string, Pending>(),
  };
});
vi.mock('../../scripts/pilot-source', () => ({ pilotSource: async () => fixture.source }));
vi.mock('../../lib/server/operations/owned-maintenance-inventory', () => ({ deriveOwnedMaintenanceInventory: fixture.inventory }));
vi.mock('../../lib/server/operations/owned-restore-target', () => ({
  withOwnedRestoredRuntime: async (_target: unknown, _scope: unknown, signal: AbortSignal, run: Function) => run({}, signal, {}),
  withOwnedRestoreTarget: async (_target: unknown, _scope: unknown, _signal: AbortSignal, run: Function) => run({ query: async () => ({ rowCount: 0 }) }),
}));
vi.mock('../../scripts/pilot-owned-recovery-application', () => ({
  prepareOwnedRecoveryApplication: async () => fixture.application,
  warmOwnedRecoveryApplication: async () => {}, retireOwnedRecoveryApplication: async () => {},
  withOwnedRecoveryApplication: async (_application: unknown, _environment: unknown, _signal: AbortSignal, run: Function) => run(),
  withOwnedRecoveryApplicationConfiguration: async (_application: unknown, _signal: AbortSignal, run: Function) => run({
    query: async (sql: string, values?: string[]) => ({ rows: sql.startsWith('SELECT session_id') ? [{ session_id: fixture.admissions.get(values![0])?.actor.sessionId }] : sql.includes('AS closed') ? [{ closed: true }] : [] }),
  }),
}));
vi.mock('../../lib/server/operations/recovery-http-read-issuer', () => ({
  issueOwnedRecoveryHttpRead: fixture.issue, retireOwnedRecoveryHttpRead: fixture.retire,
}));

const bytes = Buffer.from('synthetic export');
function setup() {
  fixture.admissions.clear(); fixture.issue.mockReset(); fixture.retire.mockReset();
  const scope = { environmentId: 'test-maintenance', recoveryId: 'fixture', controlRevision: 1 };
  fixture.inventory.mockResolvedValue({ inventoryDigest: 'inventory', physicalClassifications: [], records: ['first', 'second'].map(recordId => ({
    kind: 'artifact', recordId, membershipId: 'member', object: { sizeBytes: bytes.length, digest: createHash('sha256').update(bytes).digest('hex') },
  })) });
  const headers = { 'x-turas-code-version': fixture.source.sourceCommit };
  const fetch = vi.fn(async (url: string, init: RequestInit) => {
    const parts = new URL(url).pathname.split('/'), owned = fixture.admissions.get(parts.at(-2)!);
    if (owned && parts.at(-1) === 'artifact' && (init.headers as Headers).get('cookie') === 'turas_session='+owned.actor.token) {
      return new Response(bytes, { status: 200, headers: { ...headers, 'content-disposition': 'attachment', 'x-content-type-options': 'nosniff' } });
    }
    return new Response(null, { status: 403, headers });
  });
  const admission = (id: string) => {
    const row = { id, actor: { sessionId: id, token: id, membershipId: 'member' }, secret: id };
    fixture.admissions.set(id, row);
    return row;
  };
  fixture.retire.mockImplementation(async (_db, id: string) => { fixture.admissions.get(id)!.actor.token = 'retired'; });
  vi.stubGlobal('fetch', fetch);
  return { admission, fetch, run: () => verifyOwnedMaintenanceRecovery({
    target: {} as Parameters<typeof verifyOwnedMaintenanceRecovery>[0]['target'], scope, password: 'synthetic', rendererImage: 'fixture',
    signal: AbortSignal.timeout(5000), deadline: Date.now()+5000,
  }) };
}

afterEach(() => vi.unstubAllGlobals());

it('does not issue an HTTP probe while a sibling holds the owner preparation fence', async () => {
  const { admission, fetch, run } = setup();
  const entered = Promise.withResolvers<void>(), prepared = Promise.withResolvers<void>();
  fixture.issue.mockImplementationOnce(async () => admission('first')).mockImplementationOnce(async () => {
    entered.resolve(); await prepared.promise; return admission('second');
  });
  const result = run();
  try {
    await entered.promise;
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(fetch).not.toHaveBeenCalled();
  } finally { prepared.resolve(); }
  await expect(result).resolves.toMatchObject({ verifiedRecords: 2, verifiedOriginalBytes: 2*bytes.length, probeRetirementVerified: true });
  expect(fixture.retire).toHaveBeenCalledTimes(2);
});

it('retires previously issued admissions without probing when the batch cannot be prepared', async () => {
  const { admission, fetch, run } = setup();
  fixture.issue.mockImplementationOnce(async () => admission('first')).mockRejectedValueOnce(Error('Synthetic issuance failure'));
  await expect(run()).rejects.toThrow('Synthetic issuance failure');
  expect(fetch).not.toHaveBeenCalled();
  expect(fixture.retire).toHaveBeenCalledExactlyOnceWith(expect.anything(), 'first');
});
