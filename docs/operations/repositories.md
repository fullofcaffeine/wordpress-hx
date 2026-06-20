# Repository Map

This project uses sibling checkouts as upstream or compiler references. Keep this map synchronized with `upstream.lock.json` and the PRD.

## Program Repository

- `./` - `wordpress-hx`, the control plane and future Haxe implementation repository.
- Authority: PRD, Beads, manifests, receipts, Haxe source, generated distro tooling.
- Do not initialize independent Beads databases inside sibling upstream or compiler checkouts for this program.

## Source Oracles

- `../wordpress-develop` - vanilla WordPress checkout.
  - Current observed ref: `26b68024931348d267b70e2a29910e1320d0094f`, tree `f3ad96f2357d2309f64a8d42a5808be502639c70`, lightweight tag `7.0.0`.
  - Official distribution: `https://wordpress.org/wordpress-7.0.zip`, MD5 `8460cf21c321ed5ededf0f943027558e`, SHA-256 `b2b6827eb7b2b51f4610893e1a6ad02466e76fe0a307bd40ca2a8ba821c40d0b`.
  - Embedded Gutenberg build pin from `package.json`: commit `a2a354cf35e5b69c3330d6c1cfd42d8dc2efb9fd`, GHCR layer digest `sha256:4670ed1cdc0f2a1b799ce41815b16f37bd60314e22af293fb4981a321c530764`.
  - Test presence: `phpunit.xml.dist`, 1091 PHPUnit test files, 17 E2E files, 34 QUnit files.
  - Manifest: `manifests/upstream/wordpress-7.0-baseline.v1.json`.
  - Embedded Gutenberg manifest: `manifests/upstream/wordpress-7.0-gutenberg-baseline.v1.json`.
  - Role: WordPress 7.0 distribution and PHP/browser behavior oracle.
  - Local note: detached HEAD with repomix artifacts untracked.
- `../gutenberg` - Gutenberg checkout.
  - Current observed ref: `98a796c8780c480ef7bcfe03c42302d9564d785c`, tree `ca453617695fda86c57c4a731475f4ae1c5aad9f`, tag `v23.4.0`.
  - Package evidence: `package.json` and `package-lock.json` both report version `23.4.0`.
  - Manifest: `manifests/upstream/gutenberg-forward-baseline.v1.json`.
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
- `../haxe.compilerdev.reference` - broader Haxe ecosystem reference collection.
  - Role: local source references for tink, coconut, genes, reflaxe, and related libraries.
  - Notable for this project: `tink_hxx` as the base HXX/HHX markup parser/macro reference.
  - Local note: this directory is a collection of nested repositories, not a single Git repository.

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
