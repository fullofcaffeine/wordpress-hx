# WordPress Global Facade Generator

WPHX-204 introduces the deterministic generator for original-name PHP global function facades.

## Contract

- The WordPress PHP ABI manifest is the source of truth for public wrapper signatures.
- Haxe binding classes use `@:wp.global` metadata and compile through the WPHX-202 validator before wrappers are generated.
- Generated PHP wrappers preserve public ABI details at the edge: function name, parameter names, default values, variadic parameters, by-reference parameters, and by-reference returns.
- Haxe code stays behind the wrapper and receives forwarded PHP-native values.
- If a public by-reference parameter must be mutated, the binding spec declares how the wrapper assigns the returned Haxe value back into the referenced parameter.

## Fixture Tranche

The first generator tranche covers real WordPress Core entries:

- `add_filter` from `src/wp-includes/plugin.php`
- `apply_filters` from `src/wp-includes/plugin.php`
- `_wp_array_set` from `src/wp-includes/functions.php`

This intentionally spans ordinary default parameters, variadic forwarding, and a by-reference array parameter.

## Verification

Run:

```bash
npm run wp:facade:globals
npm run wp:facade:globals:check
```

The runner compiles the typed Haxe fixture, generates original distribution-path PHP wrappers, reflects those wrappers in PHP, and compares the reflection records to the ABI projection recorded in:

- `manifests/wp-facade/wphx-204-global-facades.v1.json`
- `receipts/wp-facade/wphx-204-global-facades.v1.json`
