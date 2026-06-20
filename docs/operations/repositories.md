# Repository Map

This project uses sibling checkouts as upstream or compiler references. Keep this map synchronized with `upstream.lock.json` and the PRD.

## Program Repository

- `./` - `wordpress-hx`, the control plane and future Haxe implementation repository.
- Authority: PRD, Beads, manifests, receipts, Haxe source, generated distro tooling.
- Do not initialize independent Beads databases inside sibling upstream or compiler checkouts for this program.

## Source Oracles

- `../wordpress-develop` - vanilla WordPress checkout.
  - Current observed ref: `26b6802493`, tag `7.0.0`.
  - Role: WordPress 7.0 distribution and PHP/browser behavior oracle.
  - Local note: detached HEAD with repomix artifacts untracked.
- `../gutenberg` - Gutenberg checkout.
  - Current observed ref: `98a796c8780`, tag `v23.4.0`.
  - Role: forward Gutenberg package baseline, separate from the WordPress 7.0 pinned Gutenberg build.
  - Local note: detached HEAD with repomix artifacts untracked.

## Compiler and Tooling References

- `../genes` - active genes-ts checkout.
  - Current observed ref: `8acd106`, branch `main`.
  - Role: Haxe-to-TypeScript/TSX/JavaScript compiler work.
  - Rule: fixes must be generic genes-ts improvements, never WordPress-specific hacks.
- `../haxe.compilerdev.reference/haxe` - Haxe compiler source reference.
  - Current observed ref: `e0b355c6b`, tag `4.3.7`, branch reference `origin/4.3_bugfix`.
  - Role: Haxe 4.3.7 compiler and PHP generator reference.
  - Local note: nested repo inside `../haxe.compilerdev.reference`, with generated/test artifacts untracked.

## Precedent Repositories

- `../opencodehx` - Haxe/genes-ts large-port precedent.
  - Current observed ref: `e2d74c1`, branch `main`.
  - Role: reference for genes-ts pressure loop, generated TypeScript quality, Beads workflow, and target-boundary discipline.
- `../codex-hxrust` - Haxe-to-Rust large-port precedent.
  - Current observed ref: `814ea60`, branch `main`.
  - Role: reference for compiler-backend pressure, sibling compiler workflow, generated-target quality, and landing discipline.
  - Local note: currently dirty; use as reference only unless a task explicitly scopes work there.

## Working Rule

Do not vendor or submodule these repositories during bootstrap. Lock exact refs and checksums, then read them as immutable evidence unless a task explicitly authorizes cross-repo changes.

