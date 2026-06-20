# PHP Facade Fixtures

The PHP facade fixtures prove how Haxe-owned implementation code can be exposed through WordPress-shaped global PHP files without asking the stock Haxe PHP target to emit procedural WordPress files directly.

## F1 Global Function

WPHX-102 owns the first facade fixture:

```bash
npm run php:facade:f1
npm run php:facade:f1:check
```

The fixture compiles Haxe implementation code from `fixtures/php-facade/src` and generates an original-path shell at `build/php-facade/generated/wp-includes/plugin.php`. The generated shell conditionally declares `add_filter( $hook_name, $callback, $priority = 10, $accepted_args = 1 )` and forwards to the Haxe `FacadeKernel`.

The oracle shell is `fixtures/php-facade/oracle/add-filter.php`. The probe compares both shells in separate PHP processes so the global `add_filter` name remains realistic without colliding inside the test process.

The committed snapshot is `manifests/php-facade/wphx-102-f1-global-function.v1.json`. It records:

- generated Haxe PHP file digests;
- generated shell and probe digests;
- local PHP plus pinned Docker PHP 8.4/8.5 runs;
- conditional function availability before and after shell load;
- reflection evidence for parameter names, defaults, required count, return type, by-reference flags, and variadic flags;
- behavior parity for a first `add_filter` call.

This fixture intentionally does not implement the full WordPress hook kernel. WPHX-108 owns hook trace parity after references, native globals, class contracts, and include/load behavior are proven.

## F2 References

WPHX-103 owns the reference-boundary fixture:

```bash
npm run php:facade:f2
npm run php:facade:f2:check
```

The fixture compares an oracle PHP shell with a generated Haxe-backed shell for:

- by-reference parameters, using `wphx_reference_param( &$value, $suffix = '-ref' )`;
- by-reference returns, using `&wphx_reference_return()`;
- callback invocation with a by-reference argument.

The generated shell still owns the exact procedural PHP reference ABI. Haxe owns the value transformation behind that boundary. This is the current intended shape for WordPress APIs that require PHP references: preserve exact PHP signatures in original-path shells, then cross into Haxe-owned implementation code where the values are no longer references.

The committed snapshot is `manifests/php-facade/wphx-103-f2-references.v1.json`.

## F3 Native Values and Globals

WPHX-104 owns the native values/global fixture:

```bash
npm run php:facade:f3
npm run php:facade:f3:check
```

The fixture compares an oracle PHP shell with a generated Haxe-backed shell for:

- `$GLOBALS` option storage;
- `$_SERVER`-shaped superglobal state;
- `array_key_exists` versus `isset` behavior for `null`;
- `false`, `"0"`, and empty-string distinctions;
- native PHP list/associative arrays and key order;
- callback value flow.

The generated shell decodes Haxe-provided seed JSON into native PHP arrays before exposing values through globals. That keeps WordPress-facing state PHP-native while allowing Haxe to own canonical seed/normalization logic behind the boundary.

The committed snapshot is `manifests/php-facade/wphx-104-f3-native-values.v1.json`.
