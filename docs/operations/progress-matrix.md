# Program Progress Matrix

This document is the durable human-readable rollup for progress toward a WordPress distribution whose first-party runtime logic is authored in Haxe and whose generated artifacts remain functional for the WordPress ecosystem.

Beads remains the task database. This matrix is a status ledger over Beads issues, receipts, manifests, and PRD milestones. Update it in the same change whenever milestone status, scope, evidence gates, Gutenberg split policy, or completion estimates change.

Last updated: 2026-06-27
Source checkpoint: `WPHX-312.03 HTTP/cron/mail oracle fixture`
Tracking issue: `WPHX-000.02`

## Super Progress

Current super progress toward "WordPress completely in Haxe and functional": **44.1%**.

This is an evidence-weighted program estimate, not source-line completion. It gives credit for proven target foundations, ABI/linker infrastructure, vertical WordPress slices, and executable parity gates, but it discounts shell/scaffold work and gives almost no credit for Gutenberg/browser ownership until `WPHX-400` and `WPHX-500` start producing package-level receipts.

| Area | Weight | Current | Contribution | Basis |
| --- | ---: | ---: | ---: | --- |
| Program governance, baselines, manifests, Beads, receipts | 10 | 95 | 9.5 | `WPHX-000`, `WPHX-800`, baseline receipts, locked sibling repo policy |
| PHP target feasibility, ABI, linker, public boundary foundation | 20 | 100 | 20.0 | `WPHX-100` and `WPHX-200` closed |
| WordPress PHP runtime Haxe ownership | 40 | 33.0 | 13.2 | `WPHX-300` has verified vertical slices, first-party PHP manifest ownership/split closure, bounded WPHX-306 users/auth, WPHX-307 posts/query, WPHX-308 taxonomy/comment, WPHX-309 routing/template, WPHX-310 theme/theme JSON/template hierarchy domain closures, plus WPHX-312 HTTP/cron/mail/feed/embed surface inventory, first typed adapter-contract candidate, and a side-effect-safe HTTP/cron/mail oracle-source fixture, but much of Core remains unported |
| Installed WordPress distribution behavior and ecosystem gates | 15 | 9.6 | 1.4 | `WPHX-700` has strong early gates, focused WPHX-306 auth, WPHX-307 posts/query, WPHX-308 taxonomy/comment, WPHX-309 routing/template, and WPHX-310 theme installed-style gates, and a provisioned selected upstream PHPUnit ratchet where all 34 vanilla/candidate runs classify pass/pass; complete installed-system parity is still not closed |
| Browser, classic JS, Gutenberg package ownership | 10 | 0 | 0.0 | `WPHX-400`, `WPHX-500`, and `WPHX-600` are not yet active implementation tracks |
| Security, performance, reliability, and release closure | 5 | 0 | 0.0 | early security corpus exists, full nonfunctional closure is later-stage work |

The score should move only when evidence moves. A closed task can increase confidence in a slice without implying that the whole source area is ported.

ADR-004 clarifies ownership claims without changing the score: PHP is the privileged compatibility host for current parity, Haxe owns both migrated semantics and adapter intent, and Rust/native/WASM/custom-target providers are future optional providers only for narrowly eligible kernels or explicitly named profiles with PHP fallbacks and native-on/native-off evidence. A later multi-target track, including a browser/WASM profile potentially based on `back2dos/wasmix`, a Go profile potentially based on `fullofcaffeine/reflaxe.go`, and a Rust profile potentially based on `fullofcaffeine/reflaxe.rust`, is tracked as a long-term research option and does not contribute to current parity progress. Future ownership rollups should distinguish semantic ownership, adapter-contract ownership, emission strategy, execution provider, and evidence level.

## PRD Milestone Matrix

| External ref | Scope | Beads status | Beads child progress | Haxe/functionality state | Next required movement |
| --- | --- | --- | ---: | --- | --- |
| `WPHX-000` | Program governance and baseline | open | 16/16 baseline children closed, plus governance follow-ups through `WPHX-000.04` | Control-plane baseline is usable; progress-matrix governance and the idiomatic-Haxe source rule are documented; governance remains open for program-level decisions | Keep PRD, AGENTS, operations docs, locks, and progress matrix current |
| `WPHX-100` | PHP target feasibility | closed | 9/9 | Stock PHP target feasibility gates passed | Reopen only through compiler-pressure evidence |
| `WPHX-200` | PHP ABI, runtime, and linker | closed | 8/8 | ABI extraction, macro contracts, boundary types, facades, linker, public types, source maps, and escape-hatch audit exist | Use this foundation for each migrated Core slice |
| `WPHX-300` | WordPress PHP core | open | 8/8 original direct children closed; WPHX-306, WPHX-307, WPHX-308, WPHX-309, and WPHX-310 are closed; WPHX-312 is active; WPHX-313 through WPHX-320 remain seeded follow-up domains | Bootstrap, hooks, error/formatting/escaping/KSES, options/cache, wpdb, REST, multisite, first-party PHP manifest/split closure, users/auth adapter-contract/domain-closure evidence, bounded posts/query domain closure, bounded taxonomy/comment domain closure, bounded rewrite/routing/canonical/template domain closure, bounded theme/theme JSON/template hierarchy domain closure, HTTP/cron/mail/feed/embed surface inventory, first typed WPHX-312 adapter-contract evidence, and a side-effect-safe HTTP/cron/mail oracle-source fixture have receipts; broad Core implementation remains open through remaining seeded follow-up domains | Continue WPHX-312 with deterministic feed/embed/HTTPS/AI/trackback fixtures, installed observations, and selected upstream ratchets while generated public PHP adapter replacement stays a later cross-domain gate |
| `WPHX-400` | genes-ts/browser platform | open | 0/0 | Planning/feasibility track, not active implementation yet | Seed browser platform tasks and prove genes-ts package, React/TSX, exports, source maps, and bundling gates |
| `WPHX-500` | Gutenberg packages | not seeded | 0/0 | Do not start broad package translation yet | Create after `WPHX-400` package/React feasibility justifies parallelization and an ADR confirms repo protocol |
| `WPHX-600` | WordPress classic JS and browser vendors | not seeded | 0/0 | Not active | Start after browser platform gates expose the right package/runtime boundaries |
| `WPHX-700` | Parity, security, performance, and distribution | open | 10/10 current children closed after `WPHX-700.10` | Early generated-PHP, live parity, packaged ABI, upstream PHPUnit ratchet, and CI gates exist. `WPHX-310.11` expands the provisioned selected upstream PHPUnit ratchet to 17 groups / 34 runs with all selected groups vanilla pass / candidate pass; full distribution/security/performance closure remains open | Keep ratcheting toward installed-system parity, full upstream suites, ecosystem fixtures, and nonfunctional gates |
| `WPHX-800` | Codex and Beads program operations | closed | 7/7 | Program workflow, task packs, receipts, multi-agent, and Dolt backup/sync are operational | Maintain via `WPHX-000` follow-ups unless a new operations epic is needed |
| `WPHX-COMP` | Compiler-pressure queue | created on demand | n/a | No broad custom PHP/Reflaxe target track is justified yet | File minimized generic fixtures when stock PHP or genes-ts cannot meet required target shape |
| `WPHX-MTGT` | Future multi-target profiles, including browser/WASM, Go, Rust, and Playground-adjacent research | not seeded | 0/0 | Explicit long-term option only; `back2dos/wasmix` is the current WASM reference/base candidate; `fullofcaffeine/reflaxe.go` and `fullofcaffeine/reflaxe.rust` are current Go/Rust references; broader Haxe-supported/custom targets remain possible | Start only after PHP parity and browser platform evidence can define bounded compatibility profiles and the PHP plugin/theme adapter story |

## WordPress PHP Core Detail

`WPHX-300` has closed the original 8 direct milestone gates through WPHX-322, and WPHX-322 seeded WPHX-306 through WPHX-320 as explicit source-domain follow-up owners. Treat this as **manifest ownership/split progress**, not as "WordPress Core is ported."

| Slice | Status | Current interpretation |
| --- | --- | --- |
| `WPHX-301` Bootstrap/load order/constants/environment | closed | Bootstrap trace and load-order gates exist |
| `WPHX-302` Hooks/plugin API | closed | Hook surface promoted through distribution-surface evidence |
| `WPHX-303` Error/deprecation/formatting/escaping/KSES | closed | Multiple Haxe-owned decision slices and security corpus gates exist |
| `WPHX-304` Options/transients/object cache | closed | Option/cache candidate gates and fixtures exist |
| `WPHX-305` wpdb/database abstraction | closed | Strong wpdb vertical slice exists, including native mysqli and packaged ABI gates; still not evidence that every related Core DB path is Haxe-owned |
| `WPHX-306` Users/roles/capabilities/auth/cookies/nonces | closed | Domain closure receipt exists across the surface inventory, first typed Haxe auth adapter-contract candidate, capability/role fixture, auth-cookie/nonce fixture, password/application-password fixture, runtime ABI fixture, and installed-style HTTP auth gate. `WPHX-306.07` covers login/logout, Set-Cookie headers, cookie-authenticated profile access, AJAX nonce success/failure, REST-style application-password Basic auth, profile application-password creation, package-boundary reflection, and Haxe contract presence. Public PHP auth files are still copied oracle source; generated public PHP replacement, live MySQL-backed installation, selected upstream auth PHPUnit groups, and full external plugin/admin-screen corpus remain later distribution work. |
| `WPHX-307` Posts/metadata/revisions/WP_Query | closed | Domain closure receipt exists across the surface inventory, typed Haxe posts/query, CRUD/status, metadata/cache, and revision adapter-contract candidates, deterministic WP_Query runtime ABI/query-state fixture, live WP_Query SQL/result fixture, MySQL/MariaDB/PHP DB-client runtime matrix, selected upstream PHPUnit pass/pass evidence, and installed-style packaged HTTP gate. Closure is bounded: public PHP post/query files are still copied oracle source, generated public PHP replacement is not claimed, full database-backed installed post behavior remains later distribution work, and this does not close the whole WordPress posts subsystem beyond the recorded evidence. |
| `WPHX-308` Taxonomy/terms/comments | closed | Domain closure receipt exists across the surface inventory, first typed Haxe taxonomy/comment adapter-contract candidate, deterministic CRUD oracle fixture, count/cache invalidation fixture, query-state fixture, live MySQL/MariaDB plus PHP DB-client SQL/result matrix, selected upstream PHPUnit taxonomy/comment pass/pass evidence, and installed-style packaged HTTP gate. `WPHX-308.09` covers taxonomy registration, term insert/meta/object assignment/count/cache observations, pending comment insertion, comment approval, comment meta, front taxonomy filtering, and comment query/moderation filtering over oracle and candidate packages. Closure is bounded: public PHP taxonomy/comment files are still copied oracle source, generated public PHP replacement is not claimed, full database-backed installed term/comment behavior remains later distribution work, and this does not close the whole WordPress taxonomy/comment subsystem beyond the recorded evidence. |
| `WPHX-309` Rewrite/routing/canonical URLs/templates | closed | Domain closure receipt exists across the surface inventory, first typed Haxe routing/template adapter-contract candidate, deterministic routing/link oracle fixture, canonical/template-loader oracle fixture, installed-style packaged HTTP gate, selected upstream PHPUnit ratchet group scope, and provisioned upstream rewrite/routing/canonical/link/template pass/pass evidence. Closure is bounded: public PHP routing/template files are still copied oracle source, generated public PHP replacement is not claimed, full database-backed front-end routing/canonical/template behavior remains later distribution work, and this does not close the whole WordPress routing/template subsystem beyond the recorded evidence. |
| `WPHX-310` Themes/theme JSON/template hierarchy | closed | Domain closure receipt exists across the surface inventory, first typed Haxe theme/template adapter-contract candidate, theme support/template oracle fixture, WP_Theme_JSON/global styles fixture, resolver/global-styles wrapper/cache fixture, customizer/widget/nav-menu/admin-theme narrowed inventory, widget/sidebar fixture, nav-menu fixture, Customizer manager/settings fixture, packaged installed-style theme front-end/admin gate, and selected upstream theme/template/theme-json/block-template/widget/nav-menu/Customizer pass/pass evidence. Closure is bounded: public PHP theme/customizer/widget/nav-menu files are still copied oracle source, generated public PHP replacement is not claimed, full database-backed installed theme behavior remains later distribution work, and this does not close the whole WordPress theme subsystem beyond the recorded evidence. |
| `WPHX-311` REST API/schema | closed | Settings and REST server decision slices are typed Haxe strategy candidates; packaged, installed-browser, DB-backed, and cross-origin REST gates cover the active transport surface; `WPHX-311.10a` hardens the DB-backed browser harness against automatic favicon/network-idle fetch races; `WPHX-700.10` fixes upstream PHPUnit REST group selection and records REST settings/server groups as vanilla pass / candidate pass |
| `WPHX-312` HTTP/cron/mail/feeds/embeds | active | `WPHX-312.01` adds a bounded surface inventory for 91 PHP runtime source files, 92 PHP distribution artifacts, 708 ABI entries, and 38 upstream tests across HTTP/Requests integration, AI-client HTTP, cron scheduling, PHPMailer/mail, feeds/OPML, embeds/oEmbed, HTTPS detection/migration, privacy request mail tables, and trackbacks. `WPHX-312.02` adds the first typed Haxe HTTP/cron/mail/feed/embed adapter-contract candidate with 45 deterministic observations covering HTTP transport routing, cron scheduling, mail dispatch, feed/OPML/fetch routes, embed/oEmbed routes, HTTPS detection/migration, privacy request mail, AI-client HTTP, trackbacks, and hook intent. `WPHX-312.03` adds a copied-oracle/candidate PHP fixture with 7 deterministic cases and 30 covered symbols across HTTP response/header/cookie/encoding helpers, cron event scheduling/lookup/clearing, and `wp_mail` filter/pre-send short-circuit behavior. This remains bounded: it does not claim generated public PHP replacement, live network side-effect parity, mail transport parity, real cron spawn/dispatch parity, feed rendering parity, embed/oEmbed behavior parity, installed behavior, upstream PHPUnit parity, or ecosystem coverage. |
| `WPHX-317` Multisite/network | closed | Domain closure receipt exists across all 7 child tasks: surface inventory, site/network option plus site-transient fixtures, blog switch/cache fixtures, site/network ABI/query fixtures, bootstrap/domain-path routing fixtures, signup/lifecycle/counts/quota fixtures, and the first typed Haxe multisite adapter-contract candidate. Public PHP replacement and installed multisite distribution claims remain later gates. |
| `WPHX-322` PHP first-party manifest closure | closed | Manifest/split closure assigns 1,564 C1 PHP runtime source entries and 1,222 C1 PHP distribution artifacts to closed domains or explicit follow-up owners, with zero unassigned; PHP vendor entries are excluded to WPHX-323 |

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
