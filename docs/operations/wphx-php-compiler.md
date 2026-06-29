# WPHX PHP Compiler

`WPHX-COMP-PHP` starts the in-repo custom PHP emitter for WordPress-shaped public files.

The compiler is a Haxe/Reflaxe module under `src/wphx/compiler/php`. It uses Reflaxe manual output so emitted file paths can be WordPress distribution paths such as `wp-includes/*.php`, not merely Haxe package paths. Reflaxe is loaded through the explicit classpath recorded in `toolchain.lock.json` and `upstream.lock.json`.

## Current Invocation

```bash
npm run wphx:php:smoke
npm run wphx:php:smoke:check
npm run wphx:php:f1
npm run wphx:php:f1:check
npm run wphx:php:f4
npm run wphx:php:f4:check
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

## First Contract

The initial metadata contract is intentionally small:

- `@:wp.file("wp-includes/name.php")` selects the generated PHP output path.
- `@:wp.global("function_name")` emits a module-level Haxe function as a global PHP function.
- `@:native("Class_Name")` emits an annotated Haxe class with that public PHP class name.
- `@:wp.ifMissing` wraps generated functions/classes in `function_exists` or `class_exists(..., false)` guards.
- `@:wp.haxeBootstrap("CONSTANT_NAME")` emits a guarded stock Haxe PHP runtime bootstrap for facade shells that delegate to Haxe-generated implementation classes.
- `@:wp.order(n)` orders multiple declarations that share one generated PHP file.
- `@:wp.const` emits a static field as a PHP class constant.
- `@:wp.visibility("protected")`, `@:wp.name("name")`, and `@:wp.defaultArray` preserve PHP reflection-visible class/member/parameter ABI when Haxe's source-level spelling differs.

The emitter also writes `wphx-php-emission.v1.json` with generated paths, declarations, source modules, hashes-by-runner evidence, and unsupported construct notes.

## Scope

This is not yet a full PHP backend. The first verified behavior is global functions, public interfaces/classes, inheritance/implements, constants, constructors, instance/static methods, public/protected/static properties, simple expressions, facade bootstrap delegation, PHP lint, and PHP execution. New language features should be added only when a facade, linker, or WordPress driver fixture needs them.

The generator should reuse or adapt Haxe stdlib and stock PHP target behavior wherever practical, using `../haxe.compilerdev.reference/haxe` as the reference for std/php lowering. WordPress-specific metadata and lowering are acceptable for original paths, conditional declarations, reflection-visible ABI, native PHP array boundaries, and plugin/theme compatibility, but they should remain named and bounded rather than becoming a parallel reimplementation of the Haxe PHP target.

The next target gate is a small WPHX-312 public-method replacement such as `WP_Http::chunkTransferDecode`; the full `WP_Http::request` method is deliberately not the first compiler driver.
