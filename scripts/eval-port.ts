import { randomInt } from "node:crypto";
import { createServer } from "node:net";

/** Keep owned app ports below Linux/macOS ephemeral client ranges and leased
 * during clone preparation. The app uses the same IPv6 wildcard listener. */
export async function reserveOwnedEvalPort() {
  for (let attempt = 0; attempt < 32; attempt++) {
    const port = randomInt(20000, 30000), server = createServer();
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen({ port, host: "::", exclusive: true }, resolve);
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EADDRINUSE") continue;
      throw error;
    }
    let released = false;
    return { port, release: async () => {
      if (released) return;
      released = true;
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    } };
  }
  throw new Error("Owned app port reservation unavailable");
}
