# WordPress Hook Surface

WPHX-302 records the first complete hook/plugin API surface gate for `plugin.php` and
`class-wp-hook.php`.

## Contract

- The oracle is the locked WordPress 7.0 checkout at `../wordpress-develop`.
- The expected symbols come from `manifests/php-abi/wordpress-7.0-core-abi.v1.json`.
- The generated side reuses the F7 hook kernel fixture and original-path generated files.
- The probe reflects every function, class, method, and property in the hook workset.
- The behavior fixture compares deprecated hooks, ref-array actions, remove-all helpers,
  plugin path helpers, activation/deactivation hooks, and uninstall hook registration.

## Ownership

The ownership manifest intentionally marks this workset as a `temporary_bridge`. Hook
callbacks, references, globals, and plugin lifecycle helpers remain PHP-observable. This
gate proves compatibility while later source-unit work can move the hook kernel toward
`haxe_parity_candidate` ownership.

## Verification

Run:

```bash
npm run wp:hooks:surface
npm run wp:hooks:surface:check
```

Evidence is recorded in:

- `manifests/wp-hooks/wphx-302-hook-surface.v1.json`
- `manifests/ownership/wphx-302-hooks-workset.v1.json`
- `receipts/wp-hooks/wphx-302-hook-surface.v1.json`

## WPHX-303 Candidate Model

WPHX-303 adds a typed Haxe parity-candidate model for hook decisions that can be
tested without copying the generated PHP shell into `php.Syntax.code` strings. The
candidate covers priority ordering/removal, current hook stack checks, filter/action
counters, callback arity decisions, and plugin basename/lifecycle hook names.

The public `plugin.php` and `class-wp-hook.php` shell remains a bounded bridge until
WPHX-304 can replace PHP-observable callback/reference/global behavior with typed Haxe
runtime boundaries while keeping generated PHP idiomatic for existing plugins.

Run:

```bash
npm run wp:hooks:parity-candidate
npm run wp:hooks:parity-candidate:check
```

Evidence is recorded in:

- `manifests/wp-hooks/wphx-303-hook-parity-candidate.v1.json`
- `manifests/ownership/wphx-303-hooks-decision-model.v1.json`
- `receipts/wp-hooks/wphx-303-hook-parity-candidate.v1.json`

## WPHX-304 Runtime Boundary

WPHX-304 moves bounded hook shell decisions into shared typed Haxe runtime code in
`src/wphx/wp/hooks/HookRuntime.hx`. The generated public PHP shell delegates priority
normalization, counter increments, dispatch arity decisions, filter/action value-write
decisions, default action args, plugin basename trimming, lifecycle hook names, and
plugin realpath registration decisions through the typed facade.

The shell intentionally keeps PHP-native callbacks, by-reference arrays, globals,
reflection-visible declarations, and include timing at the public boundary. WPHX-305 owns
moving the remaining broad PHP shell emission out of the JavaScript template and into
Haxe-owned source, a macro/emitter, a generic Haxe PHP backend improvement, or an
ADR-approved Reflaxe/custom PHP target.

Run:

```bash
npm run wp:hooks:runtime-boundary
npm run wp:hooks:runtime-boundary:check
```

Evidence is recorded in:

- `manifests/wp-hooks/wphx-304-hook-runtime-boundary.v1.json`
- `manifests/ownership/wphx-304-hooks-runtime-boundary.v1.json`
- `receipts/wp-hooks/wphx-304-hook-runtime-boundary.v1.json`
