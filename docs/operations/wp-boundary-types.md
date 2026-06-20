# WordPress Native Boundary Types

WPHX-203 defines the first reusable boundary helpers for Haxe-owned WordPress code that still has to present exact native PHP behavior.

## Contract

- Haxe owns reusable helpers in `src/wphx/wp/boundary`.
- Original-path PHP shells own public PHP ABI details that Haxe cannot express directly, especially by-reference procedural signatures.
- WordPress-shaped PHP values stay native at the public edge: associative arrays are PHP arrays, callbacks are PHP callables, globals use `$GLOBALS`, and `WP_Error` remains a PHP object shape.
- Generated facades should call these helpers instead of adding one-off PHP snippets for every function.

## Covered Boundaries

- `NativeArray` keeps JSON-decoded seed data and PHP array inspection native.
- `Globals` reads and writes `$GLOBALS` without converting it into Haxe collections.
- `CallableValue` dispatches PHP callables through `call_user_func` and `call_user_func_array`.
- `ReferenceBoundary` provides Haxe-owned value transformations while the PHP shell preserves `&` signatures.
- `WpErrorValue` inspects `WP_Error`-style native objects without wrapping them in a Haxe-only class.

## Verification

Run:

```bash
npm run wp:boundary
npm run wp:boundary:check
```

The runner compiles `fixtures/wp-boundary/boundary-types.hxml`, emits a generated WordPress-style PHP shell, compares it to `fixtures/wp-boundary/oracle/boundary-types.php`, and records the result in:

- `manifests/wp-boundary/wphx-203-boundary-types.v1.json`
- `receipts/wp-boundary/wphx-203-boundary-types.v1.json`
