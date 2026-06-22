# wordpress-hx

Experimental WordPress 7.0 and Gutenberg migration program using Haxe, Codex, and Beads.

The product and architecture authority is [docs/prd/wordpress-haxe-port.md](docs/prd/wordpress-haxe-port.md). Beads is the execution ledger; run `bd prime` before taking work.

## Current Stage

This repository is the program control plane. Upstream WordPress, Gutenberg, genes-ts, and Haxe reference repositories live outside this repo and will be locked through manifests before broad translation begins.

This is a complete porting program, not just a typed wrapper layer over WordPress. The typed compatibility layer is an early scaffold for ABI preservation, inventories, shells, and tests; the destination is Haxe-authored runtime logic with generated target artifacts. See [docs/operations/port-philosophy.md](docs/operations/port-philosophy.md).

Important sibling checkouts are recorded in [docs/operations/repositories.md](docs/operations/repositories.md) and `upstream.lock.json`. The current vanilla WordPress oracle is `../wordpress-develop`.

Dependent-library split policy, including the future `gutenberghx` repo trigger, is recorded in [docs/operations/dependent-libraries.md](docs/operations/dependent-libraries.md).
Program progress, including the current super-progress estimate and Gutenberg plan, is recorded in [docs/operations/progress-matrix.md](docs/operations/progress-matrix.md).
HHX/template authoring policy is recorded in [docs/operations/hhx-template-policy.md](docs/operations/hhx-template-policy.md).
Beads operating rules and the pinned bootstrap tool versions are recorded in [docs/operations/beads.md](docs/operations/beads.md) and [toolchain.lock.json](toolchain.lock.json).
Agent instruction hierarchy and precedent adaptation notes are recorded in [docs/operations/agent-instructions.md](docs/operations/agent-instructions.md).
Ownership state rules for wrappers, scaffolds, Haxe-owned units, and smell fixes are recorded in [docs/operations/ownership-state-model.md](docs/operations/ownership-state-model.md).

Initial work follows the PRD sequence:

1. Bootstrap repository structure and Beads/Codex integration.
2. Lock source and toolchain baselines.
3. Generate inventories and oracle environments.
4. Run feasibility gates before any broad source translation.

## Local Hooks

Install repository hooks after cloning:

```bash
npm run hooks:install
```

The pre-commit hook scans staged changes with gitleaks and formats staged Haxe files with `haxelib run formatter`.
The pre-push hook runs full-history/current-tree gitleaks plus a tracked Haxe formatting check.
