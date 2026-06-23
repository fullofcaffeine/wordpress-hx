# Port Philosophy

This is a complete porting program, not a typed wrapper layer over WordPress.

The long-term destination is Haxe-authored executable knowledge for WordPress/Gutenberg runtime logic and public adapter contracts, with generated PHP/TypeScript/JavaScript artifacts preserving the public ecosystem contracts. A typed compatibility layer is useful early, but only as scaffolding: it lets us inventory APIs, prove target semantics, generate ABI shells, run oracles, and move one vertical slice at a time.

PHP remains the required WordPress compatibility target, but it should be one generated adapter over Haxe-owned semantics and ABI metadata. We should not bury behavior or shell contracts in hand-written PHP/JavaScript runner strings, because that makes later retargeting to another runtime or language depend on reverse-engineering PHP scaffolding instead of reusing Haxe source.

PHP is privileged, not symmetric with future native targets. Unmodified plugins and themes execute in PHP and observe PHP engine semantics, so the current parity goal is PHP-hosted, Haxe-authored WordPress. Rust, WebAssembly, or another native runtime may later provide optional internal kernels or distinct execution profiles behind generated adapters and PHP fallbacks, but "Rust core", "WASM core", or any peer non-PHP adapter with ordinary PHP plugin compatibility is an explicit non-goal for the current parity milestone.

A later browser/WASM profile is worth preserving as a product option. The current reference candidate is `back2dos/wasmix`, which compiles a subset of Haxe to WebAssembly and keeps interop with Haxe/JavaScript straightforward. That makes it relevant to a possible WordPress Playground replacement or complement, but only after PHP-hosted parity identifies which semantics can leave PHP without breaking plugin, template, reference, callback, reflection, diagnostic, or filesystem behavior.

The more general long-term shape is multi-target WordPressHX. Haxe should let us keep first-party WordPress semantics in one typed source system and compile them to any target Haxe supports, or any target we can make Haxe support, when the target has enough runtime evidence. PHP compatibility is then a parallel adapter/runtime concern rather than a limitation on the semantic source. A native, WASM, JS, Go, Rust, CLI, static-export, or future custom target can execute eligible first-party behavior while third-party PHP plugins and themes continue to run through a PHP-hosted adapter, an embedded PHP engine, or a separately named compatibility mode.

Concrete future target references include `fullofcaffeine/reflaxe.go` for Go output and `fullofcaffeine/reflaxe.rust` for Rust output. A Go profile might be useful for service, worker, CLI, or static-export execution. A Rust profile might be useful for selected native providers or later runtime experiments. Both remain future profiles: they need explicit boundaries, fallback strategy, and compatibility evidence before they can support a WordPressHX claim.

This does not mean every WordPress behavior must become target-neutral. PHP-specific semantics remain PHP-specific. The portable portion should emerge from proven boundaries, not from speculative abstractions. A future non-PHP profile can be valuable even if it supports only a subset of plugin/theme behavior, as long as the claim names the profile honestly.

The useful split is:

- semantic ownership: Haxe owns migrated WordPress behavior;
- adapter-contract ownership: Haxe owns the PHP-visible ABI/effect contract;
- emission strategy: stock Haxe PHP, typed adapter IR, linker emitter, temporary import, or backend improvement;
- execution provider: PHP/Haxe-generated PHP now, optional native/WASM/custom target providers later;
- evidence level: fixture, bridge, installed differential, upstream suite, or ecosystem corpus.

## Bootstrap Layer vs. Destination

The initial typed layer should provide:

- exact public ABI facades;
- original-path shells;
- Haxe-owned metadata for adapter generation;
- typed access to PHP globals, arrays, references, hooks, includes, and templates;
- generated package/export/script-handle metadata;
- differential test harnesses and receipts.

It should not become a permanent thin wrapper around upstream PHP/JS implementations. Each wrapped upstream behavior needs an ownership state: external oracle, temporary bridge, scaffolded Haxe, Haxe parity candidate, or verified Haxe-owned. The machine-readable version of this policy is `manifests/schemas/ownership-manifest.schema.json`; the operating rules are in `docs/operations/ownership-state-model.md`.

## Fixing Smells

We should fix design smells when the evidence says the smell is real and the compatibility boundary is protected.

Before parity, fixes are allowed when they:

- do not change observable WordPress/Gutenberg behavior;
- reduce porting risk or repeated mistakes;
- make unsupported constructs explicit;
- improve deterministic generation or testing;
- are guarded by upstream/differential tests.

After a subsystem reaches parity, refactor tasks may improve internal design more aggressively while preserving public behavior. The rule is not "copy WordPress forever"; it is "capture behavior first, then improve behind tested boundaries."

## Practical Rule

Start with typed compatibility surfaces where WordPress's dynamic contract is dangerous to translate blindly. Use those surfaces to replace runtime logic with Haxe-owned implementations in small verified slices. Do not stop at wrappers unless a task records an approved temporary exception with a removal gate.

Preserve PHP where PHP semantics are observable. Use Haxe to own how that PHP is generated. Use native code or WASM only where PHP observability ends, or in a separately named profile that does not overclaim PHP-plugin compatibility.
