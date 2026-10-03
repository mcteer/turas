import { isAbsolute, resolve } from "node:path";
import { z } from "zod";

const resultSchema = z.object({ status: z.string(), retry: z.number().int().nonnegative(),
  errors: z.array(z.unknown()), error: z.unknown().optional() });
const testSchema = z.object({ projectName: z.string().min(1), projectId: z.string().min(1),
  expectedStatus: z.literal("passed"), status: z.string(), results: z.array(resultSchema) });
const specSchema = z.object({ id: z.string().min(1), file: z.string().min(1), line: z.number().int().positive(), ok: z.boolean(), tests: z.array(testSchema).min(1) });
type Suite = { specs?: z.infer<typeof specSchema>[]; suites?: Suite[] };
const suiteSchema: z.ZodType<Suite> = z.lazy(() => z.object({ specs: z.array(specSchema).optional(), suites: z.array(suiteSchema).optional() }));
const count = z.number().int().nonnegative().max(10_000);
const reportSchema = z.object({ config: z.object({ rootDir: z.string().refine(isAbsolute) }), suites: z.array(suiteSchema), errors: z.array(z.unknown()).length(0),
  stats: z.object({ expected: count, skipped: count, unexpected: count, flaky: count }) });
export type ExecutionUiCase = { file: string; id: string; project: string; line: number };
const key = (item: ExecutionUiCase) => JSON.stringify([item.file, item.id, item.project]);

function readCases(raw: unknown) {
  const report = reportSchema.parse(raw);
  const cases: { identity: ExecutionUiCase; spec: z.infer<typeof specSchema>; test: z.infer<typeof testSchema> }[] = [];
  function visit(suites: Suite[]) {
    for (const suite of suites) {
      for (const spec of suite.specs ?? []) for (const test of spec.tests) cases.push({
        identity: { file: isAbsolute(spec.file) ? resolve(spec.file) : resolve(report.config.rootDir, spec.file), id: spec.id, line: spec.line, project: test.projectName }, spec, test });
      visit(suite.suites ?? []);
    }
  }
  visit(report.suites);
  if (!cases.length || cases.length > 1000 || new Set(cases.map(item => key(item.identity))).size !== cases.length)
    throw new Error("Missing or duplicate execution UI cases");
  return { report, cases };
}

/** --list is discovery only. A pending discovery result never proves execution. */
export function executionUiDiscovery(raw: unknown, files: readonly string[], project: string): ExecutionUiCase[] {
  const { report, cases } = readCases(raw), expected = new Set(files.map(file => resolve(file)));
  const found = new Set(cases.map(item => item.identity.file));
  if (expected.size !== files.length || found.size !== expected.size || [...found].some(file => !expected.has(file)) ||
      cases.some(item => item.identity.project !== project || item.test.projectId !== project || item.test.results.length !== 0) ||
      report.stats.expected !== 0 || report.stats.unexpected !== 0 || report.stats.flaky !== 0 || report.stats.skipped !== cases.length)
    throw new Error("Execution UI discovery requires every selected file and exact project");
  return cases.map(item => item.identity);
}

export function verifyExecutionUiReport(raw: unknown, expected: readonly ExecutionUiCase[]) {
  const { report, cases } = readCases(raw), selected = new Set(expected.map(key));
  if (!selected.size || selected.size !== expected.length || cases.length !== expected.length || cases.some(item => !selected.has(key(item.identity))) ||
      report.stats.expected !== cases.length || report.stats.unexpected !== 0 || report.stats.skipped !== 0 || report.stats.flaky !== 0 ||
      cases.some(({ spec, test }) => !spec.ok || test.projectId !== test.projectName || test.status !== "expected" || test.results.length !== 1 ||
        test.results[0].status !== "passed" || test.results[0].retry !== 0 || test.results[0].errors.length !== 0 || test.results[0].error != null))
    throw new Error("Execution UI requires every discovered case to pass once without skips or retries");
  return { expected: cases.length, unexpected: 0, skipped: 0, flaky: 0 };
}
