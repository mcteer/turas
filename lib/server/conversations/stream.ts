export function guardNativeStream(
  native: Response,
  authority: () => Promise<boolean>,
  intervalMs = 10_000,
  timeoutMs = 5_000,
): Response {
  if (!native.body) return native;
  const reader = native.body.getReader();
  let timer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let lastAuthorizedAt = 0;
  let checkInFlight: Promise<boolean> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stop = async () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    try { await reader.cancel(); } catch { /* upstream already closed */ }
    try { controller.close(); } catch { /* downstream already closed */ }
  };

  const check = (): Promise<boolean> => {
    if (closed) return Promise.resolve(false);
    if (checkInFlight) return checkInFlight;
    checkInFlight = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const accepted = await Promise.race([
          authority(),
          new Promise<boolean>((resolve) => {
            timeout = setTimeout(() => resolve(false), timeoutMs);
          }),
        ]);
        if (accepted) lastAuthorizedAt = Date.now();
        else await stop();
        return accepted;
      } catch {
        await stop();
        return false;
      } finally {
        if (timeout) clearTimeout(timeout);
        checkInFlight = undefined;
      }
    })();
    return checkInFlight;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(output) {
      controller = output;
      timer = setInterval(() => { void check(); }, intervalMs);
      void (async () => {
        if (!await check()) return;
        try {
          while (!closed) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (checkInFlight || Date.now() - lastAuthorizedAt >= intervalMs) {
              if (!await check()) break;
            }
            if (!closed) output.enqueue(chunk.value);
          }
        } catch { /* a broken native stream closes downstream */ }
        await stop();
      })();
    },
    async cancel() { await stop(); },
  });
  return new Response(stream, { status: native.status, statusText: native.statusText,
    headers: native.headers });
}
