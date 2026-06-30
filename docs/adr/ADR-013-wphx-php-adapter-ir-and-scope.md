# ADR-013: WPHX PHP Adapter IR and Scope

Status: Accepted

Date: 2026-06-29

## Context

ADR-001 accepts a hybrid PHP emission architecture: stock Haxe PHP emits private Haxe implementation classes, while WPHX PHP emits WordPress-facing original-path public adapters. The 2026-06-29 external architecture oracle review confirmed that this split should continue for the next Core slices, but it also warned that an adapter emitter can accidentally become an undeclared PHP backend if it starts accepting arbitrary language pressure without a scoped IR, feature gates, and escalation rules.

The project has since clarified that WPHX PHP is not merely a temporary shell generator. It is the active in-repo custom PHP compiler lane, staged through Adapter IR and WordPress original-path public adapter evidence first. The staging is intentional: it lets the compiler grow a reusable modern PHP core and a WordPress compatibility profile without forcing an immediate switch to arbitrary-Haxe backend scope before the required stdlib, runtime, expression-lowering, template, and distribution evidence exists.

The next WordPress pressure points, especially `WP_Http::buildCookieHeader( &$r )`, `WP_Http::processHeaders`, pluggable declarations, include-time side effects, and eventually mixed templates, require more than prettier PHP. They require original file identity, native PHP arrays, references, declaration timing, reflection-visible signatures, warnings, include scope, and plugin/theme compatibility.

The project also wants to preserve a future path to a broader custom PHP target, possibly extractable as `reflaxe.php`, without forcing later rewrites of the Haxe source that describes WordPress semantics and public ABI intent.

## Decision

Build WPHX PHP as the in-repo, modern Reflaxe PHP compiler foundation with an explicit Adapter IR and a WordPress compatibility profile.

The current compiler pipeline is:

```text
typed Haxe source and metadata
  -> WPHX Adapter IR
  -> deterministic original-path PHP adapter printer
  -> emission manifest, receipts, ABI/probe gates
```

Stock Haxe PHP remains the default implementation emitter for private Haxe code and the reference for Haxe stdlib/runtime behavior. The native Haxe PHP generator and `std/php` sources in `../haxe.compilerdev.reference/haxe` may be used as an implementation oracle for generic, borrowable PHP lowering and runtime patterns. They are not the behavior oracle for WordPress public file topology, declaration timing, plugin-facing ABI, or WordPress compatibility effects. WPHX PHP should grow reusable modern PHP compiler features first, then apply WordPress profile constraints where WordPress compatibility requires original paths, PHP-native ABI, declaration timing, references, native arrays, globals, includes, or template/file-scope behavior.

The Adapter IR is the durable contract between Haxe source and public PHP emission. It should be shaped as if a later full custom PHP backend or extracted `reflaxe.php` target will consume the same Haxe metadata and adapter intent without changing ordinary Haxe source.

This ADR does not authorize flipping all WordPress PHP output to a full arbitrary-Haxe backend today. WPHX PHP is allowed and expected to grow through bounded adapter features backed by minimized fixtures and WordPress slice pressure, but each feature should be evaluated for whether it belongs in the reusable PHP compiler core or only in the WordPress profile. When enough generic lowering pressure accumulates, a later ADR may promote the same staged compiler lane into a broader backend without rewriting the Haxe ABI contracts.

## Adapter IR Scope

The accepted Adapter IR surface includes these node families as they become needed. Prefer reusable PHP-core nodes unless the behavior is inherently WordPress-profile-specific:

- files with emitted paths, bootstrap requirements, and ordered declarations, with original WordPress distribution paths handled by the WordPress profile;
- global function declarations with guards, reflection-visible parameters, defaults, by-reference markers, and future by-reference returns;
- class, interface, trait, method, property, and constant declarations with public/protected/private visibility, inheritance, implements/use relationships, and reflection-visible names;
- conditional declaration segments such as pluggable `function_exists` and class/interface/trait guards;
- native PHP value boundaries for arrays, globals, superglobals, references, callbacks, warnings, includes, output buffers, and file return values;
- adapter calls into stock Haxe PHP implementation classes when private runtime behavior is delegated;
- profile adapters for compatibility-host behavior that is not yet expressible as generic IR, with removal gates toward reusable IR nodes;
- unsupported construct records that block durable ownership claims until removed.

The v0 implementation in `src/wphx/compiler/php/WphxPhpCompiler.hx` covers the currently proven shell shapes: original-path files, guarded global functions, classes/interfaces, bounded direct file-scope script adapters, methods, properties, constants, Haxe runtime bootstrap markers, protected methods, by-reference parameters, grouped original-path public class adapters, and emission-manifest declarations. `WPHX-COMP-PHP-CORE-IR-NATIVE-ARRAYS` and `WPHX-COMP-PHP.07` add the first reusable PHP-core method-body nodes for conditionals, `for`/`foreach` loops, `break`, `continue`, `return`, native array reads/writes/appends, array casts, int/string casts, long array literals, object construction, local variables, assignments, and calls. `WPHX-COMP-PHP-GROUP-WP-HTTP-HELPERS` proves that one generated original-path `WP_Http` shell can group `processResponse`, `chunkTransferDecode`, protected `parse_url`, `buildCookieHeader( &$r )`, and `processHeaders( $headers, $url = '' )` without unsupported constructs while preserving the bounded public/protected ABI and helper behavior. `WPHX-COMP-PHP-INCLUDE-SIDE-EFFECTS` adds the first bounded original-path direct script adapter for include timing, include returns, function-scope locals, repeated include/include_once behavior, and output buffering. These nodes are reusable compiler core where possible; the WordPress profile only chooses when an original-path public boundary needs them.

## Feature Admission

New WPHX PHP features require fixture pressure. A feature may be admitted when it has:

1. a minimized fixture or bounded WordPress slice showing the required public PHP behavior;
2. typed Haxe source or metadata that describes the behavior or ABI intent;
3. generated PHP from Adapter IR, not durable PHP pasted into JavaScript strings;
4. `php -l` coverage;
5. generated-shape or AST contract coverage when the public shell shape is material;
6. static ABI and runtime reflection probes for public declarations;
7. oracle/candidate behavior probes for WordPress-visible behavior;
8. a receipt and ownership state that list remaining non-claims.

Unsupported constructs must remain visible in manifests and must block the claimed boundary. A manifest that records unsupported constructs is evidence of pressure, not evidence of durable public ownership.

## Raw PHP String Policy

Temporary copied, upstream-derived, or JS-patched PHP bodies may support bridge evidence while a slice is being reduced. They must not become durable adapter authority.

Durable public PHP bodies must come from one of:

- typed Haxe source;
- typed metadata;
- Adapter IR plans;
- the WPHX PHP compiler/printer;
- the original-path linker;
- a documented stock Haxe PHP/backend improvement.

If a PHP-native operation is unavoidable, keep it as the smallest named boundary, document why no narrower typed model works yet, and attach a removal or narrowing gate.

## Escalation Rules

Use stock Haxe PHP improvements when a blocker is generic private Haxe implementation lowering or stdlib/runtime behavior.

Use WPHX Adapter IR features when a blocker is WordPress public ABI or original-file topology: original paths, global functions, class/interface/trait identity, references at public boundaries, native arrays/globals, conditional declarations, include timing, templates, or public-shell manifests.

Consider a Haxe PHP fork or augmentation only when a minimized generic fixture proves that ordinary Haxe, `php.*` APIs, macros, stock Haxe PHP output, and WPHX Adapter IR cannot preserve required semantics safely or efficiently.

Promote WPHX PHP toward a broader custom Reflaxe PHP target only when evidence shows the staged compiler lane has crossed backend-scale pressure: broad expression lowering, duplicated or deliberately replaced Haxe runtime/stdlib behavior, generic closure/exception/dynamic dispatch support, or template/direct-script emission that cannot remain bounded to adapter nodes. That promotion should be an explicit continuation of the WPHX PHP custom compiler track, not a rewrite of Haxe source or a normalization of handwritten PHP shells.

## Consequences

- Existing Haxe sources should describe WordPress semantics and ABI intent, not generated PHP formatting.
- The current WPHX PHP emitter must lower to Adapter IR before printing PHP.
- Public-shell snapshots and ABI probes become part of the compiler-pressure lane before claims broaden.
- Future `reflaxe.php` extraction remains plausible because the Haxe source and adapter contract are intentionally designed for a staged custom compiler, not tied to one printer or WordPress-only shell generator.
- WPHX PHP must reuse stock Haxe PHP and std/php behavior where practical, and deviate only where WordPress public compatibility requires it.
- Native Haxe PHP source may be borrowed from or adapted for generic implementation details, but WordPress-facing ABI decisions must still cite WordPress/oracle fixtures.
- WordPress-specific generation is acceptable as a profile, but not as the default architecture of the compiler core.

## Non-Claims

This ADR does not claim:

- whole-file `WP_Http` ownership;
- full `WP_Http::request` ownership;
- mixed PHP/HTML template ownership;
- broad WordPress distribution replacement;
- that stock Haxe PHP can emit modern WordPress public files directly;
- that WPHX PHP is already a complete arbitrary-Haxe PHP backend.

## Supersession

This ADR refines ADR-001 and ADR-003. ADR-014 refines the Haxe PHP runtime bootstrap lifecycle for Adapter IR files that delegate into stock Haxe PHP implementation classes. This ADR may be superseded by a later custom-target ADR only after minimized evidence shows the Adapter IR approach cannot preserve required public behavior or is already maintaining backend-scale semantics.
