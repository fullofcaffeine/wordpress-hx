# Oracle Review: Original-Path PHP Emission Strategy

This document records the prompt bundle and response summary for the external architecture reviewer, the oracle, reviewing the WordPressHX PHP emission strategy. WordPress and Gutenberg remain the behavior oracles; "the oracle" here means the GPT 5.5 Pro architecture reviewer described in `AGENTS.md`.

## Response Summary

The oracle answered on 2026-06-29 and recommended a hybrid strategy:

```text
typed Haxe implementation modules
  -> stock Haxe PHP output for private implementation classes
  -> WPHX PHP emitter for original-path WordPress public adapter files
  -> deterministic manifests, ABI checks, reflection probes, behavior probes, and receipts
```

Accepted interpretation:

- Stock Haxe PHP is the implementation emitter. It is not assumed to be good enough for public WordPress distribution files.
- WPHX PHP is the bounded WordPress original-path public adapter emitter. It owns file topology, declarations, references, native PHP arrays, conditional declarations, reflection-visible ABI, and load/include effects only where WordPress compatibility requires them.
- The portable long-term asset is Haxe-owned semantics plus typed adapter contracts, not PHP text. This keeps future Go/Rust/WASM/custom-target profiles viable because PHP-specific ecosystem compatibility stays isolated at the adapter layer.
- Do not fork `genphp7.ml` now.
- Do not expand WPHX PHP into a full `reflaxe.php` backend now.
- Escalate only when minimized evidence proves that stock Haxe PHP plus bounded WPHX adapters cannot preserve required semantics, or when WPHX starts reimplementing a backend accidentally.

The oracle specifically treated the newer protected-method and by-reference-parameter evidence as support for continuing the current path, not as evidence for whole-file `WP_Http` ownership or a broader PHP backend.

## Accepted Follow-Up

Beads follow-up created from the response:

- `WPHX-COMP-PHP-ADAPTER-IR-ADR`: define WPHX PHP adapter IR and scope.
- `WPHX-COMP-PHP-SNAPSHOTS`: add WPHX-generated public-shell snapshot/AST contracts.
- `WPHX-COMP-PHP-BOOTSTRAP-ADR`: document Haxe PHP runtime bootstrap in the WordPress lifecycle.
- `WPHX-COMP-PHP.06`: generate `WP_Http::buildCookieHeader( &$r )` with native array mutation.
- `WPHX-COMP-PHP.07`: generate `WP_Http::processHeaders` with native header/cookie arrays.
- `WPHX-COMP-PHP-CONDITIONALS`: prove conditional declaration and pluggable load timing.
- `WPHX-COMP-PHP-INCLUDE-SIDE-EFFECTS`: prove include-time side effects before mixed templates.
- `WPHX-COMP-PHP-SHELL-RETIREMENT`: define copied/JS-patched shell retirement states.

Default sequence for the next Core slices:

1. Keep grouped `WP_Http` parser-helper emission moving.
2. Promote `processHeaders` from bridge evidence to WPHX-emitted adapter.
3. Promote `buildCookieHeader( &$r )` after by-reference and native-array mutation gates pass.
4. Add a conditional declaration/pluggable load-timing fixture.
5. Add a smaller include side-effect/include-return fixture before mixed PHP/HTML templates.

The oracle explicitly warned not to attempt full `WP_Http::request` or broad mixed-template ownership until these gates exist.

## Escalation Criteria

Use stock Haxe PHP improvements when the blocker is generic private implementation lowering: `php.Ref<T>`, by-reference returns, normal native PHP array lowering in implementation classes, generic source maps, or runtime bootstrap options that benefit non-WordPress Haxe PHP users.

Use WPHX PHP emitter features when the blocker is WordPress public ABI or file shape: original paths, global functions, public class/interface/trait identity, visibility/reflection, conditional declarations, PHP-native references, globals/superglobals, include-time side effects, and public-shell manifests.

Consider a stock Haxe PHP fork only when all conditions hold:

- a minimized generic fixture proves the stock target cannot emit a required PHP semantic;
- ordinary Haxe, `php.*`, macros, and WPHX adapters cannot preserve behavior safely;
- a shell/linker solution changes behavior, stack traces, references, load timing, or overhead unacceptably;
- the issue is generic to procedural PHP/public PHP ABI, not one WordPress call site;
- compiler-level tests cover the change;
- the fork delta is small, pinned, documented, and reversible.

Consider a broader `reflaxe.php`/custom PHP target only if WPHX is becoming a backend accidentally. Red flags include broad expression lowering, runtime/stdlib duplication, arbitrary script emission into caller scope, template semantics without a file-segment model, and maintaining backend-scale snapshots without a declared target architecture.

## Durable Public-Shell Gates

A copied, transformed, or JS-patched shell can support candidate evidence, but not a durable public PHP ownership claim. Durable claims require generated original-path files from typed Haxe source, typed metadata, ABI manifests, linker plans, WPHX PHP compiler output, or documented backend improvements.

Before replacing a bridge shell with a durable generated public shell, require:

- generated original-path file, emission manifest, input hashes, oracle hashes, output hash, unsupported construct list, ownership manifest, and receipt;
- static ABI comparison for claimed symbols, including names, visibility, parameters, defaults, references, variadics, returns, properties, constants, and conditional declaration segment;
- runtime ABI probes using PHP reflection and repeated include/require behavior;
- behavior probes against locked WordPress source for success, malformed, false/null/empty, warning/deprecation, native array key, filter timing, object identity, and reference mutation cases;
- bootstrap/debug probes for include path, autoload order, repeated bootstrap, `php.Boot::__hx__init()`, Haxe error handling, source maps, warnings/notices, and stack traces before broadening generated shells;
- packaged-distribution checks for durable Core claims.

## Risk Summary

| Risk | Exposure | Mitigation |
| --- | --- | --- |
| Compatibility | High: WordPress ABI includes references, globals, arrays, includes, warnings, stack traces, and templates. | Keep leaf/helper slices with static ABI, reflection, behavior, generated-shape, and packaged gates. |
| Maintenance | Medium-high: stock Haxe PHP and WPHX PHP both exist. | Keep WPHX bounded to original-path adapters and delegate implementation/stdlib behavior to stock Haxe PHP. |
| Ecosystem | High: plugins/themes reflect, subclass, hook, predefine, and inspect original files. | Require plugin/drop-in, reflection, declaration-timing, and native-mutation fixtures before durable claims. |
| Debugging | Medium: Haxe bootstrap can alter include path, autoload, errors, and traces. | Add bootstrap/source-map/stack-trace ADR and fixtures before broad distribution claims. |
| Sequencing | High: temporary shells can become permanent. | Enforce ownership states and retirement gates; JS-patched shells remain bridge evidence only. |

## Review Goal

Review whether WordPressHX should continue with the current approach:

- stock Haxe PHP output for Haxe runtime implementation classes;
- an in-repo Haxe/Reflaxe WPHX PHP emitter for WordPress-facing original-path adapter files;
- deterministic manifests, receipts, and oracle/candidate probes for every promoted public PHP boundary.

The review should decide whether this approach should remain the default, be amended toward a fork/augmentation of the stock Haxe PHP generator, or become a broader custom/Reflaxe PHP target.

## Current Position

ADR-001 accepted Haxe-authored implementation code plus typed macro metadata and manifests, assembled into WordPress-facing PHP by a deterministic original-path ABI/file linker. That decision came before the in-repo WPHX PHP emitter existed.

The current evidence changes the question from "should we fork the PHP target immediately?" to "how far should the WPHX PHP emitter go before it should become a generic Haxe PHP backend improvement, Haxe PHP fork, or standalone `reflaxe.php` style target?"

## Evidence Bundle

Use these files as context:

- `AGENTS.md`
- `docs/prd/wordpress-haxe-port.md`
- `docs/adr/ADR-001-php-emission-architecture.md`
- `docs/adr/ADR-003-test-architecture-and-snapshots.md`
- `docs/adr/ADR-004-haxe-semantic-authority-and-native-provider-policy.md`
- `docs/operations/php-abi.md`
- `docs/operations/wphx-php-compiler.md`
- `src/wphx/compiler/php/WphxPhpCompiler.hx`
- `fixtures/wphx-php/f1-facade.hxml`
- `fixtures/wphx-php/f4-public-class.hxml`
- `fixtures/wphx-php/wp-http-parser-helpers.hxml`
- `fixtures/wphx-php/src/wphx/fixtures/compiler/php/wp/WpHttpParserHelpersShell.hx`
- `tools/wp-core/run-wp-http-process-response-candidate.mjs`
- `receipts/compiler/wphx-comp-php-01-f1-f4-facade-drivers.v1.json`
- `receipts/compiler/wphx-comp-php-02-wp-http-chunk-transfer-decode.v1.json`
- `receipts/compiler/wphx-comp-php-03-wp-http-parser-helpers.v1.json`
- `manifests/wp-core/wphx-312-60-wp-http-process-response-candidate.v1.json`
- `manifests/ownership/wphx-312-60-wp-http-process-response-candidate.v1.json`

Optional local references:

- `../haxe.compilerdev.reference/haxe`, especially the stock Haxe 4.3.7 PHP generator and std/php runtime.
- `../haxe.rust`, `../haxe.go`, `../haxe.elixir.codex`, and other `../haxe.compilerdev.reference` compiler examples as custom-target precedents.

## Facts To Preserve

- WordPress plugin/theme compatibility depends on original file paths, load order, conditional declarations, global functions, public classes/interfaces/traits, reflection-visible signatures, references, globals, native arrays, callbacks, stack traces, warnings, and include timing.
- Haxe-authored source should own migrated runtime decisions; generated PHP is a compatibility artifact, not the source of truth.
- Durable public PHP shells should be emitted from typed Haxe metadata, macros, linker plans, or compiler improvements, not handwritten or JS-patched indefinitely.
- The current WPHX PHP emitter can emit WordPress-shaped files such as `wp-includes/plugin.php`, `wp-includes/class-wphx-public-class.php`, and `wp-includes/class-wp-http.php`.
- The current grouped WP_Http driver emits one original-path `class-wp-http.php` containing both `WP_Http::processResponse` and `WP_Http::chunkTransferDecode`, then passes PHP lint and existing oracle/candidate probes.
- The current emitter is intentionally not a full PHP backend. It delegates implementation behavior to stock Haxe PHP output wherever practical.
- The current known next pressures are protected methods, references, conditional declarations, traits, richer parameter defaults, file-level side effects, include return values, mixed PHP/HTML templates, source maps, and generated target readability.

## Prompt

You are the oracle, an external architecture reviewer for WordPressHX. WordPress and Gutenberg remain the behavior oracles; your role is second-pass architecture review.

We are porting WordPress 7.0 runtime logic to Haxe while preserving the public WordPress PHP filesystem/API interface. We need a durable emission strategy for generated PHP files that existing WordPress plugins, themes, operational tooling, reflection, stack traces, and include/require flows can use as if they were the original distribution files.

Please review the current strategy and recommend whether we should:

1. Continue with stock Haxe PHP output for implementation classes plus a deterministic original-path linker/WPHX PHP shell emitter driven by Haxe metadata and manifests.
2. Augment or fork the stock Haxe PHP generator so selected Haxe modules can emit WordPress-shaped files directly.
3. Expand the current in-repo Reflaxe emitter into a custom PHP target, eventually extractable as a reusable `reflaxe.php` style backend.
4. Use a hybrid strategy with explicit escalation criteria.

Evaluate these compatibility requirements:

- original file path identity and `require`/`include` behavior;
- conditional declarations and pluggable load timing;
- global function, class, interface, and trait ABI;
- protected/private/public method and property reflection;
- by-reference parameters, by-reference returns, reference mutation through callbacks, and global aliasing;
- native PHP arrays, `isset`/`empty`/falsey semantics, dynamic properties, globals, and superglobals;
- top-level side effects, include return values, output buffering, and mixed PHP/HTML template caller scope;
- stack traces, source maps, generated target readability, and debuggability for WordPress operators;
- plugin/theme ecosystem expectations;
- Haxe stdlib/runtime reuse and avoiding a parallel PHP backend accidentally;
- migration sequencing from copied shells to generated public PHP adapters;
- when temporary shells become unacceptable and must block further claims.

Ground the recommendation in the existing evidence:

- ADR-001 accepted stock Haxe PHP plus deterministic original-path linker before the WPHX PHP emitter existed.
- The WPHX PHP emitter now emits F1 global-function and F4 public-class facade drivers.
- The emitter now emits `wp-includes/class-wp-http.php` for a one-method chunk decoder driver and a grouped two-method parser helper driver.
- The grouped driver delegates implementation to stock Haxe PHP output and passes PHP lint plus oracle/candidate probes.
- The next planned pressure is extending grouped `WP_Http` emission to protected/header-cookie helpers such as `processHeaders`, `buildCookieHeader`, and protected `parse_url`.

Please answer with:

1. Recommended default strategy for the next 3 to 5 WordPress Core slices.
2. Clear escalation criteria for stock Haxe PHP improvements, WPHX PHP emitter features, Haxe PHP generator fork/augmentation, and a broader Reflaxe/custom PHP target.
3. Evidence gates required before replacing copied/JS-patched shells in durable claims.
4. Red flags that should stop us from broadening the current WPHX PHP emitter.
5. ADR amendments or new ADR decisions you would require.
6. A short risk table covering compatibility, maintenance, ecosystem, debugging, and migration sequencing.

Do not assume the goal is "clean PHP" alone. The goal is a complete Haxe-authored WordPress port whose generated PHP remains a faithful WordPress compatibility surface.

## Expected Follow-Up

After the oracle response exists, file or update Beads issues for accepted changes. Likely outcomes are:

- amend ADR-001 if the current WPHX PHP emitter becomes the named durable linker implementation;
- add WPHX PHP compiler-pressure tasks for protected methods, references, conditional declarations, traits, and templates;
- add a blocker if the oracle recommends pausing broader emitter expansion before more generated-output snapshot gates exist;
- keep `WPHX-COMP-PHP.04` unblocked if the recommendation supports continuing grouped WP_Http helper emission.
