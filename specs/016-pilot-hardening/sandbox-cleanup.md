# Disposable Eve sandbox cleanup

Governs FR-022 / T266. Local validation completed on 2026-11-13 using Node
24.21.0 and the installed Eve 0.91.0. Hosted application behavior is unchanged.

Eve development shutdown stops session containers and removes its cleanup intent.
The evaluation harnesses previously retired processes and removed their copied app
without deleting those containers. The shared `ownedEveSandboxes` helper now keeps
a private ownership ledger outside `.eve`, captures generated run IDs before
retirement, and deletes only containers matching both the sandbox and exact run
labels. It verifies absence before allowing final fixture removal. The production
hardening, plan, retrieval, artifact, partner, learning and MCP harnesses use it.

Intermediate stops retain sandbox files for recovery checks. Direct local production
servers get a unique sandbox run tag; Eve development servers replace that tag, so
their actual IDs are captured separately. Failed capture, process retirement,
Docker removal or absence verification fails the check and retains custody.
There is no global prune, image/volume removal, retained development-state change,
framework upgrade, schema migration or hosted release in this fix.

Validation:

- 47 tests passed across `owned-eve-sandboxes`, environment cleanup, owned process,
  staffing evaluation copy, support environment, parent environment, production
  supervisor and artifact output-limit suites. These cover run isolation, restart
  continuity, malformed ownership/inventory, failed retirement and Docker errors.
- `npm run sandbox:cleanup:check` passed against an actual local Eve development
  server and Docker. The intermediate stop retained the test containers; the
  deliberately failed check's finalizer removed owned running/stopped containers
  while preserving the foreign-run and non-sandbox controls. The test then removed
  its own controls. The harness verified the selected configuration, agent model
  and retained workflow contents were unchanged.
- Initial live-check assertions failed because the non-sandbox control inherited
  `eve.sandbox=1` from its template image. Explicitly overriding it to `0` corrected
  the fixture. An existing environment-expression test also needed the new sandbox
  environment binding; its preload-isolation assertions still pass.
- Main, production-hardening, learning, partner and MCP typechecks passed;
  `npm run build:check`, documentation checks and `git diff --check` passed.
- Final Docker inventory: zero Eve sandbox containers and zero owned check
  database containers. The nine pre-existing unrelated containers remained.

The real server check exercises the production-hardening harness and shared helper;
the other harnesses have type and focused regression coverage, not separate full
end-to-end reruns. Abrupt host loss or killing the harness with SIGKILL cannot run
its finalizer; the private custody record remains available for reconciliation.
