export function sessionFailureDiagnostic(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const sqlState = typeof code === "string" && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  const reason = /quota|compute.*limit|storage.*limit|usage.*limit/.test(message) ? "service_limit"
    : /suspend|disabled|inactive endpoint/.test(message) ? "service_unavailable"
    : /password authentication|authentication failed/.test(message) ? "database_authentication"
    : /fetch failed|network|timed? ?out|connection refused/.test(message) ? "database_network"
    : /database_url|turas_session_secret|connection string|invalid url/.test(message) ? "configuration"
    : sqlState ? "database_error" : "unclassified";
  // Only controlled categories and SQLSTATE are safe to emit. Error messages,
  // causes and stacks can include connection strings or credential values.
  return { reason, ...(sqlState ? { sqlState } : {}) };
}
