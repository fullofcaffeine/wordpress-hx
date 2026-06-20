# wordpress-hx

Experimental WordPress 7.0 and Gutenberg migration program using Haxe, Codex, and Beads.

The product and architecture authority is [docs/prd/wordpress-haxe-port.md](docs/prd/wordpress-haxe-port.md). Beads is the execution ledger; run `bd prime` before taking work.

## Current Stage

This repository is the program control plane. Upstream WordPress, Gutenberg, genes-ts, and Haxe reference repositories live outside this repo and will be locked through manifests before broad translation begins.

Important sibling checkouts are recorded in [docs/operations/repositories.md](docs/operations/repositories.md) and `upstream.lock.json`. The current vanilla WordPress oracle is `../wordpress-develop`.

Initial work follows the PRD sequence:

1. Bootstrap repository structure and Beads/Codex integration.
2. Lock source and toolchain baselines.
3. Generate inventories and oracle environments.
4. Run feasibility gates before any broad source translation.
