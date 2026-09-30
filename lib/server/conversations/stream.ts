export function guardNativeStream(
  native: Response,
  authority: () => Promise<boolean>,
  intervalMs = 10_000,
  timeoutMs = 5_000,
  release?: (chunk: Uint8Array, enqueue: () => void) => Promise<void>,
): Response {
  if (!native.body) return native;
  const reader = native.body.getReader();
  let timer: ReturnType<typeof setInterval> | undefined;
  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let closed = false;
  let lastAuthorizedAt = 0;
  let checkInFlight: Promise<boolean> | undefined;
  let releaseInFlight = false;
  let pendingChunks: Uint8Array[] = [];
  let pendingBytes = 0;
  let flushInFlight: Promise<void> | undefined;
  let controller: ReadableStreamDefaultController<Uint8Array>;

  const stop = async () => {
    if (closed) return;
    closed = true;
    if (timer) clearInterval(timer);
    if (flushTimer) clearInterval(flushTimer);
    pendingChunks = [];
    pendingBytes = 0;
    try { await reader.cancel(); } catch { /* upstream already closed */ }
    try { controller.close(); } catch { /* downstream already closed */ }
  };

  const flush = (): Promise<void> => {
    if (!release || closed || !pendingBytes) return flushInFlight ?? Promise.resolve();
    if (flushInFlight) return flushInFlight;
    const chunks = pendingChunks;
    const byteCount = pendingBytes;
    pendingChunks = [];
    pendingBytes = 0;
    const joined = new Uint8Array(byteCount);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    releaseInFlight = true;
    flushInFlight = (async () => {
      try {
        await release(joined, () => { if (!closed) controller.enqueue(joined); });
        lastAuthorizedAt = Date.now();
      } finally {
        releaseInFlight = false;
        flushInFlight = undefined;
      }
    })();
    return flushInFlight;
  };

  const check = (): Promise<boolean> => {
    if (closed) return Promise.resolve(false);
    if (checkInFlight) return checkInFlight;
    checkInFlight = (async () => {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      let timedOut=false;
      try {
        const accepted = await Promise.race([
          authority(),
          new Promise<boolean>((resolve) => {
            timeout = setTimeout(() => {timedOut=true;resolve(false);}, timeoutMs);
          }),
        ]);
        if (accepted) lastAuthorizedAt = Date.now();
        else {
          console.info(JSON.stringify({kind:"turas_native_stream_denied",
            reason:timedOut ? "timeout":"authority"}));
          await stop();
        }
        return accepted;
      } catch (error) {
        const code=typeof error==="object" && error!==null && "code" in error &&
          typeof error.code==="string" && /^[A-Za-z0-9_]{1,80}$/.test(error.code) ?
          error.code:"unknown";
        console.info(JSON.stringify({kind:"turas_native_stream_denied",
          reason:"error",code}));
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
      timer = setInterval(() => {
        if (!releaseInFlight && !pendingBytes &&
            Date.now() - lastAuthorizedAt >= intervalMs) void check();
      }, intervalMs);
      if (release) flushTimer = setInterval(() => { void flush().catch(() => stop()); }, 50);
      void (async () => {
        if (!await check()) return;
        try {
          while (!closed) {
            const chunk = await reader.read();
            if (chunk.done) break;
            if (!release && (checkInFlight || Date.now() - lastAuthorizedAt >= intervalMs)) {
              if (!await check()) break;
            }
            if (!closed) {
              if (release) {
                pendingChunks.push(chunk.value);
                pendingBytes += chunk.value.byteLength;
                if (pendingBytes >= 64 * 1024) await flush();
              } else output.enqueue(chunk.value);
            }
          }
          if (release && !closed) {
            if (flushInFlight) await flushInFlight;
            await flush();
          }
        } catch (error) {
          const code = typeof error === "object" && error !== null &&
            "code" in error && typeof error.code === "string" &&
            /^[A-Za-z0-9_]{1,80}$/.test(error.code) ? error.code : "stream_closed";
          console.info(JSON.stringify({ kind: "turas_native_stream_closed", code,
            name:error instanceof Error ? error.name:"unknown" }));
        }
        await stop();
      })();
    },
    async cancel() { await stop(); },
  });
  return new Response(stream, { status: native.status, statusText: native.statusText,
    headers: native.headers });
}
