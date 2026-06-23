# WordPressHX

WordPressHX is an experimental program to port WordPress 7.0 to Haxe while preserving the PHP-facing WordPress ecosystem contract.

The goal is not a typed wrapper around WordPress. The goal is Haxe-authored runtime logic, typed compatibility contracts, and generated target artifacts that remain usable by existing WordPress plugins, themes, drop-ins, tooling, reflection, and operational workflows.

[![PHP Conformance](https://github.com/fullofcaffeine/wordpress-hx/actions/workflows/php-conformance.yml/badge.svg?branch=main)](https://github.com/fullofcaffeine/wordpress-hx/actions/workflows/php-conformance.yml)

## Why This Exists

WordPress is enormous, dynamic, and deeply PHP-shaped. A credible port has to prove behavior before claiming ownership. This repository is the control plane for that work:

- lock upstream WordPress and Gutenberg baselines;
- inventory PHP, JavaScript, assets, packages, tests, and generated artifacts;
- extract PHP ABI surfaces;
- build typed Haxe semantic and adapter-contract candidates;
- generate compatibility artifacts;
- run differential, ABI, fixture, installed-distribution, and upstream-suite gates;
- track every claim with receipts.

The long-term direction is PHP-hosted, Haxe-authored WordPress for compatibility, with optional future native providers only for narrow pure internal kernels. Unmodified PHP plugin/theme compatibility remains the current priority.

An eventual research goal is a browser/WASM-hosted WordPressHX profile that could complement or, if the evidence becomes strong enough, replace parts of today's WordPress Playground model. `wasmix` is the current reference candidate for this line of investigation because it compiles a subset of Haxe to WebAssembly while preserving Haxe-side authoring and JS interop. This is not part of the current parity milestone: first we need PHP-hosted compatibility, generated adapter evidence, and clear boundaries for what can safely run outside PHP.

The broader long-term goal is multi-target WordPressHX: Haxe-authored first-party WordPress semantics should be reusable across any runtime that Haxe supports or that we can make Haxe support. PHP remains the privileged adapter for the existing ecosystem, but it does not have to be the only execution profile forever. In theory, the same Haxe-owned core could produce a PHP-hosted distribution, browser/WASM profile, Go service through `reflaxe.go`, Rust provider through `reflaxe.rust`, native service, CLI tooling, static/export profile, or another target-specific runtime, while still offering PHP plugin/theme compatibility through a generated PHP adapter, an embedded PHP engine, or a deliberately narrower compatibility profile.

## Project Principles

- **Behavioral parity wins.** Upstream WordPress and Gutenberg are the behavior oracles.
- **Haxe owns migrated behavior.** Generated PHP, JavaScript, source maps, manifests, and distributions are artifacts.
- **No broad wrapper-only endpoint.** Typed wrappers are scaffolding for ABI preservation and migration, not the final product.
- **Generated PHP is a compatibility surface.** Public PHP must remain idiomatic enough for plugins, themes, reflection, stack traces, and tooling.
- **Escape hatches are exceptional.** `Dynamic`, `untyped`, raw `php.Syntax.code`, raw JavaScript, and broad casts require narrow boundaries and evidence.
- **Evidence is explicit.** Receipts distinguish generated-code shape, static ABI, runtime ABI, targeted semantic parity, live integration parity, and packaged distribution evidence.

The product and architecture authority is [docs/prd/wordpress-haxe-port.md](docs/prd/wordpress-haxe-port.md).

## Current Status

This is an active feasibility and vertical-slice porting program, not a usable WordPress replacement yet.

Current highlights:

- upstream WordPress 7.0 and Gutenberg baselines are locked;
- PHP target feasibility gates are in place;
- PHP ABI extraction, boundary types, macro validation, original-path linker work, and escape-hatch audits exist;
- bootstrap, hooks, formatting/errors/KSES, options/cache, wpdb, REST, multisite, users/auth, and posts/query surfaces have receipt-backed slices;
- receipt validation, pre-commit hooks, and secret scanning are operational.

Progress is tracked in [docs/operations/progress-matrix.md](docs/operations/progress-matrix.md). Treat the matrix as a confidence ledger, not a marketing completion percentage.

## Repository Layout

- `src/` - Haxe source for migrated semantic models, adapter contracts, and target boundary helpers.
- `fixtures/` - focused Haxe/PHP/browser fixtures used to prove behavior or generated shape.
- `tools/` - deterministic inventory, ABI, linker, runner, receipt, dashboard, and validation tooling.
- `manifests/` - generated or curated machine-readable evidence.
- `receipts/` - verification receipts for completed claims.
- `docs/` - PRD, ADRs, operations docs, test strategy, ownership policy, and progress matrix.

Important sibling checkouts are documented in [docs/operations/repositories.md](docs/operations/repositories.md). By default they are not vendored or submoduled into this repository.

## Gutenberg Plan

Gutenberg work is intentionally staged. This repo remains the program authority while browser feasibility is proven through `WPHX-400`. A future sibling `../gutenberghx` repo may own Gutenberg package implementation only after package/export/React/TSX/source-map gates justify parallelization and an ADR confirms the workflow.

See [docs/operations/dependent-libraries.md](docs/operations/dependent-libraries.md) and [docs/operations/hhx-template-policy.md](docs/operations/hhx-template-policy.md).

## Future Multi-Target Profiles

WordPressHX should eventually evaluate whether a Haxe-authored runtime can target WebAssembly and other Haxe-supported or custom Haxe targets for non-traditional WordPress use cases. The concrete WASM research question is whether a profile, potentially based on [`back2dos/wasmix`](https://github.com/back2dos/wasmix), can preserve enough WordPress behavior to support Playground-like workflows with less dependence on a full PHP-in-WASM runtime.

The same architectural idea applies to Go, Rust, or other targets. A Go profile could use [`fullofcaffeine/reflaxe.go`](https://github.com/fullofcaffeine/reflaxe.go) for service, CLI, worker, or static-export execution. A Rust profile could use [`fullofcaffeine/reflaxe.rust`](https://github.com/fullofcaffeine/reflaxe.rust) for selected native providers or later runtime experiments. These would be additional evidence-backed profiles, not replacements for the PHP compatibility adapter.

The target model is parallel, not replacement-only:

- PHP-hosted WordPressHX remains the compatibility baseline for unmodified plugins and themes.
- Alternate targets may run first-party WordPress semantics when their boundaries are proven.
- A target can still support third-party PHP plugins/themes if it keeps a real PHP compatibility host available, for example through generated PHP adapters or an embedded PHP engine.
- A target without PHP plugin support can still be valuable, but it must be named honestly as a narrower profile such as browser-only editing, static rendering, selected admin flows, CLI analysis, or content transformation.

This track is deliberately later-stage. It must not bypass PHP parity, plugin/theme compatibility evidence, or the native-provider eligibility rules in [ADR-004](docs/adr/ADR-004-haxe-semantic-authority-and-native-provider-policy.md). Any future claim has to name its compatibility profile explicitly, for example browser-only content editing, static rendering, selected admin flows, or full PHP-plugin-compatible execution with an embedded PHP engine.

## Local Setup

Prerequisites are pinned or described in [toolchain.lock.json](toolchain.lock.json). Commonly used tools include Node/npm, Haxe, PHP, Composer-era PHP tooling where needed, Docker for live database gates, and `gitleaks`.

Install dependencies and hooks:

```bash
npm install
npm run hooks:install
```

The hook installer configures:

- staged `gitleaks` scan;
- staged Haxe formatting with `haxelib run formatter`;
- pre-push Haxe format checks;
- pre-push full-history and working-tree `gitleaks`.

## Common Commands

```bash
npm run format:haxe:check
npm run haxe:escape-hatches:check
npm run baseline:validate
npm run receipts:validate
npm run security:gitleaks
npm run precommit
```

PHP conformance checks are grouped under `.github/workflows/php-conformance.yml` and mirrored by package scripts for local development.

## Public Safety

This repository is intended to be public, but it still enforces leak prevention:

- full-history and working-tree secret scans via `npm run security:gitleaks`;
- staged secret scan in pre-commit;
- full secret scan in pre-push;
- no vendored upstream WordPress/Gutenberg checkouts;
- generated artifacts tracked through manifests and receipts rather than ad hoc local files.

If a scanner flags anything, treat the repository as not publishable until the finding is resolved and history is assessed.

## Contribution Notes

Read [AGENTS.md](AGENTS.md) before making changes. The short version:

- keep changes scoped to the issue;
- update manifests, receipts, docs, and the progress matrix when claims change;
- do not hand-edit generated target files;
- do not add broad target escape hatches;
- do not start broad WordPress or Gutenberg translation before the relevant feasibility gates pass.

This project values narrow, well-evidenced progress over large unverified rewrites.
