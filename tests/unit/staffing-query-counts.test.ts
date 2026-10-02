import type { Pool, PoolClient } from "pg";
import { describe, expect, it } from "vitest";
import { installPoolQueryCounter } from "../../lib/server/db/query-counts";

function fakePool() {
  const clients: PoolClient[] = [];
  const originals = new WeakMap<PoolClient, PoolClient["query"]>();
  const create = () => {
    const client = { query: async (text: string) => { if (text === "FAIL") throw new Error("Synthetic query failure"); return { rows: [] }; }, release: () => {} } as unknown as PoolClient;
    clients.push(client); originals.set(client, client.query); return client;
  };
  const pool = { connect(callback?: (error: null, client: PoolClient) => void) {
    const client = create(); if (callback) { callback(null, client); return; } return Promise.resolve(client);
  }, async query(this: Pool, text: string) {
    return new Promise((resolve, reject) => this.connect((error, client) => {
      if (error || !client) { reject(error ?? new Error("Synthetic missing client")); return; }
      client.query(text).then(resolve, reject).finally(() => client.release());
    }));
  } } as unknown as Pool;
  return { pool, clients, originals };
}
describe("opt-in representative query accounting", () => {
  it("separates overlapping async operations and counts pool callback queries once", async () => {
    const { pool } = fakePool(), originalQuery = pool.query, originalConnect = pool.connect;
    const counter = installPoolQueryCounter(pool);
    const [a,b] = await Promise.all([
      counter.observe(async () => { await pool.query("ONE"); const client = await pool.connect();
        try { await client.query("BEGIN"); await client.query("ONE"); await client.query("COMMIT"); } finally { client.release(); } }),
      counter.observe(async () => { await pool.query("ONE"); await pool.query("TWO"); }),
    ]);
    expect(a).toMatchObject({ ok: true, queries: 4 }); expect(b).toMatchObject({ ok: true, queries: 2 });
    counter.restore(); expect(pool.query).toBe(originalQuery); expect(pool.connect).toBe(originalConnect);
  });
  it("retains failed query counts and restores released connection methods", async () => {
    const { pool, originals } = fakePool(), counter = installPoolQueryCounter(pool);
    let restored = false;
    const result = await counter.observe(async () => {
      const client = await pool.connect();
      try { await client.query("FAIL"); } finally { client.release(); restored = client.query === originals.get(client); }
    });
    expect(result).toMatchObject({ ok: false, queries: 1 }); expect(restored).toBe(true); counter.restore();
  });
  it("refuses observer removal while a transaction connection remains acquired", async () => {
    const { pool } = fakePool(), counter = installPoolQueryCounter(pool), client = await pool.connect();
    expect(() => counter.restore()).toThrow("acquired clients"); client.release(); counter.restore();
  });
});
