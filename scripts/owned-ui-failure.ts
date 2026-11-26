// Emit fixed categories only. Nested exceptions can contain credentials, paths,
// customer data or provider output; do not serialize exception prose or stacks.
const messages = new Map([
  ['Owned evaluation and cleanup failed', 'case_and_cleanup_failed'],
  ['Owned evaluation cleanup unverified; target retained', 'cleanup_unverified'],
  ['Disposable Eve retirement or custody unverified', 'eve_retirement_or_custody'],
  ['Owned evaluation runtime retirement unverified', 'runtime_retirement_unverified'],
  ['Owned evaluation process retirement unverified', 'detached_process_retirement_unverified'],
  ['Owned process group retirement unverified', 'process_group_retirement_unverified'],
  ['Owned process inventory unavailable', 'process_inventory_unavailable'],
  ['Disposable Eve ownership invalid', 'eve_ownership_invalid'],
  ['Disposable Eve ownership unreadable', 'eve_ownership_unreadable'],
  ['Disposable Eve cleanup failed; custody retained', 'eve_cleanup_failed'],
  ['Disposable database ownership changed; cleanup refused', 'database_ownership_changed'],
  ['Disposable app failed readiness', 'app_readiness_failed'],
  ['An isolated test database and test environment marker are required', 'marked_test_source_required'],
]);
const codes = new Set(['ENOTFOUND', 'EAI_AGAIN', 'EPERM', 'EACCES', 'ENOENT', 'EAGAIN', 'ECONNREFUSED', 'ETIMEDOUT']);
const custodyStages = new Set(['capture-before-stop', 'stop-processes', 'next', 'eve', 'maintenance', 'proxy', 'detached-processes', 'capture-after-stop', 'prior-capture']);

export function ownedUiFailureCategories(error: unknown): string[] {
  const categories = new Set<string>();
  const seen = new Set<Error>();
  function visit(value: unknown, depth: number) {
    if (depth > 6 || seen.size >= 24 || !(value instanceof Error) || seen.has(value)) return;
    seen.add(value);
    const category = messages.get(value.message);
    const code = (value as NodeJS.ErrnoException).code;
    if (category) categories.add(category);
    const custody = /^Disposable Eve retirement or custody unverified \(([a-z, -]{1,200})\)$/.exec(value.message);
    const stages = custody?.[1].split(', ');
    if (stages && stages.length <= custodyStages.size && stages.every(stage => custodyStages.has(stage))) {
      categories.add('eve_retirement_or_custody');
      for (const stage of stages) categories.add(`eve:${stage}`);
    }
    if (typeof code === 'string' && codes.has(code)) categories.add(code);
    if (value instanceof AggregateError) for (const child of value.errors.slice(0, 8)) visit(child, depth + 1);
    visit(value.cause, depth + 1);
  }
  visit(error, 0);
  return categories.size ? [...categories] : ['gate_failed'];
}
