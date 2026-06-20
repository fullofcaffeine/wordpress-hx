# PHP ABI Extraction

WPHX-201 defines the first canonical WordPress PHP ABI manifest:

- `manifests/php-abi/wordpress-7.0-core-abi.v1.json`
- `receipts/php-abi/wphx-201-php-abi-extractor.v1.json`

Run:

```bash
npm run php:abi
npm run php:abi:check
```

The extractor uses the locked WordPress 7.0.0 source inventory and selects PHP files under `src/` from `../wordpress-develop`. It parses with the `php-parser` AST package and records functions, classes, interfaces, traits, methods, class constants, properties, and `const`/`define()` constants.

Each ABI entry includes the source unit, distribution path, source location, declaration timing, enclosing load segments, parameter/default source, reference/variadic flags, return/type source, and stable source/signature hashes.

Three parser recoveries are expected in the locked baseline:

- `src/wp-includes/Text/Diff.php` uses legacy `clone(...)` syntax.
- `src/wp-includes/load.php` uses legacy `clone(...)` syntax.
- `src/wp-includes/php-compat/readonly.php` declares a deprecated `readonly()` compatibility function that is only included on PHP versions where `readonly` is not reserved.

Recoveries are not fatal because the AST still exposes the declarations needed for the ABI manifest. Fatal parse failures remain `parse_errors` and fail `npm run php:abi`.
