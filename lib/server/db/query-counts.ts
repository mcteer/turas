import { AsyncLocalStorage } from "node:async_hooks";
import type { Pool, PoolClient } from "pg";

/** Opt-in, process-local benchmark instrumentation. It counts query invocations,
 * never their text/parameters/results, and adds no hooks to ordinary app pools. */
export function installPoolQueryCounter(pool: Pool) {
  const contexts = new AsyncLocalStorage<{ count: number }>();
  const originalQuery = pool.query, originalConnect = pool.connect;
  const active = new Set<PoolClient>();
  const increment = () => { const counter = contexts.getStore(); if (counter) counter.count++; };
  pool.query = ((...args: unknown[]) => { increment(); return Reflect.apply(originalQuery, pool, args); }) as typeof pool.query;
  pool.connect = ((...args: unknown[]) => {
    // Pool.query uses callback connect internally. The pool query was already
    // counted; intercepting that client's query would charge it twice.
    if (typeof args[0] === "function") return Reflect.apply(originalConnect, pool, args);
    return (Reflect.apply(originalConnect, pool, args) as Promise<PoolClient>).then(client => {
      if (active.has(client)) throw new Error("A benchmark connection was acquired twice");
      active.add(client);
      const query = client.query, release = client.release;
      client.query = ((...values: unknown[]) => { increment(); return Reflect.apply(query, client, values); }) as typeof client.query;
      client.release = ((...values: unknown[]) => {
        client.query = query; client.release = release; active.delete(client);
        return Reflect.apply(release, client, values);
      }) as typeof client.release;
      return client;
    });
  }) as typeof pool.connect;
  return {
    async observe<T>(run: () => Promise<T>) {
      const counter = { count: 0 };
      return contexts.run(counter, async () => {
        try { return { ok: true as const, value: await run(), queries: counter.count }; }
        catch (error) { return { ok: false as const, error, queries: counter.count }; }
      });
    },
    restore() {
      if (active.size) throw new Error("Benchmark query observer still has acquired clients");
      pool.query = originalQuery; pool.connect = originalConnect;
    },
  };
}
