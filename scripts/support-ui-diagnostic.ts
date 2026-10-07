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
