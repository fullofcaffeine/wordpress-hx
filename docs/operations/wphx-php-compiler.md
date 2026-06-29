# WPHX PHP Compiler

`WPHX-COMP-PHP` starts the in-repo custom PHP emitter for WordPress-shaped public files. The intended long-term shape is a modern Reflaxe PHP compiler core plus a WordPress compatibility profile, not a WordPress-only text generator.

The compiler is a Haxe/Reflaxe module under `src/wphx/compiler/php`. It uses Reflaxe manual output so emitted file paths can be WordPress distribution paths such as `wp-includes/*.php`, not merely Haxe package paths. Reflaxe is loaded through the explicit classpath recorded in `toolchain.lock.json` and `upstream.lock.json`.

The current strategy, accepted after oracle review on 2026-06-29 and formalized in [ADR-013](../adr/ADR-013-wphx-php-adapter-ir-and-scope.md), is intentionally hybrid:

- stock Haxe PHP emits private Haxe implementation classes and remains the reference for stdlib/runtime behavior;
- WPHX PHP emits bounded WordPress original-path public adapter files;
- typed Haxe source, metadata, Adapter IR, and manifests are the durable asset, not generated PHP strings.

When WPHX public adapters bootstrap stock Haxe PHP implementation classes, that bootstrap is governed by [ADR-014](../adr/ADR-014-haxe-php-bootstrap-lifecycle.md). It is request-state behavior, not invisible plumbing: include path mutation, SPL autoloaders, `php.Boot::__hx__init()`, mbstring encoding, error handling, source maps, and stack traces need explicit evidence before broad distribution claims.

Do not assume stock Haxe PHP can directly generate public WordPress Core files with the ABI, file topology, reference behavior, warning behavior, stack traces, and include timing modern WordPress requires. Public WordPress files must pass WPHX public-shell gates. Conversely, do not expand WPHX PHP into a full backend unless minimized evidence shows the hybrid cannot preserve required behavior.

Use the native Haxe PHP generator and `std/php` sources in `../haxe.compilerdev.reference/haxe` as an implementation oracle for generic, borrowable lowering/runtime behavior when useful. That reference can guide what to reuse or adapt; WordPress public ABI, original path topology, declaration timing, and ecosystem-visible behavior still require WordPress oracle fixtures and WPHX public-shell evidence.

When a feature is admitted, decide whether it belongs in the reusable PHP compiler core or the WordPress profile. Generic expression lowering, loops, conditionals, calls, object construction, arrays, casts, std/php interop, and idiomatic PHP formatting belong in the reusable core. Original WordPress paths, pluggable declaration timing, public ABI manifests, and compatibility-host profile adapters belong in the WordPress profile.

## Current Invocation

```bash
npm run wphx:php:smoke
npm run wphx:php:smoke:check
npm run wphx:php:f1
npm run wphx:php:f1:check
npm run wphx:php:f4
npm run wphx:php:f4:check
npm run wphx:php:byref-arg
npm run wphx:php:byref-arg:check
npm run wphx:php:wp-http-build-cookie-header
npm run wphx:php:wp-http-build-cookie-header:check
npm run wphx:php:wp-http-process-headers
npm run wphx:php:wp-http-process-headers:check
npm run wphx:php:public-shell-snapshots
npm run wphx:php:public-shell-snapshots:check
npm run wphx:php:pluggable-timing
npm run wphx:php:pluggable-timing:check
npm run wphx:php:wp-http-parser-helpers
npm run wphx:php:wp-http-parser-helpers:check
npm run wphx:php:wp-http-chunk-transfer-decode
npm run wphx:php:wp-http-chunk-transfer-decode:check
```

The smoke fixture compiles with:

```bash
haxe fixtures/wphx-php/smoke.hxml
```

The HXML enables:

- `--macro wphx.compiler.php.CompilerInit.Start()`
- `-D wphx_php_output=build/wphx-php/smoke`
- `-D wphx_php_manifest=build/wphx-php/smoke/wphx-php-emission.v1.json`
- `-D wphx_php_profile=wordpress`

The F1 facade driver compiles the stock Haxe fixture implementation plus a compiler-emitted shell:

```bash
haxe fixtures/wphx-php/f1-facade.hxml
```

It emits `build/wphx-php/f1/generated/wp-includes/plugin.php`, lints that PHP, runs the same reflection and behavior probe as the F1 oracle path, and verifies the manifest records `global-function:add_filter`.

The F4 facade driver emits the public interface/base-class/class shell:

```bash
haxe fixtures/wphx-php/f4-public-class.hxml
```

It emits `build/wphx-php/f4/generated/wp-includes/class-wphx-public-class.php`, lints that PHP, runs the same reflection and object-behavior probe as the F4 oracle path, and verifies the manifest records `interface:WPHX_Public_Interface`, `class:WPHX_Public_Base`, and `class:WPHX_Public_Class`.

The by-reference ABI driver compiles a small original-path global-function fixture:

```bash
haxe fixtures/wphx-php/byref-arg.hxml
```

It emits `build/wphx-php/byref-arg/generated/wp-includes/wphx-byref.php`, lints that PHP, verifies PHP reflection sees `&$value`, verifies the neighboring default parameter remains intact, and executes the generated function to prove the caller variable mutates through the reference. This is a generic compiler step toward WordPress helpers such as `WP_Http::buildCookieHeader( &$r )`, not a claim over that helper yet.

The first generated `WP_Http::buildCookieHeader( &$r )` driver compiles a stock Haxe PHP helper plus a WPHX original-path public shell:

```bash
haxe fixtures/wphx-php/wp-http-build-cookie-header-impl.hxml
haxe fixtures/wphx-php/wp-http-build-cookie-header.hxml
```

The runner emits `build/wp-core/wphx-comp-php-06/generated/wp-includes/class-wp-http.php`, lints that PHP, verifies PHP reflection sees `&$r`, compares against the copied WordPress oracle for caller native-array mutation, scalar-to-`WP_Http_Cookie` upgrading, object preservation, `wp_http_cookie_value` filter payload/timing, final Cookie header order, and verifies the WPHX PHP manifest records `class:WP_Http` with no unsupported constructs. `WPHX-COMP-PHP-CORE-IR-NATIVE-ARRAYS` promotes the underlying method body constructs into reusable PHP-core IR/printer nodes for `if`, `foreach`, native array reads and writes, array casts, long array literals, object construction, local variables, assignments, function calls, method calls, and static calls. The WordPress profile still selects the public ABI boundary shape; the body is no longer a durable WordPress-only PHP string template.

The first generated `WP_Http::processHeaders( $headers, $url = '' )` driver compiles a stock Haxe PHP helper plus a WPHX original-path public shell:

```bash
haxe fixtures/wphx-php/wp-http-process-headers-impl.hxml
haxe fixtures/wphx-php/wp-http-process-headers.hxml
```

The runner emits `build/wp-core/wphx-comp-php-07/generated/wp-includes/class-wp-http.php`, lints that PHP, verifies PHP reflection sees `processHeaders($headers, $url = '')`, compares against the copied WordPress oracle for final response block selection, folded-header unfolding, duplicate header arrays, `Set-Cookie` conversion to `WP_Http_Cookie`, native return shape, and empty/falsey input shape, and verifies the WPHX PHP manifest records `class:WP_Http` with no unsupported constructs. The WordPress profile still owns the public ABI/native-array boundary; scalar status/header line decisions delegate to module-level Haxe helpers.

The first WordPress Core public-method driver reuses the WPHX-312.61 chunk-transfer fixture:

```bash
haxe fixtures/wphx-php/wp-http-chunk-transfer-decode.hxml
```

The runner emits `build/wp-core/wphx-312-61/generated/wp-includes/class-wp-http.php`, lints that PHP, runs the existing WPHX-312.61 oracle/candidate probe, and verifies the WPHX PHP manifest records `class:WP_Http` with no unsupported constructs.

The first grouped WordPress Core public-method driver reuses the WPHX-312.60 process-response runner and compiles a shared parser-helper facade:

```bash
haxe fixtures/wphx-php/wp-http-parser-helpers.hxml
```

The runner emits `build/wp-core/wphx-312-60/generated/wp-includes/class-wp-http.php` with `WP_Http::processResponse`, `WP_Http::chunkTransferDecode`, and protected `WP_Http::parse_url`, lints that PHP, runs oracle/candidate probes for all three helper cases, and verifies the WPHX PHP manifest records `class:WP_Http` with no unsupported constructs. This is the current model for replacing copied or JS-patched PHP shells with compiler-emitted original-path adapters while keeping stock Haxe PHP responsible for runtime implementation classes and stdlib behavior.

The public-shell snapshot lane compiles representative WPHX PHP fixtures twice from clean roots:

```bash
npm run wphx:php:public-shell-snapshots
npm run wphx:php:public-shell-snapshots:check
```

It records `manifests/wphx-php/public-shell-snapshots.v1.json` and `receipts/compiler/wphx-comp-php-public-shell-snapshots.v1.json` with `evidence_class=generated_shape`. The lane checks byte stability, `php -l`, exact selected shell excerpts, AST-normalized declarations, and empty unsupported manifests for global functions, public class/interface shells, protected methods, by-reference parameters, conditional declarations, native-array mutation shells, and top-level bootstrap side effects. This is source-shape evidence only; behavior parity still comes from each focused oracle/candidate runner. Arbitrary include-return and direct file-scope script emission remain tracked separately by the include side-effect fixture work.

The pluggable timing fixture compiles a minimized original-path guarded global-function file:

```bash
haxe fixtures/wphx-php/pluggable-timing.hxml
npm run wphx:php:pluggable-timing
npm run wphx:php:pluggable-timing:check
```

It emits `build/wphx-php/pluggable-timing/generated/wp-includes/pluggable.php`, lints that PHP, verifies exact `function_exists` guards, verifies `function_exists` before/after `require`, proves repeated `require` safety, proves a pre-defined function wins over the generated guarded declaration while a neighboring generated declaration still loads, checks reflection-visible defaults and reference/variadic flags, and records `manifests/wphx-php/pluggable-timing.v1.json` plus `receipts/compiler/wphx-comp-php-conditionals.v1.json`. This is a WPHX conditional-declaration/load-timing gate; it does not claim WordPress Core `pluggable.php` ownership.

## Adapter IR

The WPHX PHP compiler now uses an Adapter IR before printing PHP:

```text
typed Haxe source and metadata
  -> WPHX Adapter IR file/declaration plans
  -> deterministic original-path PHP adapter printer
  -> wphx-php-emission.v1.json
```

The v0 IR in `src/wphx/compiler/php/WphxPhpCompiler.hx` covers the proven public-shell shapes: original-path files, guarded global functions, classes/interfaces, methods, properties, constants, Haxe bootstrap markers, protected methods, by-reference parameters, and manifest declarations. The first reusable PHP-core method-body nodes now cover `if`/`else`, `for`, `foreach`, `break`, `continue`, `return`, native array reads/writes/appends, array casts, int/string casts, long array literals, object construction, local variables, assignments, function calls, method calls, and static calls. The emission manifest records these as `core_ir_features` so richer adapters can depend on them explicitly.

This IR is deliberately narrower than a full PHP backend. Add new nodes only when a fixture or WordPress slice needs them, and pair each addition with generated-shape, static/runtime ABI, behavior, and receipt evidence as appropriate. The next expected pressure is grouping neighboring generated `WP_Http` adapters, a bootstrap lifecycle ADR, and include-time side-effect/script nodes.

`WPHX-COMP-PHP.06` adds the first generated `WP_Http::buildCookieHeader( &$r )` original-path shell. It is a WordPress profile pressure gate over native PHP array mutation, scalar cookie upgrading, `WP_Http_Cookie` object preservation, filter timing, and helper delegation. `WPHX-COMP-PHP-CORE-IR-NATIVE-ARRAYS` keeps the same public-shell behavior while moving the native-array body through reusable PHP-core IR nodes. This is still not arbitrary Haxe expression lowering or a complete PHP backend.

## First Contract

The initial metadata contract is intentionally small:

- `@:wp.file("wp-includes/name.php")` selects the generated PHP output path.
- `@:wp.global("function_name")` emits a module-level Haxe function as a global PHP function.
- `@:native("Class_Name")` emits an annotated Haxe class with that public PHP class name.
- `@:wp.ifMissing` wraps generated functions/classes in `function_exists` or `class_exists(..., false)` guards.
- `@:wp.haxeBootstrap("CONSTANT_NAME")` emits a guarded stock Haxe PHP runtime bootstrap for facade shells that delegate to Haxe-generated implementation classes. ADR-014 makes this acceptable for bounded fixtures and leaf candidates, but broad public-shell distribution claims still require include-path/autoload, warning/error-handler, and stack-trace/source-map probes.
- `@:wp.order(n)` orders multiple declarations that share one generated PHP file.
- `@:wp.const` emits a static field as a PHP class constant.
- `@:wp.byRef` emits a PHP `&$parameter` for reference-visible ABI boundaries.
- `@:wp.visibility("protected")`, `@:wp.name("name")`, and `@:wp.defaultArray` preserve PHP reflection-visible class/member/static-method/parameter ABI when Haxe's source-level spelling differs.

The emitter also writes `wphx-php-emission.v1.json` with generated paths, declarations, source modules, hashes-by-runner evidence, and unsupported construct notes.

## Scope

This is not yet a full PHP backend. The first verified behavior is global functions, by-reference parameters, public interfaces/classes, inheritance/implements, constants, constructors, instance/static methods, public/protected/static properties, simple expressions, facade/bootstrap delegation, bounded WordPress Core public-method adapters, PHP lint, and PHP execution. New language features should be added only when a facade, linker, or WordPress driver fixture needs them.

The generator should reuse or adapt Haxe stdlib and stock PHP target behavior wherever practical, using `../haxe.compilerdev.reference/haxe` as the reference for std/php lowering. WordPress-specific metadata and lowering are acceptable for original paths, conditional declarations, reflection-visible ABI, native PHP array boundaries, and plugin/theme compatibility, but they should remain named and bounded rather than becoming a parallel reimplementation of the Haxe PHP target.

The next target gate is expanding grouped original-path adapters beyond parser leaf helpers toward richer public ABI shapes such as references, conditional declarations, and neighboring header/cookie helpers. The full `WP_Http::request` method remains deliberately later.
