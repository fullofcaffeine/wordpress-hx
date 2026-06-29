# ADR-003: Test Architecture and Snapshot Policy

Status: Accepted

Date: 2026-06-21

Amended: 2026-06-29 for WPHX-generated public-shell snapshots.

## Context

WordPressHX is a complete WordPress port to Haxe. Its tests must protect two different surfaces:

- observable WordPress behavior and plugin-facing PHP ABI;
- generated PHP shape, including whether Haxe lowers target-sensitive constructs into stable, idiomatic, ABI-appropriate PHP.

The current WPHX-305 database slices use behavior-first differential probes, live MySQL/MariaDB gates, PHP ABI/drop-in probes, deterministic manifests, receipts, Haxe formatting, escape-hatch audits, and secret scanning. Those tests are the correct center of gravity for runtime parity, but they do not fully answer whether generated PHP has the desired source shape.

GPT 5.5 Pro, referred to in project notes as the external architecture **oracle**, reviewed this architecture on 2026-06-21. This ADR records the accepted policy from that review. The external architecture oracle is distinct from the WordPress/Gutenberg behavior oracles in sibling upstream checkouts.

## Decision

Keep differential WordPress behavior as the primary authority. Add compiler-style snapshot/golden tests as a separate generated-PHP contract lane.

Snapshots answer:

> Did Haxe lower this construct into stable, valid, ABI-appropriate, idiomatic PHP?

Snapshots do not answer:

> Does this implementation behave like WordPress?

## Evidence Classes

Every test report and receipt for port work should state an evidence class:

| Evidence class | Purpose |
|---|---|
| `haxe_source_validity` | Haxe compiles and unsafe constructs fail closed. |
| `generated_shape` | Generated PHP has the intended declaration/call/source shape. |
| `static_abi` | Candidate source declares the required PHP public surface. |
| `runtime_abi` | PHP runtime reflection, dynamic properties, references, globals, and native values match expectations. |
| `targeted_semantic_parity` | Candidate and vanilla WordPress match for focused structured traces. |
| `live_integration_parity` | Candidate and vanilla match against real runtimes such as MySQL/MariaDB. |
| `upstream_suite_parity` | Candidate matches upstream WordPress PHPUnit results under a classified baseline. |
| `ecosystem_compatibility` | Plugins, themes, and drop-ins consume the candidate through normal WordPress surfaces. |
| `provenance` | Inputs, toolchain, commands, reports, and hashes are reproducible and tied to source. |

Receipts and manifests are provenance evidence. They are not semantic parity by themselves.

## Artifact Scopes

Every test report and receipt should also state an artifact scope:

| Artifact scope | Meaning |
|---|---|
| `helper` | A pure Haxe helper or minimized unit. |
| `minimized_fixture` | A reduced compiler/runtime fixture proving a target behavior. |
| `bridge_shell` | A PHP ABI shell or subclass that may still inherit upstream behavior. |
| `linked_candidate` | A linked candidate source unit or generated WordPress-facing file. |
| `packaged_distribution` | An assembled candidate WordPress distribution. |

A passing `bridge_shell` gate must not be described as final `packaged_distribution` parity.

## Test Lanes

Use these lanes for future work:

| Lane | Purpose | Authority |
|---|---|---|
| T0a Haxe compiler checks | Source compiles and escape hatches fail closed. | Haxe source validity. |
| T0b PHP lowering contracts | Haxe/backend emits acceptable PHP. | Generated-code shape. |
| T1 typed policy/model tests | Pure Haxe decisions are locally correct. | Internal typed logic. |
| T2a static PHP ABI | Candidate declares the required PHP surface. | Declared ABI. |
| T2b runtime PHP ABI | PHP sees the expected ABI at runtime. | Runtime-visible ABI. |
| T3 differential behavior | Candidate and vanilla make the same observable decisions. | Focused behavior parity. |
| T4 ecosystem compatibility | Plugins, themes, and drop-ins use the candidate normally. | Plugin-facing integration. |
| T5 installed-system/E2E | The assembled distribution boots and works. | Distribution behavior. |
| T6 nonfunctional closure | Security, fuzzing, reliability, and performance. | Operational quality. |

## Snapshot Policy

Snapshots belong primarily in T0b, after Haxe compilation and before runtime ABI or differential tests.

Use exact whole-file goldens for small minimized fixtures, such as PHP global-call lowering. Use AST-normalized contracts and selected exact excerpts for large generated WordPress artifacts. Use normalized reflection JSON for PHP ABI. Use live differential comparisons, not committed giant traces, for database/runtime behavior.

The standard generated-PHP contract pipeline is:

1. compile Haxe in a clean output directory;
2. compile again in a second clean output directory;
3. compare outputs byte-for-byte for determinism;
4. run `php -l`;
5. compare selected exact goldens when the file is small;
6. compare stable AST-normalized contracts for larger files;
7. optionally run a runtime smoke check.

Do not snapshot whole generated WordPress files as routine review artifacts until their churn is proven low. Prefer AST-selected method excerpts and contracts.

WPHX-generated public adapter files have their own generated-shape contract lane. Stock Haxe PHP lowering snapshots protect private implementation output; they do not prove that WPHX PHP emitted the public WordPress shell shape needed by plugins, themes, reflection, load timing, or stack traces.

Add selected exact or AST-normalized contracts for WPHX public-shell fixtures before durable claims broaden. Required shell-shape classes include:

- global function shell;
- public class/interface shell;
- protected method shell;
- by-reference parameter shell;
- conditional declaration shell;
- native PHP array mutation shell;
- include/top-level side-effect shell.

These snapshots are still shape evidence, not behavior parity. They must be paired with static ABI, runtime reflection, oracle/candidate behavior, and ownership receipts before a public PHP boundary is durable.

Implemented 2026-06-29 by `npm run wphx:php:public-shell-snapshots`, which writes `manifests/wphx-php/public-shell-snapshots.v1.json` and `receipts/compiler/wphx-comp-php-public-shell-snapshots.v1.json` with `evidence_class=generated_shape`. The first lane covers current generated global-function, public class/interface, protected-method, by-reference-parameter, conditional-declaration, native-array-mutation, and top-level-bootstrap shell shapes. Arbitrary include-return and direct file-scope script emission are still excluded from that claim and remain a separate fixture gate.

## Behavior Authority

Use this hierarchy for behavior parity:

1. vanilla differential oracle traces for focused, diagnosable behavior;
2. upstream WordPress PHPUnit for broad closure;
3. PHP-authored plugin/drop-in fixtures for ecosystem ABI and bootstrap behavior;
4. live runtime gates for database, filesystem, process, HTTP, native-extension, and browser behavior.

Run upstream PHPUnit against pinned vanilla and candidate distributions and classify results:

| Vanilla | Candidate | Meaning |
|---|---|---|
| Pass | Pass | Parity for that test. |
| Pass | Fail | Candidate regression. |
| Fail | Fail | Environment or upstream baseline issue. |
| Fail | Pass | Possible divergence; investigate. |
| Skip | Any | Track separately; never silently treat as pass. |

## WPHX-305 Implications

The WPHX-305.29 `wpdb::db_connect()` runner is valuable `live_integration_parity` evidence with `bridge_shell` scope. It proves composition with a PHP ABI subclass bridge, real `mysqli` handles, and live MySQL/MariaDB behavior. It does not yet prove a complete `class-wpdb.php` replacement where upstream `wpdb` is absent.

Future WPHX-305 work should add:

- fast Haxe policy tests for pure strategy decisions;
- generated-PHP lowering snapshots and AST contracts for sensitive emitted PHP;
- isolated oracle and candidate PHP processes, preferably with separate databases;
- complete static/runtime ABI dumps including declaring file/class, parameter/reference details, property order, dynamic properties, and native value leakage checks;
- packaged-distribution tests where upstream `src/wp-includes/class-wpdb.php` cannot mask missing candidate behavior;
- plugin/drop-in fixtures for reflection, load order, dynamic state, native mysqli checks, and failure surfaces;
- upstream PHPUnit ratcheting for database/options/cache groups.

Large embedded PHP probe bodies in JavaScript runners should be moved over time into named fixture files or constrained emitters so PHP diffs, linting, and ownership are reviewable.

## CI Policy

Stratify CI into:

- fast local/precommit checks: formatting, escape-hatch audit, Haxe unit tests, negative compile tests, selected lowering snapshots, `php -l`, static ABI contracts, manifest/receipt validation, and secret scanning;
- medium deterministic PR checks: complete lowering snapshots, PHP facade F1-F7, static/runtime ABI, load-order probes, linker/topology checks, non-DB plugin/drop-in fixtures, candidate distribution assembly;
- slow live gates: isolated oracle/candidate live MySQL/MariaDB parity, db drop-in fixtures, selected upstream PHPUnit groups;
- nightly gates: full upstream WordPress PHPUnit, PHP/DB matrices, multisite, cache variants, browser/E2E, plugin corpus, security, fuzzing, performance, reliability, and whole-distribution reproducibility.

The existing WPHX-303/304/305 parity gates exposed in `package.json` should become required CI gates for relevant path changes. Receipt-backed tests that are not continuously enforced can become stale.

## Consequences

- Generated-output snapshots become first-class evidence for PHP shape, not behavior parity.
- Behavior parity remains grounded in vanilla WordPress, real PHP, real databases, upstream PHPUnit, and plugin/drop-in fixtures.
- Receipts must describe both evidence class and artifact scope for new runners.
- Bridge-shell evidence remains useful but must carry removal gates and must not be used as final distribution proof.
- Compiler-pressure work should follow the WPHX-305.19 pattern: minimize the required PHP shape, prove what stock Haxe emits, and escalate to backend/Reflaxe work only after a focused fixture demonstrates a real limitation.

## Follow-Up Work

Track the implementation through Beads tasks:

- generated-PHP lowering snapshot lane;
- isolated oracle/candidate process runner and packaged-distribution ABI checks for WPHX-305;
- WPHX-303/304/305 CI gate expansion;
- upstream PHPUnit ratchet with known-deltas ledger;
- shared runner/report infrastructure with evidence class and artifact scope metadata.
