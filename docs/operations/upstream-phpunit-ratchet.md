# Upstream PHPUnit Ratchet

WPHX-700.05 starts the upstream WordPress PHPUnit parity lane described by ADR-003.

Run:

```bash
npm run upstream:phpunit-ratchet
npm run upstream:phpunit-ratchet:check
```

To provision and execute the disposable local runtime inputs:

```bash
npm run upstream:phpunit-ratchet:provision
npm run upstream:phpunit-ratchet:provision:check
```

The provisioner creates vanilla and candidate worktrees under `build/upstream-phpunit/wphx-700-09/`, installs Composer dependencies in those disposable roots, starts the locked MySQL runtime, writes local `wp-tests-config.php` files with isolated databases, and runs the ratchet in report-only mode.

The runner compares pinned vanilla WordPress against a packaged candidate distribution for the selected database, options, and cache PHPUnit files in `tests/upstream/phpunit/groups.json`.

Required runtime inputs:

- `../wordpress-develop` at WordPress `7.0.0` commit `26b68024931348d267b70e2a29910e1320d0094f`, or `WPHX_PHPUNIT_VANILLA_ROOT`.
- `vendor/phpunit/phpunit/phpunit` inside both vanilla and candidate roots.
- `wp-tests-config.php` inside both roots, pointing at isolated throwaway databases.
- `WPHX_PHPUNIT_CANDIDATE_ROOT` pointing at the packaged candidate root.

If those inputs are missing, the runner emits a deterministic `blocked` report and does not claim upstream suite parity. When the inputs exist, it classifies each group using ADR-003 semantics:

- vanilla pass / candidate pass: parity for that group;
- vanilla pass / candidate fail: candidate regression unless owned in `tests/upstream/phpunit/known-deltas.json`;
- vanilla fail / candidate fail: environment or upstream baseline failure;
- vanilla fail / candidate pass: possible divergence to investigate.

Known deltas must include an owner and expiry before a vanilla-pass/candidate-fail result can be accepted.
