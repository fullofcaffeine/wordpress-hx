# Program Progress Matrix

This document is the durable human-readable rollup for progress toward a WordPress distribution whose first-party runtime logic is authored in Haxe and whose generated artifacts remain functional for the WordPress ecosystem.

Beads remains the task database. This matrix is a status ledger over Beads issues, receipts, manifests, and PRD milestones. Update it in the same change whenever milestone status, scope, evidence gates, Gutenberg split policy, or completion estimates change.

Last updated: 2026-06-22
Source checkpoint: `WPHX-317.07 artifacts in this change`
Tracking issue: `WPHX-000.02`

## Super Progress

Current super progress toward "WordPress completely in Haxe and functional": **37%**.

This is an evidence-weighted program estimate, not source-line completion. It gives credit for proven target foundations, ABI/linker infrastructure, vertical WordPress slices, and executable parity gates, but it discounts shell/scaffold work and gives almost no credit for Gutenberg/browser ownership until `WPHX-400` and `WPHX-500` start producing package-level receipts.

| Area | Weight | Current | Contribution | Basis |
| --- | ---: | ---: | ---: | --- |
| Program governance, baselines, manifests, Beads, receipts | 10 | 95 | 9.5 | `WPHX-000`, `WPHX-800`, baseline receipts, locked sibling repo policy |
| PHP target feasibility, ABI, linker, public boundary foundation | 20 | 100 | 20.0 | `WPHX-100` and `WPHX-200` closed |
| WordPress PHP runtime Haxe ownership | 40 | 16 | 6.4 | `WPHX-300` has several verified vertical slices and the first multisite Haxe adapter-contract candidate, but much of Core remains unported |
| Installed WordPress distribution behavior and ecosystem gates | 15 | 5 | 0.8 | `WPHX-700` has strong early gates, but complete installed-system parity is not yet closed |
| Browser, classic JS, Gutenberg package ownership | 10 | 0 | 0.0 | `WPHX-400`, `WPHX-500`, and `WPHX-600` are not yet active implementation tracks |
| Security, performance, reliability, and release closure | 5 | 0 | 0.0 | early security corpus exists, full nonfunctional closure is later-stage work |

The score should move only when evidence moves. A closed task can increase confidence in a slice without implying that the whole source area is ported.

ADR-004 clarifies ownership claims without changing the score: PHP is the privileged compatibility host for current parity, Haxe owns both migrated semantics and adapter intent, and Rust/native providers are future optional internal providers only for narrowly eligible kernels with PHP fallbacks and native-on/native-off evidence. Future ownership rollups should distinguish semantic ownership, adapter-contract ownership, emission strategy, execution provider, and evidence level.

## PRD Milestone Matrix

| External ref | Scope | Beads status | Beads child progress | Haxe/functionality state | Next required movement |
| --- | --- | --- | ---: | --- | --- |
| `WPHX-000` | Program governance and baseline | open | 16/16 baseline children closed, plus ongoing governance follow-ups | Control-plane baseline is usable; governance remains open for program-level decisions like this matrix | Keep PRD, AGENTS, operations docs, locks, and progress matrix current |
| `WPHX-100` | PHP target feasibility | closed | 9/9 | Stock PHP target feasibility gates passed | Reopen only through compiler-pressure evidence |
| `WPHX-200` | PHP ABI, runtime, and linker | closed | 8/8 | ABI extraction, macro contracts, boundary types, facades, linker, public types, source maps, and escape-hatch audit exist | Use this foundation for each migrated Core slice |
| `WPHX-300` | WordPress PHP core | open | 6/8 direct children closed | Bootstrap, hooks, error/formatting/escaping/KSES, options/cache, wpdb, and REST have verified vertical slices; multisite and full first-party manifest closure remain open | Finish `WPHX-317` and `WPHX-322`; continue replacing shells with Haxe-owned runtime logic |
| `WPHX-400` | genes-ts/browser platform | open | 0/0 | Planning/feasibility track, not active implementation yet | Seed browser platform tasks and prove genes-ts package, React/TSX, exports, source maps, and bundling gates |
| `WPHX-500` | Gutenberg packages | not seeded | 0/0 | Do not start broad package translation yet | Create after `WPHX-400` package/React feasibility justifies parallelization and an ADR confirms repo protocol |
| `WPHX-600` | WordPress classic JS and browser vendors | not seeded | 0/0 | Not active | Start after browser platform gates expose the right package/runtime boundaries |
| `WPHX-700` | Parity, security, performance, and distribution | open | 9/9 current children closed | Early generated-PHP, live parity, packaged ABI, upstream PHPUnit ratchet, and CI gates exist; full distribution/security/performance closure remains open | Keep ratcheting toward installed-system parity, full upstream suites, ecosystem fixtures, and nonfunctional gates |
| `WPHX-800` | Codex and Beads program operations | closed | 7/7 | Program workflow, task packs, receipts, multi-agent, and Dolt backup/sync are operational | Maintain via `WPHX-000` follow-ups unless a new operations epic is needed |
| `WPHX-COMP` | Compiler-pressure queue | created on demand | n/a | No broad custom PHP/Reflaxe target track is justified yet | File minimized generic fixtures when stock PHP or genes-ts cannot meet required target shape |

## WordPress PHP Core Detail

`WPHX-300` currently reports 6 of 8 direct child milestones closed in Beads. Treat that as **milestone slice progress**, not as "75% of WordPress Core is ported."

| Slice | Status | Current interpretation |
| --- | --- | --- |
| `WPHX-301` Bootstrap/load order/constants/environment | closed | Bootstrap trace and load-order gates exist |
| `WPHX-302` Hooks/plugin API | closed | Hook surface promoted through distribution-surface evidence |
| `WPHX-303` Error/deprecation/formatting/escaping/KSES | closed | Multiple Haxe-owned decision slices and security corpus gates exist |
| `WPHX-304` Options/transients/object cache | closed | Option/cache candidate gates and fixtures exist |
| `WPHX-305` wpdb/database abstraction | closed | Strong wpdb vertical slice exists, including native mysqli and packaged ABI gates; still not evidence that every related Core DB path is Haxe-owned |
| `WPHX-311` REST API/schema | closed | Settings and REST server decision slices are typed Haxe strategy candidates; packaged, installed-browser, DB-backed, and cross-origin REST gates cover the active transport surface |
| `WPHX-317` Multisite/network | open | `WPHX-317.01` surface inventory, `WPHX-317.02` site/network option plus site-transient fixtures, `WPHX-317.03` blog switch/cache fixtures, `WPHX-317.04` site/network ABI/query fixtures, and `WPHX-317.07` first typed Haxe multisite adapter-contract candidate are closed; 5/7 child tasks are complete, with remaining installed-routing and signup/lifecycle/quota fixtures open |
| `WPHX-322` PHP first-party manifest closure | open | Needed to prove the remaining Core PHP runtime inventory has ownership states and closure gates |

## Gutenberg Plan

The plan remains: **WordPress PHP first, browser platform feasibility next, Gutenberg package port in a sibling repo only when justified.**

1. Keep `../gutenberg` as the forward Gutenberg 23.4 oracle checkout. Do not mix it into the WordPress 7.0 distribution track without an ADR.
2. Use this repo for `WPHX-400` feasibility: genes-ts output mode, package exports, WordPress script handles, React/TSX or HHX policy, source maps, bundling, globals, and browser tests.
3. Create `../gutenberghx` only after the first real package and React/TSX feasibility gates pass, currently described as after `WPHX-403` and `WPHX-404`, or earlier only by ADR.
4. When `gutenberghx` exists, keep this repo as the program authority: root Beads database, PRD, release claims, lock manifests, distribution integration, and final receipts.
5. Let `gutenberghx` own Haxe source for Gutenberg packages, package-level fixtures, generated package artifacts, and package parity receipts.
6. Port packages by dependency layer. Start with small leaf packages and package-shape fixtures, then move toward shared primitives and editor/block packages only after exports, React semantics, data stores, source maps, and build output are proven.
7. Smaller libraries stay in this repo unless they need independent release cadence, reusable compiler-pressure fixtures, or sustained parallel ownership. If split later, they still need lock manifests and receipts consumed by this repo.

## Update Rules

Update this file when any of the following changes:

- a `WPHX-*` parent milestone opens, closes, is seeded, or has meaningful child progress;
- a task changes the super-progress estimate or its weights;
- a receipt creates new evidence for Haxe ownership, parity, ABI, generated-code shape, distribution behavior, or nonfunctional closure;
- the Gutenberg/gutenberghx trigger, baseline, or cross-repo workflow changes;
- a shell/scaffold graduates to verified Haxe-owned logic, or a verified slice is downgraded because evidence was found weak;
- an ADR changes the PRD milestone shape, baseline policy, compiler strategy, or test authority.

Progress claims in chat or handoff notes should point back here, Beads, and receipts. Do not let this matrix become a second task database.
