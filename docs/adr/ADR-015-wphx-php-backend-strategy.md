# ADR-015: WPHX PHP Backend Strategy

Status: Accepted

Date: 2026-07-02

## Context

WPHX PHP currently uses Reflaxe infrastructure in the in-repo compiler under `src/wphx/compiler/php`. That fact matters: this is not only a string-emitting shell script, and future work should preserve the option to extract or broaden the compiler into a reusable PHP target.

At the same time, the accepted scope in ADR-001 and ADR-013 is narrower than a mature general-purpose PHP backend. WPHX PHP currently proves bounded WordPress original-path public adapters, Adapter IR, PHP-core statement and expression nodes, public-shell snapshots, segment plans, bootstrap probes, and selected HTTP public shells. It does not yet prove arbitrary Haxe lowering, broad Haxe standard library/runtime ownership, whole WordPress file ownership, mixed template ownership, or distribution-wide generated PHP replacement.

Recent `WP_Http` work reduced the escape-hatch surface substantially: the WordPress profile now has zero inline `PhpRawBlock` bodies and zero active adapter templates, and former request, cookie constructor, and transport adapter bodies moved into structured WPHX PHP core IR. That is real compiler progress, but it also creates a strategic risk. If every new WordPress ABI pressure point is handled as another profile-specific adapter, the compiler can become a WordPress-only backend by accident. If the project flips too early into full backend scope, it can burn time reproducing stock Haxe PHP runtime and stdlib behavior before enough public WordPress pressure exists.

## Decision

Keep WPHX PHP on the staged Adapter IR path for current WordPress PHP work.

The project should describe the current compiler precisely:

- WPHX PHP uses Reflaxe infrastructure.
- WPHX PHP is the active staged custom PHP compiler lane for bounded WordPress original-path public adapters.
- WPHX PHP is not yet a mature arbitrary-Haxe `reflaxe.php` target.
- Stock Haxe PHP remains the private implementation emitter and std/php runtime oracle until a fixture explicitly moves that responsibility.

Do not promote WPHX PHP into full backend scope merely because the in-repo compiler uses Reflaxe or because one WordPress slice needs more public adapter nodes. Promotion requires backend-scale evidence and a new ADR or amendment that accepts the maintenance cost.

## Current Path

Use the following routing for new PHP pressure:

| Pressure | Preferred route |
| --- | --- |
| Private implementation code that stock Haxe PHP can emit correctly | Stock Haxe PHP |
| Generic private implementation lowering defect | Minimized stock Haxe PHP improvement or generic compiler-pressure fixture |
| Public WordPress original path, declaration timing, references, reflection, native arrays, globals, includes, templates, or plugin/theme-visible ABI | WPHX Adapter IR and WordPress profile |
| Repeated generic PHP constructs exposed by public adapters | Reusable WPHX PHP core IR/printer feature |
| Broad expression lowering, closure/dynamic dispatch/runtime behavior, stdlib replacement, or general source-map/debug requirements | Backend promotion review |
| Durable public PHP distribution claim | Generated original-path shell evidence, public-shell snapshots, ABI/reflection checks, behavior parity, installed/package evidence, and ownership receipts |

WordPress-specific code generation remains acceptable only as a named profile constraint. Generic loops, conditionals, calls, arrays, object construction, casts, closures, exceptions, static locals, dynamic class construction, formatting, and std/php interop should move into reusable WPHX PHP core IR when more than one boundary needs them.

## Generated PHP Quality Bar

Generated public WordPress PHP is a product surface. A generated public adapter is acceptable only when the claimed boundary has:

1. `php -l` coverage for the generated file.
2. Stable generated-shape snapshots or AST-normalized declaration checks where shape is part of the ABI.
3. Reflection-visible signatures, visibility, defaults, reference markers, properties, constants, class names, and guards matching the claimed WordPress boundary.
4. Native PHP arrays, globals, references, warnings, falsey values, callbacks, and include timing preserved where they are observable.
5. Oracle/candidate behavior probes for the claimed behavior.
6. `unsupported=[]` in the relevant WPHX PHP manifest for durable public-ownership claims.
7. Bootstrap, autoload, warning/error-handler, source-map, and stack-trace evidence before broad distribution claims that delegate into stock Haxe PHP implementation classes.
8. Public-shell ownership state recorded as `compiler_emitted_original_path_shell`, `durable_public_adapter`, `whole_file_owned`, or an accepted backend/custom-target improvement.
9. Generated PHP that is readable enough for WordPress operators, plugin/theme developers, reflection tooling, stack traces, and code review.
10. A bounded non-claim list that says what is still upstream PHP, copied oracle source, public-boundary behavior, or later work.

If generated PHP becomes noisy, misleading, or weak because good Haxe source cannot emit a required public shape, file compiler-pressure work instead of contorting Haxe source or pasting target PHP strings into runners.

## Backend Promotion Criteria

Open a backend-promotion ADR only when at least one of these conditions is true and backed by minimized fixtures or receipts:

- WPHX PHP is lowering broad arbitrary Haxe expression bodies rather than bounded adapter bodies.
- Multiple independent Core slices require the same generic PHP lowering feature and the feature cannot stay as a small Adapter IR node.
- WPHX PHP must own or replace significant Haxe runtime, boot, stdlib, reflection, dynamic dispatch, exception, closure, iterator, or string/Unicode behavior.
- Mixed PHP/HTML or direct-script ownership requires broad file-scope Haxe expression lowering and caller-scope source mapping beyond bounded segment plans.
- Stock Haxe PHP cannot emit private implementation code with acceptable correctness, performance, or debuggability, and a generic fix is not practical upstream.
- Public generated PHP quality requires a compiler-wide formatting, naming, source-map, or runtime strategy rather than more profile adapters.

The promotion ADR must compare at least these options:

- continue staged Adapter IR with reusable PHP-core nodes;
- broaden WPHX PHP into a full in-repo custom backend;
- extract a reusable `reflaxe.php` target;
- improve or augment stock Haxe PHP;
- split responsibilities between stock Haxe PHP and WPHX public-adapter generation.

## Oracle Review

This is a high-impact target strategy decision. The current decision keeps the staged path and does not require blocking current WPHX-312/WPHX-314 work on an external review. Before promoting WPHX PHP to full backend scope, prepare a second-pass review for the oracle using [the backend strategy prompt bundle](../operations/oracle-wphx-php-backend-strategy-review.md).

## Consequences

- The current WPHX-312 and WPHX-314 work should continue retiring copied or patched public shells through Adapter IR, structured segment plans, or generic WPHX PHP core features.
- New WordPress-profile adapters must justify why the behavior is profile-specific instead of reusable PHP core IR.
- A fully featured target remains a plausible direction, but it is not treated as imminent or already proven.
- Progress claims should continue to distinguish compiler architecture evidence from installed WordPress functionality.
- User-facing statements must avoid saying WPHX PHP is "not using Reflaxe"; the correct distinction is implementation substrate versus full-target maturity.

## Non-Claims

This ADR does not claim:

- full `WP_Http::request` ownership;
- whole-file `WP_Http` ownership;
- broad mixed PHP/HTML template ownership;
- installed WordPress distribution parity;
- that WPHX PHP is already a complete arbitrary-Haxe PHP backend;
- that stock Haxe PHP is good enough for public WordPress distribution files.

## Supersession

This ADR refines ADR-001, ADR-013, and ADR-014. It may be superseded by a future custom PHP target ADR after backend-scale evidence accumulates and the oracle review prompt is either answered or explicitly deferred with rationale.
