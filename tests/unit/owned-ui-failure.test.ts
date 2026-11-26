import { expect, it } from 'vitest';
import { ownedUiFailureCategories } from '../../scripts/owned-ui-failure';

it('identifies both the failed case and unverified cleanup without emitting exception data', () => {
  const sensitive = 'postgres://private-user:secret-value@example.invalid/database';
  const startup = new Error('Disposable app failed readiness', { cause: new Error(sensitive) });
  const custody = new AggregateError([
    new Error('Disposable Eve ownership unreadable'),
    Object.assign(new Error(sensitive), { code: 'EPERM' }),
  ], 'Disposable Eve retirement or custody unverified (capture-after-stop, next)');
  const cleanup = new AggregateError([custody], 'Owned evaluation cleanup unverified; target retained');
  expect(ownedUiFailureCategories(new AggregateError([startup, cleanup], 'Owned evaluation and cleanup failed'))).toEqual([
    'case_and_cleanup_failed', 'app_readiness_failed', 'cleanup_unverified', 'eve_retirement_or_custody', 'eve:capture-after-stop', 'eve:next', 'eve_ownership_unreadable', 'EPERM',
  ]);
});

it('ignores arbitrary error messages and codes and terminates on cycles', () => {
  const error = Object.assign(new AggregateError([], 'Owned process inventory unavailable: private output'), { code: 'private-code' });
  error.errors.push(error, new AggregateError([], 'Disposable Eve retirement or custody unverified (next, private output)'));
  error.cause = error;
  expect(ownedUiFailureCategories(error)).toEqual(['gate_failed']);
});
