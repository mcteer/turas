const randomUUID = () => globalThis.crypto.randomUUID();

export type ErrorStatus = 400 | 401 | 403 | 404 | 409 | 410 | 413 | 415 | 422 | 429 | 503;

export class HttpFailure extends Error {
  constructor(
    readonly status: ErrorStatus,
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "HttpFailure";
  }
}

export function hiddenRecord(): HttpFailure {
  return new HttpFailure(404, "not_found", "Resource not found");
}

export function success<T>(data: T, status = 200, correlationId: string = randomUUID()): Response {
  return Response.json({ data, correlationId }, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}

export function failure(error: unknown, correlationId: string = randomUUID()): Response {
  const known = error instanceof HttpFailure;
  const status = known ? error.status : 503;
  const code = known ? error.code : "unavailable";
  const message = known ? error.message : "Service unavailable";
  const headers = new Headers({ "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
  if (known && error.retryAfterSeconds !== undefined) {
    headers.set("Retry-After", String(Math.max(1, Math.ceil(error.retryAfterSeconds))));
  }
  return Response.json({ error: { code, message }, correlationId }, { status, headers });
}
