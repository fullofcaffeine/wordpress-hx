# Agent Instruction Hierarchy

This repository keeps its active agent guidance in the root `AGENTS.md`. Longer rationale, source comparisons, and receipt links belong here so the root file stays readable during daily work.

## Active Sources

Agents working in this repository should treat instruction sources in this order:

1. System/developer/runtime instructions supplied by the Codex environment.
2. This repository's root `AGENTS.md`.
3. The PRD at `docs/prd/wordpress-haxe-port.md`.
4. Focused operations docs under `docs/operations/`.
5. Sibling repository `AGENTS.md` files only when a task explicitly enters that repository.

The root `AGENTS.md` must stay concise enough to read at session start. If an instruction needs extended reasoning, examples, or source comparison, put the detail in `docs/operations/` and link it from the root only when it changes day-to-day behavior.

## Reference Repos Reviewed

WPHX-802 reviewed local precedent from:

- `../opencodehx/AGENTS.md` at `341422d4b2f1`.
- `../codex-hxrust/AGENTS.md` at `7675772e44c0`.
- `../genes/AGENTS.md` at `8acd1061fb63`.

Useful patterns adapted here:

- Keep sibling upstream and compiler repositories outside the port repo by default.
- Treat compiler fixes as generic compiler work, never product-specific hacks.
- Follow the target repository's own `AGENTS.md` before editing a sibling repo.
- Keep generated target output as a reviewable product surface.
- Use Beads for task state and close only verified work.
- Commit and push focused completed slices instead of leaving local-only progress.

Patterns intentionally not copied:

- OpenCode-specific upstream, TUI, provider, Node/Bun, and npm package rules.
- Codex/Haxe-Rust-specific `haxe.rust` profile, Rust backend, and Cafex adapter rules.
- Genes compiler-internal hxdoc and fixture mandates except as guidance for future compiler work.
- Any repo-specific public release claims, progress bars, or package metadata.

## Cross-Repo Rule

This repo may reference sibling repos as evidence, but it does not inherit their task databases or operating contracts. When work moves into a sibling repo:

1. Enter that repo.
2. Read its current `AGENTS.md`.
3. Use that repo's Beads/task workflow if present.
4. Commit and push the sibling repo's focused change there.
5. Return here and update WordPressHX pins, manifests, receipts, and Beads notes.

This keeps WordPressHX as the program authority without pretending that compiler or upstream repositories are subdirectories of this project.

## Dynamic And Escape Hatches

`Dynamic`, `untyped`, raw target syntax, broad casts, and generated `any` are compatibility escape hatches, not default modeling tools. New Haxe code must first try concrete types, structural typedefs, abstracts, enums, `EitherType`, target-native externs such as PHP native arrays, or small macros that preserve type information.

If an escape hatch remains necessary, the code must put it at the boundary and document the reason next to the use. A good justification names the runtime shape that Haxe cannot express yet, for example a PHP callable that may be a closure, function name string, or object/method tuple. Do not widen a whole function or class just because one argument is a native boundary value.

When reviewing or continuing work, treat casual `Dynamic` as a defect. Narrow it immediately when the local context is clear; otherwise file Beads follow-up with the boundary, evidence, and removal condition.

## JSON And Unknown Values

WordPressHX should treat JSON typing as part of source ownership, not as a place to hide weak models. The lesson from `../haxe.compilerdev.reference/tink_json` is practical here: typed parsers, writers, and JSON algebras are preferable to opaque values when runtime code will inspect the payload.

Before adding or preserving an `Unknown`, `Dynamic`, generated `any`, or wrapper around one of those for JSON-like data, choose the strongest practical model in this order:

- a precise domain typedef, enum, abstract, or record plus an explicit decoder;
- a generated or macro-backed codec/parser/writer when the schema or ABI manifest is stable enough;
- a recursive typed JSON value enum/abstract for genuinely open JSON such as plugin-provided metadata or passthrough REST fragments;
- an unknown boundary only for values that are uninspected, losslessly passed through, or immediately narrowed at the edge.

A wrapper around `Unknown` or `Dynamic` is not enough by itself. It must either restrict operations, emit a narrower target type, decode before app logic reads from it, or clearly state that callers may only pass through, store, encode, identity-compare, or immediately narrow the value.

If an unknown JSON boundary remains, add a nearby WPHX-211-style comment that answers:

- why a domain type, typed JSON value, schema-derived decoder, or `tink_json`-style codec is not practical there yet;
- which operations are allowed on the value;
- what contains the unsafety so it cannot spread into app-facing APIs;
- which owner, schema, fixture, or Beads issue can replace it later.

Do not name a broad unknown wrapper as if it were a modeled WordPress domain value unless the wrapper documents and enforces its boundary contract.

## Idiomatic Haxe Source

Generated PHP is a compatibility artifact. It must preserve WordPress 7.0 public interfaces, reflection-visible signatures, file paths, declaration timing, native arrays, references, globals, stack/error behavior where claimed, and plugin/theme expectations. Its quality bar is WordPress-compatible PHP: readable, idiomatic enough for the ecosystem, and no worse than the upstream surface it replaces.

Haxe source has a different quality bar. It should not mechanically mimic PHP control flow, naming, duplication, or weak typing when Haxe can express the same behavior more clearly. Prefer modern, typed Haxe source: enums for state machines, abstracts for constrained scalar domains, typedefs for structural records, pattern matching for decision tables, extension methods for readable helpers, small inline functions for repeated policy, and macros for deterministic boilerplate or ABI declarations.

Document every Haxe module and class with a short comment that explains why the unit exists: the WordPress behavior it owns, the boundary it protects, the target artifact it helps emit, or the fixture/gate it supports. For module-level function modules, put the module role before the first declaration; for classes, document the nominal contract or public ABI reason for the class.

Document functions once they cross a reasonable complexity threshold. A function needs a doc comment when it carries non-obvious branch policy, parity-sensitive invariants, side effects, target/runtime boundary assumptions, generated ABI implications, ownership/removal gates, or decisions a future porter would otherwise have to reverse-engineer from upstream PHP or JavaScript. Tiny helpers whose name, signature, and immediate body are self-evident do not need noise comments, but complex behavior should not be left undocumented merely because tests exist.

Improvements at the Haxe layer are encouraged when they satisfy all of these constraints:

- observable WordPress behavior and public ABI remain protected by oracle, ABI, fixture, or generated-code evidence;
- generated PHP remains compatible with existing plugins, themes, reflection, stack traces, and operational tooling for the claimed surface;
- the abstraction makes ownership, tests, or future refactoring clearer rather than hiding PHP-visible effects;
- macros generate typed, deterministic structure rather than broad textual rewrites;
- the change does not introduce speculative portability layers before a concrete second provider or target needs them.

When there is a tension, keep the generated adapter target-shaped and make the Haxe implementation clearer behind it. The desired architecture is not "PHP written in Haxe"; it is Haxe-owned WordPress semantics plus generated compatibility adapters that preserve WordPress behavior.

## Typed Template Authoring

Haxe-owned WordPress templates and markup should use an HXX-style typed authoring path when that makes the source safer or more ergonomic. The local precedents are:

- PhoenixHx in `../haxe.elixir.codex`, where inline markup and `HXX.hxx(...)` authoring lower to ordinary HEEx-facing artifacts, with stricter modes preferred for new code and raw HEEx treated as an escape hatch.
- RailsHx in `../haxe.ruby`, where Haxe-owned template classes, typed template references, and `@:railsTemplateAst(...)` lower to normal Rails/ERB artifacts, while existing ERB remains an explicit external/adoption boundary.
- `../haxe.compilerdev.reference/tink_hxx`, which provides the parser/generator model for inline markup, fragments, children, spreads, attributes, and typed tag resolution.

For WordPressHX, synthesize those patterns into a WordPress-specific template layer rather than copying either framework directly. The target should be the best Haxe/PHP markup authoring path for WordPress: typed locals and context, typed tag/helper registries, typed partial/template references, WordPress-aware escaping and URL helpers, block/admin/theme ergonomics, and deterministic lowering to normal WordPress-compatible artifacts.

This does not relax the compatibility contract. Existing WordPress mixed PHP/HTML files expose caller scope, globals, include order, direct file paths, output buffering, hooks, template-loader decisions, and sometimes stack/error behavior. HXX is appropriate after those effects are modeled or when Haxe owns a new template unit. Raw PHP/HTML template segments remain adoption boundaries with upstream hashes, provenance, ownership state, and removal gates.

## Generated PHP Shells

PHP shells are allowed because WordPress compatibility depends on original paths, global function names, conditional declarations, class identity, reflection-visible signatures, include timing, globals, references, and mixed PHP/HTML behavior. They are not permission to keep runtime logic or target contracts in hand-written PHP indefinitely.

The intended destination is Haxe-authored implementation plus Haxe-owned ABI/shell specifications that generate WordPress adapters. PHP is the first required adapter because WordPress plugins and themes consume it, but the shell contract should not be encoded only in PHP strings; it should be represented in typed Haxe source, metadata, macros, manifests, or linker inputs so another runtime/language adapter can be produced later without reverse-engineering PHP scaffolding.

A fixture may use a hand-authored or JavaScript-emitted shell while proving a boundary, but it must label that shell as scaffolding, record the ownership state, and name the removal gate. Once a pattern repeats or becomes durable, move shell generation into Haxe macros, a structured linker emitter, or a generic PHP backend/custom-target improvement.

If the stock Haxe PHP target cannot emit an idiomatic shell shape that WordPress plugins can consume, reduce the problem to a generic compiler-pressure fixture. Consider Reflaxe or a custom/forked PHP target only with evidence and an ADR; do not let convenience PHP strings in runners become the architecture.

If a custom/Reflaxe PHP generator is active, treat the stock Haxe PHP target and Haxe standard library as implementation references, not as things to casually replace. The generator should adapt existing std/php lowering for runtime boot, autoloading, native arrays, string and Unicode behavior, target intrinsics, reflection basics, and standard library calls wherever practical. WordPress-specific emission is allowed for original file paths, conditional global declarations, plugin/theme-facing reflection, mixed include timing, and ABI shapes that stock Haxe cannot express directly, but those extensions should stay named, narrow, and backed by parity fixtures so the generator can later be extracted as a reusable `reflaxe.php`-style target.

PHP is the privileged compatibility host for the current WordPress parity milestone. Rust/native providers are future optional internal providers, not peer adapters for unmodified PHP plugins. A native provider must have a PHP fallback, cross only pure value boundaries, and pass native-on/native-off differential evidence before any compatibility claim.

## Verification

The WPHX-802 receipt is `receipts/operations/wphx-802-agent-instructions.v1.json`.
