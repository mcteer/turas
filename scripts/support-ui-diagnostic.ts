/** Public diagnostics contain only fixed categories, never child messages,
 * stacks, origins, credentials or synthetic/private fixture content. */
export function supportUiGlobalDiagnostic(raw: unknown) {
  const errors = raw && typeof raw === "object" && "errors" in raw && Array.isArray(raw.errors) ? raw.errors : [];
  const categories = new Set<string>();
  for (const error of errors.slice(0, 50)) {
    const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
    categories.add(/already used|already running|reuseExistingServer/i.test(message) ? "owned_server_conflict"
      : /Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND/.test(message) ? "module_unavailable"
      : /browserType\.launch|Executable doesn't exist|Host system is missing dependencies/.test(message) ? "browser_unavailable"
      : /timed out|timeout/i.test(message) ? "runner_timeout"
      : /SyntaxError|Unexpected token|Cannot use import statement/.test(message) ? "transform_failure"
      : "runner_global_error");
  }
  return { globalErrors: errors.length, categories: [...categories].sort() };
}

/** Diagnose case failures without returning model, fixture or browser prose. */
export function supportUiCaseDiagnostic(raw: unknown) {
  const statuses = new Set<string>(), categories = new Set<string>(), locations = new Set<string>();
  let failedResults = 0, visited = 0;
  function walk(value: unknown, depth = 0): void {
    if (++visited > 10000 || depth > 20 || !value || typeof value !== "object") return;
    const node = value as Record<string, unknown>;
    if (Array.isArray(node.results)) for (const result of node.results.slice(0, 100)) {
      if (!result || typeof result !== "object") continue;
      const row = result as Record<string, unknown>;
      if (row.status === "passed") continue;
      failedResults++;
      statuses.add(["failed", "timedOut", "interrupted", "skipped"].includes(String(row.status)) ? String(row.status) : "unknown");
      const errors = Array.isArray(row.errors) ? row.errors : row.error ? [row.error] : [];
      for (const error of errors.slice(0, 50)) {
        const message = error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message : "";
        const stack = error && typeof error === "object" && "stack" in error && typeof error.stack === "string" ? error.stack.slice(0, 20000) : "";
        const location = error && typeof error === "object" && "location" in error && error.location && typeof error.location === "object"
          ? error.location as Record<string, unknown> : null;
        const file = typeof location?.file === "string" ? location.file.match(/(?:^|\/)tests\/ui\/(support-(?:readiness|advice)\.spec\.ts)$/)?.[1] : null;
        if (file && Number.isSafeInteger(location?.line) && Number(location?.line) > 0 && Number(location?.line) < 1000000 &&
          Number.isSafeInteger(location?.column) && Number(location?.column) > 0 && Number(location?.column) < 1000000)
          locations.add(`tests/ui/${file}:${location!.line}:${location!.column}`);
        for (const match of `${stack}\n${message.slice(0, 20000)}`.matchAll(/tests\/ui\/(support-(?:readiness|advice)\.spec\.ts):(\d{1,6}):(\d{1,6})/g))
          locations.add(`tests/ui/${match[1]}:${match[2]}:${match[3]}`);
        categories.add(/browserType\.launch|Executable doesn't exist|Host system is missing dependencies/.test(message) ? "browser_unavailable"
          : /Test timeout|timed out|TimeoutError/i.test(message) ? "case_timeout"
          : /toBeVisible|toHaveCount|locator\./.test(message) ? "locator_assertion"
          : /expect\(|AssertionError/.test(message) ? "assertion_failure"
          : /ECONNREFUSED|ERR_CONNECTION|net::|page\.goto/.test(message) ? "navigation_failure"
          : "case_error");
      }
    }
    for (const key of ["suites", "specs", "tests"]) if (Array.isArray(node[key]))
      for (const child of node[key].slice(0, 1000)) walk(child, depth + 1);
  }
  walk(raw);
  return { failedResults, statuses: [...statuses].sort(), categories: [...categories].sort(), locations: [...locations].sort() };
}
