type Step = () => void | Promise<void>;

/** Restore process-local state even when resource retirement cannot be proven. */
export async function finishPilotEnvironment(input: {
 retire: Step[]; closePools: Step; proveUnused: Step; saveLogs: Step[];
 restoreParent: Step; removeOwned: Step; verifyProtected: Step;
 runFailure?: {error: unknown};
}) {
 const failures: unknown[] = [];
 const attempt = async (step: Step) => {try {await step();} catch (error) {failures.push(error);}};
 const reject = () => {
  if (!failures.length) return;
  const errors = [...(input.runFailure ? [input.runFailure.error] : []), ...failures];
  if (errors.length === 1) throw errors[0];
  throw new AggregateError(errors, 'Owned pilot cleanup failed');
 };
 try {
  for (const step of input.retire) await attempt(step);
  await attempt(input.closePools);
  if (!failures.length) await attempt(input.proveUnused);
  for (const step of input.saveLogs) await attempt(step);
 } finally {
  await attempt(input.restoreParent);
 }
 // Missing retirement/absence/restoration proof must retain owned resources.
 if (failures.length) {await attempt(input.verifyProtected);reject();}
 await attempt(input.removeOwned);
 await attempt(input.verifyProtected);
 reject();
}
