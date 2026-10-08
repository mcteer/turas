import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { reserveOwnedEvalPort } from "../../scripts/eval-port";

describe("owned application port lease", () => {
  it("excludes ephemeral client ports and keeps preparation ports unavailable until release", async () => {
    const lease = await reserveOwnedEvalPort(), competing = createServer();
    try {
      expect(lease.port).toBeGreaterThanOrEqual(20000);
      expect(lease.port).toBeLessThan(30000);
      await expect(new Promise<void>((resolve, reject) => {
        competing.once("error", reject);
        competing.listen({ port: lease.port, host: "::", exclusive: true }, resolve);
      })).rejects.toMatchObject({ code: "EADDRINUSE" });
    } finally { await lease.release(); }
    const app = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        app.once("error", reject);
        app.listen({ port: lease.port, host: "::", exclusive: true }, resolve);
      });
      await lease.release(); // Idempotent cleanup cannot close the app's listener.
      expect(app.listening).toBe(true);
    } finally { await new Promise<void>(resolve => app.close(() => resolve())); }
  });
});
