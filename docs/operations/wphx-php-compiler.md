# WPHX PHP Compiler

`WPHX-COMP-PHP` starts the in-repo custom PHP compiler for WordPress-shaped public files. The intended long-term shape is a modern Reflaxe PHP compiler core plus a WordPress compatibility profile, not a WordPress-only text generator.

The compiler is a Haxe/Reflaxe module under `src/wphx/compiler/php`. It uses Reflaxe manual output so emitted file paths can be WordPress distribution paths such as `wp-includes/*.php`, not merely Haxe package paths. Reflaxe is loaded through the explicit classpath recorded in `toolchain.lock.json` and `upstream.lock.json`.

`WphxPhpCompiler.hx` owns the generic Adapter IR collection, PHP-core statement/expression IR, file/segment planning, bootstrap printing, manifest writing, and PHP printer behavior. WordPress-specific method adapter bodies live behind the `WphxPhpWordPressAdapters.hx` profile registry. That registry maps bounded `@:wp.adapter(...)` names such as `wp-http-process-headers` or `wp-http-validate-redirects` to PHP-core IR plans plus required feature declarations. This keeps the current WordPress ABI pressure explicit while preventing the compiler core from becoming a pile of `WP_Http` method bodies.

The current strategy, accepted after oracle review on 2026-06-29 and formalized in [ADR-013](../adr/ADR-013-wphx-php-adapter-ir-and-scope.md), is a staged custom compiler strategy:

- stock Haxe PHP emits private Haxe implementation classes and remains the reference for stdlib/runtime behavior;
- WPHX PHP is the custom compiler lane and currently emits bounded WordPress original-path public adapter files;
- typed Haxe source, metadata, Adapter IR, and manifests are the durable asset, not generated PHP strings.

When WPHX public adapters bootstrap stock Haxe PHP implementation classes, that bootstrap is governed by [ADR-014](../adr/ADR-014-haxe-php-bootstrap-lifecycle.md). It is request-state behavior, not invisible plumbing: include path mutation, SPL autoloaders, `php.Boot::__hx__init()`, mbstring encoding, error handling, source maps, and stack traces need explicit evidence before broad distribution claims.

Do not assume stock Haxe PHP can directly generate public WordPress Core files with the ABI, file topology, reference behavior, warning behavior, stack traces, and include timing modern WordPress requires. Public WordPress files must pass WPHX public-shell gates. Conversely, do not flip WPHX PHP into a full arbitrary-Haxe backend until minimized evidence shows the staged Adapter IR path has accumulated backend-scale pressure and a later ADR accepts that promotion.

Use the native Haxe PHP generator and `std/php` sources in `../haxe.compilerdev.reference/haxe` as an implementation oracle for generic, borrowable lowering/runtime behavior when useful. That reference can guide what to reuse or adapt; WordPress public ABI, original path topology, declaration timing, and ecosystem-visible behavior still require WordPress oracle fixtures and WPHX public-shell evidence.

Copied, transformed, hand-authored, or JS-patched public PHP shells are bridge mechanisms only. The shell-retirement states in [ownership-state-model.md](ownership-state-model.md) define which claims are allowed for `bridge_shell`, `generated_helper_with_temporary_shell`, `compiler_emitted_original_path_shell`, `durable_public_adapter`, and `whole_file_owned`. Durable public PHP claims must cite compiler-emitted original-path shell evidence, durable adapter evidence, whole-file evidence, or an accepted backend/custom-target improvement.

When a feature is admitted, decide whether it belongs in the reusable PHP compiler core or the WordPress profile. Generic expression lowering, loops, conditionals, calls, object construction, arrays, casts, std/php interop, and idiomatic PHP formatting belong in the reusable core. Original WordPress paths, pluggable declaration timing, public ABI manifests, and compatibility-host profile adapters belong in the WordPress profile. Design new annotations, ABI manifests, and Adapter IR nodes as if a future full WPHX PHP backend or extracted `reflaxe.php` target will consume them, so Haxe source does not need to change when the compiler broadens.

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
npm run wphx:php:wp-http-grouped-helpers
npm run wphx:php:wp-http-grouped-helpers:check
npm run wphx:php:public-shell-snapshots
npm run wphx:php:public-shell-snapshots:check
npm run wphx:php:pluggable-timing
npm run wphx:php:pluggable-timing:check
npm run wphx:php:bootstrap-autoload
npm run wphx:php:bootstrap-autoload:check
npm run wphx:php:bootstrap-error-handler
npm run wphx:php:bootstrap-error-handler:check
npm run wphx:php:bootstrap-debug
npm run wphx:php:bootstrap-debug:check
npm run wphx:php:include-side-effects
npm run wphx:php:include-side-effects:check
npm run wphx:php:template-segment-model
npm run wphx:php:template-segment-model:check
npm run wphx:php:template-segment-admin-style
npm run wphx:php:template-segment-admin-style:check
npm run wphx:php:template-segment-nested
npm run wphx:php:template-segment-nested:check
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

The grouped `WP_Http` helper driver compiles the stock Haxe PHP helper implementation plus one WPHX original-path public shell containing all currently proven parser/header/cookie/IP/redirect helper adapters:

```bash
haxe fixtures/wphx-php/wp-http-grouped-helpers-impl.hxml
haxe fixtures/wphx-php/wp-http-grouped-helpers.hxml
```

The runner emits `build/wp-core/wphx-comp-php-group-wp-http/generated/wp-includes/class-wp-http.php` with `WP_Http::processResponse`, `WP_Http::chunkTransferDecode`, protected `WP_Http::parse_url`, `WP_Http::buildCookieHeader( &$r )`, `WP_Http::processHeaders( $headers, $url = '' )`, `WP_Http::is_ip_address( $maybe_ip )`, `WP_Http::browser_redirect_compatibility( ..., &$options, $original )`, and `WP_Http::validate_redirects( $location )` in a single generated `WP_Http` class. It lints the generated PHP, verifies there is exactly one `class WP_Http`, verifies the WordPress non-throwing bootstrap profile, checks reflection-visible by-reference/default/protected method ABI, compares oracle/candidate behavior for all eight helper cases, confirms parser delegation, native-array header/cookie IR usage, direct IP helper delegation, object-property reads, class constants, by-reference redirect option mutation, boolean coercion, and Requests exception throwing, and records `class:WP_Http` with `unsupported=[]`. It does not claim whole-file `WP_Http`, `WP_Http::request`, live HTTP transport, installed distribution behavior, generated `WP_Http_Cookie`, or mixed-template ownership.

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

`WPHX-COMP-PHP-RETIRE-WP-HTTP-PARSE-URL-TEMP-SHELL` applies that model to the existing WPHX-312.64 protected `WP_Http::parse_url` Haxe candidate. The WPHX-312.64 runner now compiles `fixtures/wphx-php/wp-http-parser-helpers.hxml`, installs the compiler-emitted grouped `wp-includes/class-wp-http.php` shell into the candidate package, verifies `protected static function parse_url($url)` is present, verifies the WPHX emission manifest records `class:WP_Http` with `unsupported=[]`, and then reuses the original oracle/candidate behavior probe. That retires the copied/runner-patched public shell for this boundary; it still does not claim whole-file `WP_Http`, `wp_parse_url` internals, installed distribution behavior, or broad request ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-PROCESS-HEADERS-TEMP-SHELL` applies the same retirement pattern to WPHX-312.62. The WPHX-312.62 runner now compiles `fixtures/wphx-php/wp-http-grouped-helpers.hxml` into an isolated per-run build root, installs the compiler-emitted grouped `wp-includes/class-wp-http.php` shell into the candidate package, verifies `public static function processHeaders($headers, $url = '')` is present, verifies the WPHX emission manifest records `class:WP_Http` with `unsupported=[]`, and then reuses the existing oracle/candidate behavior probe for final response selection, folded headers, duplicate headers, `Set-Cookie` conversion, and native return shape. That retires the copied/runner-patched public shell for this boundary; it still does not claim whole-file `WP_Http`, `WP_Http::request`, installed distribution behavior, or broader live transport ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-BUILD-COOKIE-HEADER-TEMP-SHELL` applies the same retirement pattern to WPHX-312.63. The WPHX-312.63 runner now compiles `fixtures/wphx-php/wp-http-grouped-helpers.hxml` into an isolated per-run build root, installs the compiler-emitted grouped `wp-includes/class-wp-http.php` shell into the candidate package, verifies `public static function buildCookieHeader(&$r)` is present, verifies the WPHX emission manifest records `class:WP_Http` with `unsupported=[]`, and then reuses the existing oracle/candidate behavior probe for caller array mutation, scalar cookie upgrading, object preservation, filter payloads, and final Cookie header order. That retires the copied/runner-patched public shell for this boundary; it still does not claim whole-file `WP_Http`, `WP_Http::request`, installed distribution behavior, or broader live transport ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-IS-IP-ADDRESS-TEMP-SHELL` applies the same retirement pattern to WPHX-312.55. The WPHX-312.55 runner now compiles `fixtures/wphx-php/wp-http-grouped-helpers.hxml` into an isolated per-run build root, installs the compiler-emitted grouped `wp-includes/class-wp-http.php` shell into the candidate package, verifies `public static function is_ip_address($maybe_ip)` is present, verifies the WPHX emission manifest records `class:WP_Http` with `unsupported=[]`, and then reuses the existing oracle/candidate behavior probe for IPv4, IPv6, bracketed IPv6, hostname false, and regex-shaped invalid IPv4 behavior. That retires the copied/runner-patched public shell for this boundary; it still does not claim whole-file `WP_Http`, `WP_Http::request`, installed distribution behavior, live transport ownership, or broader helper ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-BROWSER-REDIRECT-COMPAT-TEMP-SHELL` applies the same retirement pattern to WPHX-312.56. The WPHX-312.56 runner now compiles `fixtures/wphx-php/wp-http-grouped-helpers.hxml` into an isolated per-run build root, installs the compiler-emitted grouped `wp-includes/class-wp-http.php` shell into the candidate package, verifies `public static function browser_redirect_compatibility($location, $headers, $data, &$options, $original)` is present, verifies the WPHX emission manifest records `class:WP_Http` with `unsupported=[]`, and then reuses the existing oracle/candidate behavior probe for 302 POST-to-GET and 301 preservation behavior. That retires the copied/runner-patched public shell for this boundary; it still does not claim whole-file `WP_Http`, `WP_Http::request`, installed distribution behavior, live transport ownership, or broader redirect helper ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REDIRECT-VALIDATION-TEMP-SHELL` applies the same retirement pattern to WPHX-312.57. The WPHX-312.57 runner now compiles `fixtures/wphx-php/wp-http-grouped-helpers.hxml` into an isolated per-run build root, installs the compiler-emitted grouped `wp-includes/class-wp-http.php` shell into the candidate package, verifies `public static function validate_redirects($location)` is present, verifies the WPHX emission manifest records `class:WP_Http` with `unsupported=[]`, and then reuses the existing oracle/candidate behavior probe for safe URL no-throw behavior and invalid URL Requests exception class/message/type. That retires the copied/runner-patched public shell for this boundary; it still does not claim whole-file `WP_Http`, `WP_Http::request`, installed distribution behavior, live transport ownership, absolute URL resolution, redirect following, or broader redirect helper ownership.

The public-shell snapshot lane compiles representative WPHX PHP fixtures twice from clean roots:

```bash
npm run wphx:php:public-shell-snapshots
npm run wphx:php:public-shell-snapshots:check
```

It records `manifests/wphx-php/public-shell-snapshots.v1.json` and `receipts/compiler/wphx-comp-php-public-shell-snapshots.v1.json` with `evidence_class=generated_shape`. The lane checks byte stability, `php -l`, exact selected shell excerpts, AST-normalized declarations, empty unsupported manifests, and compiler-emitted `segment_plans` contracts for the direct-script and template-segment cases. It covers global functions, public class/interface shells, protected methods, by-reference parameters, conditional declarations, native-array mutation shells, top-level bootstrap side effects, a bounded include-return/direct file-scope script fixture, the first compiler-emitted template segment shell, and the first nested template segment shell. This is source-shape evidence only; behavior parity still comes from each focused oracle/candidate runner.

The pluggable timing fixture compiles a minimized original-path guarded global-function file:

```bash
haxe fixtures/wphx-php/pluggable-timing.hxml
npm run wphx:php:pluggable-timing
npm run wphx:php:pluggable-timing:check
```

It emits `build/wphx-php/pluggable-timing/generated/wp-includes/pluggable.php`, lints that PHP, verifies exact `function_exists` guards, verifies `function_exists` before/after `require`, proves repeated `require` safety, proves a pre-defined function wins over the generated guarded declaration while a neighboring generated declaration still loads, checks reflection-visible defaults and reference/variadic flags, and records `manifests/wphx-php/pluggable-timing.v1.json` plus `receipts/compiler/wphx-comp-php-conditionals.v1.json`. This is a WPHX conditional-declaration/load-timing gate; it does not claim WordPress Core `pluggable.php` ownership.

The bootstrap include-path/autoload fixture compiles stock Haxe PHP implementation code plus two WPHX original-path public shells that share one bootstrap constant:

```bash
haxe fixtures/wphx-php/bootstrap-autoload-impl.hxml
haxe fixtures/wphx-php/bootstrap-autoload.hxml
npm run wphx:php:bootstrap-autoload
npm run wphx:php:bootstrap-autoload:check
```

It emits `build/wphx-php/bootstrap-autoload/generated/wp-includes/wphx-bootstrap-a.php` and `build/wphx-php/bootstrap-autoload/generated/wp-includes/wphx-bootstrap-b.php`, lints both files, checks exact bootstrap shape, registers a pre-existing probe autoloader, and verifies the Haxe library path and SPL autoloader are appended once across first load, repeated `require`, and a second original-path shell sharing the same bootstrap constant. It also verifies `php\Boot` is available after bootstrap and that both public functions delegate into stock Haxe PHP implementation code. Evidence is recorded in `manifests/wphx-php/bootstrap-autoload.v1.json` and `receipts/compiler/wphx-comp-php-bootstrap-autoload-probe.v1.json`. This closes the include-path/autoload part of ADR-014 for the current shared-constant fixture; multiple constants/profiles, warning/error-handler behavior, and stack traces/source maps remain separate gates.

The bootstrap warning/error-handler fixture compiles stock Haxe PHP implementation code plus two neighboring WPHX original-path public shells that share the same bootstrap constant:

```bash
haxe fixtures/wphx-php/bootstrap-error-handler-impl.hxml
haxe fixtures/wphx-php/bootstrap-error-handler.hxml
npm run wphx:php:bootstrap-error-handler
npm run wphx:php:bootstrap-error-handler:check
```

It emits `build/wphx-php/bootstrap-error-handler/generated/wp-includes/wphx-bootstrap-a.php` and `build/wphx-php/bootstrap-error-handler/generated/wp-includes/wphx-bootstrap-b.php`, lints both files, and runs isolated PHP modes against the first shell. The default WPHX WordPress profile now emits `HAXE_CUSTOM_ERROR_HANDLER=true` before `php.Boot::__hx__init()`, avoids installing Haxe's throwing error handler, preserves `error_reporting`, preserves an existing PHP error handler, and keeps ordinary PHP warning return behavior. The runner also compiles a stock-control shell with `-D wphx_php_bootstrap_error_handler=stock`, proving the explicit control still installs stock Haxe's throwing handler, mutates `error_reporting`, and converts an unsuppressed include warning into `ErrorException`. Evidence is recorded in `manifests/wphx-php/bootstrap-error-handler.v1.json` and `receipts/compiler/wphx-comp-php-bootstrap-error-handler-probe.v1.json`.

The bootstrap debug/source-map fixture compiles one stock Haxe PHP implementation plus one WPHX original-path public shell in debug, parity, and release variants:

```bash
npm run wphx:php:bootstrap-debug
npm run wphx:php:bootstrap-debug:check
```

It emits `wp-includes/wphx-bootstrap-debug.php`, triggers a controlled `haxe\ValueException` through the public shell into `BootstrapKernel.fail`, and records normalized PHP `Throwable` frames. Debug and parity profiles emit `BootstrapKernel.php.map` and inline Haxe source-position comments. Release omits the `.map` file while still preserving stack frames and inline source-position comments in this bounded fixture. Evidence is recorded in `manifests/wphx-php/bootstrap-debug.v1.json` and `receipts/compiler/wphx-comp-php-bootstrap-debug-probe.v1.json`. This proves the first WPHX shell-to-stock-Haxe debug gate; it does not claim packaged operator-facing stack-frame rewriting or mixed PHP/HTML template mapping.

The include side-effect fixture compiles a bounded original-path direct file-scope script:

```bash
haxe fixtures/wphx-php/include-side-effects.hxml
npm run wphx:php:include-side-effects
npm run wphx:php:include-side-effects:check
```

It emits `build/wphx-php/include-side-effects/generated/wp-includes/wphx-include-side-effects.php`, lints that PHP, checks exact script-shape excerpts, verifies the emission manifest records `script:include-side-effects` with `unsupported=[]`, and runs isolated PHP probes for top-level include execution, native include return arrays, repeated `include`, first and second `include_once`, function-scope include locals, and output buffering. `WPHX-COMP-PHP-DIRECT-SCRIPT-SEGMENT-MANIFEST` adds structured `segment_plans` metadata for this adapter with `direct_script_emission` adoption mode, `script` / `literal_output` / `return_exit` segments, caller-scope locals, include semantics, observable side effects, and `unsupported=[]`; the public-shell snapshot lane asserts the same contract. Evidence is recorded in `manifests/wphx-php/include-side-effects.v1.json` and `receipts/compiler/wphx-comp-php-include-side-effects.v1.json`. This is a bounded original-path script Adapter IR gate; it does not claim mixed PHP/HTML template ownership or arbitrary Haxe expression lowering into file scope.

The file-segment/template model gate links the existing F6 template/caller-scope evidence with the WPHX include side-effect evidence:

```bash
npm run wphx:php:template-segment-model
npm run wphx:php:template-segment-model:check
```

It records `manifests/wphx-php/template-segment-model.v1.json`, `receipts/compiler/wphx-comp-php-template-segment-model.v1.json`, and the focused compiler-evidence receipt `receipts/compiler/wphx-comp-php-segment-model-compiler-evidence.v1.json`, backed by [ADR-005](../adr/ADR-005-php-file-segment-template-model.md). The model names ordered segment kinds, adoption modes, required metadata, and gates before broad mixed PHP/HTML ownership. It classifies the F6 admin-style template, theme-style template, nested partial, and WPHX direct-script include fixture, and it now consumes compiler-emitted `segment_plans` evidence for the direct-script include adapter, admin-style segment shell, nested parent shell, and nested partial shell. It does not claim generated ownership of existing WordPress mixed PHP/HTML files, HHX/HXX parity for existing Core templates, arbitrary Haxe expression lowering in PHP caller scope, or whole-file template ownership.

The first compiler-emitted template segment shell turns the segment model into generated original-path output:

```bash
haxe fixtures/wphx-php/template-segment-admin-style.hxml
npm run wphx:php:template-segment-admin-style
npm run wphx:php:template-segment-admin-style:check
```

It emits `build/wphx-php/template-segment-admin-style/generated/wp-admin/wphx-template-segment-admin.php`, lints generated and oracle PHP, checks exact shell excerpts, verifies the emission manifest records `script:template-segment-admin-style` with `unsupported=[]`, and compares oracle/candidate behavior for the `ABSPATH` guard, literal/template output order, caller-scope local mutation, object mutation, global trace mutation, and native include return array. Evidence is recorded in `manifests/wphx-php/template-segment-admin-style.v1.json` and `receipts/compiler/wphx-comp-php-first-segment-shell.v1.json`. This is the first minimized generated segment-shell gate; it does not claim generated ownership of existing WordPress mixed PHP/HTML files, broad admin/theme template ownership, HHX/HXX parity, arbitrary Haxe expression lowering in PHP caller scope, or whole-file ownership.

The nested segment shell extends that gate to a generated parent template plus generated partial:

```bash
haxe fixtures/wphx-php/template-segment-nested.hxml
npm run wphx:php:template-segment-nested
npm run wphx:php:template-segment-nested:check
```

It emits `build/wphx-php/template-segment-nested/generated/wp-admin/wphx-template-nested-parent.php` and `build/wphx-php/template-segment-nested/generated/wp-admin/includes/wphx-template-nested-partial.php`, lints generated and oracle PHP, checks exact shell excerpts, verifies the emission manifest records `script:template-segment-nested-parent` and `script:template-segment-nested-partial` with `unsupported=[]`, and compares oracle/candidate behavior for guard returns, ordered parent/partial output, caller-scope local reads and mutation, object mutation, global trace order, nested include return values, repeated include, include_once second-return behavior, and function-scope include locals. Evidence is recorded in `manifests/wphx-php/template-segment-nested.v1.json` and `receipts/compiler/wphx-comp-php-nested-segment-shell.v1.json`. This is still a minimized generated segment-shell gate; it does not claim existing WordPress template ownership, broad admin/theme ownership, HHX/HXX parity, arbitrary Haxe expression lowering in PHP caller scope, or whole-file ownership.

`WPHX-COMP-PHP-SEGMENT-PLAN-PRINTER` keeps the emitted admin-style and nested segment-shell behavior unchanged while routing those adapters through a bounded compiler-side segment plan printer. The current printer accepts ordered `PhpSegment` and `OutputSegment` entries, toggles PHP/output mode deterministically, and records `segment.plan-printer` in the affected emission manifests. This is the first implementation step toward ADR-005's ordered file-segment plans; it is not arbitrary Haxe expression lowering, a full mixed-template backend, or a claim over existing WordPress template directories.

`WPHX-COMP-PHP-SEGMENT-MANIFEST` adds structured `segment_plans` metadata to the WPHX PHP emission manifest for those generated script adapters. Each plan records the original path, adapter name, adoption mode, ordered segment kinds, caller-scope facts, include semantics, observable effects, and unsupported constructs. This makes the compiler output itself consumable by future Adapter IR tooling or a broader backend without moving behavior out of the existing bounded fixtures.

`WPHX-COMP-PHP-SEGMENT-SNAPSHOT` extends the public-shell snapshot lane so the same structured `segment_plans` metadata is checked during generated-shape snapshots for the include-side-effect direct script, admin-style shell, nested parent, and nested partial. This guards the compiler metadata contract in the same place that guards selected generated PHP source shape, while leaving behavior parity in the focused oracle/candidate runners.

`WPHX-COMP-PHP-SEGMENT-MODEL-COMPILER-EVIDENCE` closes the loop back into the model gate. The model runner reads the include-side-effects, admin-style, and nested manifests, compares all four emitted `segment_plans` against the expected file-segment ledger, and records seven classified cases so bridge/context evidence and compiler-emitted segment metadata remain visibly distinct.

## Adapter IR

The WPHX PHP compiler now uses an Adapter IR before printing PHP:

```text
typed Haxe source and metadata
  -> WPHX Adapter IR file/declaration plans
  -> deterministic original-path PHP adapter printer
  -> wphx-php-emission.v1.json
```

The v0 IR in `src/wphx/compiler/php/WphxPhpCompiler.hx` covers the proven public-shell shapes: original-path files, guarded global functions, classes/interfaces, bounded direct file-scope script adapters, compiler-emitted segment shell adapters, a bounded segment-plan printer for generated template shells, structured segment-plan emission metadata, methods, properties, constants, Haxe bootstrap markers, protected methods, by-reference parameters, static and instance method adapters, and manifest declarations. The first reusable PHP-core method-body nodes now cover `if`/`else`, `for`, `foreach`, `break`, `continue`, `return`, `throw`, native array reads/writes/appends, array casts, bool/int/string casts, bool/null literals, long array literals, object construction, local variables, assignments, function calls, method calls, static calls, class constants, and object property reads. WordPress-profile method bodies are now constructed in `WphxPhpWordPressAdapters.hx` and handed back as PHP-core IR plans; the compiler core still owns validation, feature recording, and printing. The emission manifest records these as `core_ir_features` and `segment_plans` so richer adapters can depend on them explicitly.

This IR is deliberately narrower than a full PHP backend, but it is the front door of the staged custom compiler. Add new nodes only when a fixture or WordPress slice needs them, and pair each addition with generated-shape, static/runtime ABI, behavior, and receipt evidence as appropriate. Grouped `WP_Http` adapters, the file-segment/template model, the first generated admin-style segment shell, the first generated nested segment shell, the segment-plan printer, and structured segment-plan manifest metadata are now proven gates; the next template movement should replace temporary public shells one bounded segment plan at a time without jumping to broad mixed PHP/HTML ownership.

`WPHX-COMP-PHP.06` adds the first generated `WP_Http::buildCookieHeader( &$r )` original-path shell. It is a WordPress profile pressure gate over native PHP array mutation, scalar cookie upgrading, `WP_Http_Cookie` object preservation, filter timing, and helper delegation. `WPHX-COMP-PHP-CORE-IR-NATIVE-ARRAYS` keeps the same public-shell behavior while moving the native-array body through reusable PHP-core IR nodes. This is still not arbitrary Haxe expression lowering or a complete PHP backend.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-ABSOLUTE-URL-TEMP-SHELL` extends the grouped `WP_Http` shell to include `WP_Http::make_absolute_url( $maybe_relative_path, $url )`. The WordPress adapter plan keeps `empty()`, `wp_parse_url`, parse-failure passthrough, and PHP component-presence booleans in PHP, then delegates URL assembly and normalization to the module-level Haxe `HttpAbsoluteUrl.makeAbsoluteUrl` helper. The grouped helper gate now covers nine cases with `unsupported=[]`, and WPHX-312.58 now consumes the compiler-emitted original-path public shell instead of a copied/JS-patched method body. This is still method-boundary ownership, not whole-file `WP_Http`, `WP_Http::request`, live transport, or installed distribution ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-BLOCK-REQUEST-TEMP-SHELL` adds the first grouped `WP_Http` instance-method adapter, `WP_Http::block_request( $uri )`. The WordPress adapter plan keeps `WP_HTTP_BLOCK_EXTERNAL`, `WP_ACCESSIBLE_HOSTS`, `parse_url`, `get_option( 'siteurl' )`, and `block_local_requests` filter timing in PHP, then delegates localhost/site-host and accessible-host matching policy to module-level Haxe `HttpBlockRequestPolicy` helpers. The grouped helper gate now covers fourteen cases with `unsupported=[]`, and WPHX-312.54 now consumes the compiler-emitted original-path public shell instead of a copied/JS-patched method body. This is still method-boundary ownership, not whole-file `WP_Http`, `WP_Http::request`, live transport, DNS/proxy/TLS behavior, or installed distribution ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-HANDLE-REDIRECTS-TEMP-SHELL` extends the grouped `WP_Http` shell to include `WP_Http::handle_redirects( $url, $args, $response )`. The WordPress adapter plan keeps native Location header arrays, redirect budget mutation, `WP_Error` construction, `WP_Http_Cookie::test`, `self::make_absolute_url`, and `wp_remote_request` dispatch in PHP, then delegates only short-circuit, too-many-redirects, and POST 302/303-to-GET decisions to module-level Haxe `HttpRedirectOrchestration` helpers. The grouped helper gate now covers fifteen cases with `unsupported=[]`, and WPHX-312.59 now consumes the compiler-emitted original-path public shell instead of a copied/JS-patched method body. This is still method-boundary ownership, not whole-file `WP_Http`, full `WP_Http::request`, live redirect following, Requests network I/O, or installed distribution ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-ENCODING-TEMP-SHELL` adds a compiler-emitted original-path `wp-includes/class-wp-http-encoding.php` adapter for `WP_Http_Encoding`. The generic class printer now supports `#[AllowDynamicProperties]` through typed metadata, while the WordPress profile emits the public compression/decompression/compatibility/accept-encoding/content/should-decode/availability methods. PHP keeps `function_exists` checks and `wp_http_accept_encoding` filter timing at the public boundary; Haxe owns the bounded encoding strategy helpers. WPHX-312.50 now consumes the compiler-emitted shell instead of a copied/rewritten class shell and keeps all six HTTP encoding oracle/candidate cases green. This still does not claim live transfer-encoding negotiation, streaming transport behavior, upstream HTTP PHPUnit parity, or installed distribution ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-PROXY-TEMP-SHELL` adds a compiler-emitted original-path `wp-includes/class-wp-http-proxy.php` adapter for `WP_HTTP_Proxy`. The WordPress profile emits the public proxy enablement, authentication, accessor, auth-header, and `send_through_proxy( $uri )` methods. PHP keeps constants, `parse_url`, `get_option( 'siteurl' )`, `pre_http_send_through_proxy` filter timing, and `base64_encode` at the public boundary; Haxe owns only the bounded post-filter bypass routing predicate. WPHX-312.51 now consumes the compiler-emitted shell instead of a copied/rewritten class shell and keeps all seven HTTP proxy oracle/candidate cases green. This still does not claim live proxy transport routing, Requests/cURL/fsockopen behavior, TLS CONNECT behavior, upstream HTTP PHPUnit parity, installed distribution ownership, or `WP_Http::request` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-RESPONSE-TEMP-SHELL` adds a compiler-emitted original-path `wp-includes/class-wp-http-response.php` adapter for `WP_HTTP_Response`. The WordPress profile emits the public constructor, data/status/header accessors and mutators, single-header replace/append behavior, public properties, and `jsonSerialize()` handoff. PHP keeps the reflection-visible class ABI, public property serialization behavior, `#[AllowDynamicProperties]`, and native `absint` boundary; Haxe owns the bounded response-state transitions through `HttpResponseState`. WPHX-312.52 now consumes the compiler-emitted shell instead of a generated temporary class shell and keeps all five HTTP response oracle/candidate cases green. This still does not claim REST server dispatch, Requests transport integration, live HTTP behavior, upstream HTTP PHPUnit parity, installed distribution ownership, or broader response-object ownership beyond this bounded adapter.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-COOKIE-TEMP-SHELL` adds a compiler-emitted original-path `wp-includes/class-wp-http-cookie.php` adapter for `WP_Http_Cookie`. The WordPress profile emits the public constructor, public cookie properties, dynamic-property-capable class shape, `test()`, `getHeaderValue()`, `getFullHeader()`, and `get_attributes()`. PHP keeps constructor parsing/defaults, `parse_url`, `strtotime`, `urldecode`, dynamic Set-Cookie attributes, and `wp_http_cookie_value` filter timing at the public boundary; Haxe owns the bounded post-construction matching, header formatting, and attribute shape through `HttpCookieStrategy`. WPHX-312.53 now consumes the compiler-emitted shell instead of a copied/rewritten class shell and keeps all six HTTP cookie oracle/candidate cases green. This still does not claim full constructor ownership, Requests cookie jar semantics, live HTTP behavior, upstream HTTP PHPUnit parity, installed distribution ownership, or broader cookie propagation ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-TRANSPORT-SELECTION-TEMP-SHELL` adds a compiler-emitted original-path `wp-includes/class-wp-http.php` adapter for the deprecated transport-selection boundary. The WordPress profile now emits public `WP_Http::_get_first_available_transport()` and private `WP_Http::_dispatch_request()` with reflection-visible visibility preserved. Haxe owns deprecated transport token and `WP_Http_*` class-name mapping through `HttpTransportSelection`; WPHX PHP core IR now owns the generated shape of both transport helper adapter bodies, including deprecated filter dispatch, static transport tests, method-scope static transport caching, and dynamic transport construction. The PHP-visible boundary still preserves `apply_filters_deprecated( 'http_api_transports' )`, static transport `test()` calls, dispatch transport caching, `WP_Error` construction, `http_api_debug`, `http_response`, and transport request execution. WPHX-312.66 now consumes the compiler-emitted shell instead of a copied/rewritten class shell and keeps all six transport selection/dispatch oracle/candidate cases green. This still does not claim `WP_Http::request`, live transport execution, upstream HTTP PHPUnit parity, installed distribution ownership, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-NONBLOCKING-TEMP-SHELL` adds a bounded compiler-emitted original-path `wp-includes/class-wp-http.php` adapter for `WP_Http::request( $url, $args = [] )` in the WPHX-312.65 nonblocking response gate. The WordPress profile keeps request defaults, filters, URL checks, `block_request()`, streaming checks, hook registration, proxy/SSL/cookie/header option setup, Requests dispatch, exception conversion, mbstring reset, debug action, error short-circuit, and response filtering in PHP, then delegates only the `blocking=false` native response array shape to module-level Haxe `HttpRequestNonblocking.nonblockingResponse`. WPHX-312.65 now consumes the compiler-emitted shell instead of a copied/JS-patched public method body, while public-shell snapshots cover the generated request shell shape. This still does not claim full `WP_Http::request`, live Requests network I/O, redirect following, upstream HTTP PHPUnit parity, installed distribution ownership, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-REQUEST-NONBLOCKING-IR-PROMOTION` supersedes the request-template checkpoint by emitting the bounded `WP_Http::request` nonblocking public adapter from structured WPHX PHP core IR. The compiler core now supports generic `try/catch` and PHP constant expressions for bounded adapter bodies. The WPHX-312.65 runner requires the request nonblocking adapter template to be absent, requires request IR feature flags in the WPHX PHP manifest, and keeps the deterministic nonblocking oracle/candidate behavior case green. PHP-visible request orchestration remains public-boundary compatibility behavior; Haxe ownership remains the native nonblocking response array helper.

`WPHX-COMP-PHP-REQUEST-HELPER-ALIASES` extends adapter metadata so a public method can name multiple Haxe helper roles with repeated `@:wp.haxeHelper` annotations. One-argument `@:wp.haxeHelper("...")` remains the primary helper contract used by existing adapters; two-argument `@:wp.haxeHelper("role", "...")` entries add named helper aliases for a larger generated public adapter. The bounded `WP_Http::request` shell now uses named `safetyOptions` and `streamBlocking` aliases for the redirect-validation hook condition and stream blocking decision, while the primary helper still owns the nonblocking response shape. This keeps `WP_Http::request` as one generated original-path ABI shell and avoids runner string patches when future request-branch candidates retire their copied public shells.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-STREAM-BLOCKING-TEMP-SHELL` applies the shared request adapter to WPHX-312.72. The runner now compiles `fixtures/wphx-php/wp-http-request-nonblocking.hxml`, installs the compiler-emitted `wp-includes/class-wp-http.php` request shell into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named stream/safety/nonblocking helper calls, and keeps the deterministic streaming oracle/candidate behavior case green. This retires the copied/runner-patched public shell for the stream-blocking branch; it still does not claim full `WP_Http::request`, live streaming transfer behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-SAFETY-TEMP-SHELL` applies the same shared request adapter to WPHX-312.67. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named safety/stream/nonblocking helper calls, and keeps all six request safety/proxy oracle/candidate cases green. This retires the copied/runner-patched public shell for the redirect-validation hook branch; it still does not claim full `WP_Http::request`, live network/proxy behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-HEAD-REDIRECTION-TEMP-SHELL` applies the shared request adapter to WPHX-312.83. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named head-redirection/safety/stream/nonblocking helper calls, and keeps both HEAD redirection oracle/candidate cases green. The shared shell now emits compiler-owned `processHeaders()` and `normalize_cookies()` adapters because exercised request paths need those neighboring public methods; `normalize_cookies()` added generic WPHX PHP IR for `instanceof` and static closure expressions instead of reintroducing raw PHP bodies. This retires the copied/runner-patched public shell for the HEAD default-redirection branch; it still does not claim full `WP_Http::request`, live redirect/network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-METHOD-OPTIONS-TEMP-SHELL` applies the shared request adapter to WPHX-312.68. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named method/head/safety/stream/nonblocking helper calls, and keeps both method-options oracle/candidate cases green. The shared shell calls the named `methodOptions` Haxe helper for the non-GET/HEAD `data_format='body'` decision while PHP still owns method defaults, filters, option arrays, Requests dispatch, and response handling. This retires the copied/runner-patched public shell for the method-options branch; it still does not claim full `WP_Http::request`, method normalization/body serialization, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-REDIRECT-OPTIONS-TEMP-SHELL` applies the shared request adapter to WPHX-312.69. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named redirect/method/head/safety/stream/nonblocking helper calls, and keeps both redirect-options oracle/candidate cases green. The shared shell calls the named `redirectOptions` Haxe helper for the zero-redirection `follow_redirects=false` decision while PHP still owns redirection defaults, filters, option arrays, Requests dispatch, and response handling. This retires the copied/runner-patched public shell for the redirect-options branch; it still does not claim full `WP_Http::request`, redirect following, redirect count filtering semantics, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-SSL-OPTIONS-TEMP-SHELL` applies the shared request adapter to WPHX-312.70. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named ssl/redirect/method/head/safety/stream/nonblocking helper calls, and keeps both SSL-options oracle/candidate cases green. The shared shell calls the named `sslOptions` Haxe helper for the `sslverify=false` `verify=false`/`verifyname=false` branch while PHP still owns certificate-path values, `https_ssl_verify` filter timing, option arrays, Requests dispatch, and response handling. This retires the copied/runner-patched public shell for the SSL-options branch; it still does not claim full `WP_Http::request`, TLS/certificate validation, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-RESPONSE-SIZE-TEMP-SHELL` applies the shared request adapter to WPHX-312.71. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named response-size/ssl/redirect/method/head/safety/stream/nonblocking helper calls, and keeps both response-size oracle/candidate cases green. The shared shell calls the named `responseSizeOptions` Haxe helper for the non-null `limit_response_size` to `max_bytes` decision while PHP still owns parsed argument values, option arrays, Requests dispatch, transfer truncation behavior, and response handling. This retires the copied/runner-patched public shell for the response-size branch; it still does not claim full `WP_Http::request`, actual response truncation, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-STREAM-FILENAME-TEMP-SHELL` applies the shared request adapter to WPHX-312.73. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named stream-filename/response-size/ssl/redirect/method/head/safety/stream/nonblocking helper calls, and keeps the stream-filename oracle/candidate case green. The shared shell calls the named `streamFilenameOptions` Haxe helper for the `stream=true` filename-option decision while PHP still owns stream filename defaulting, destination writability checks, option arrays, Requests dispatch, streaming transfer behavior, and response handling. This retires the copied/runner-patched public shell for the stream-filename branch; it still does not claim full `WP_Http::request`, filename path normalization, actual streaming file I/O, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-INVALID-URL-TEMP-SHELL` applies the shared request adapter to WPHX-312.74. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named invalid-url/stream-filename/response-size/ssl/redirect/method/head/safety/stream/nonblocking helper calls, and keeps the invalid-and-blocked oracle/candidate case green. The shared shell calls the named `invalidUrl` Haxe helper for the empty URL or missing parsed scheme branch while PHP still owns URL filtering, `parse_url`, `WP_Error` construction, translation, `http_api_debug`, block policy, Requests dispatch avoidance, and response handling. This retires the copied/runner-patched public shell for the invalid-url branch; it still does not claim full `WP_Http::request`, URL parsing or validation internals, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-BLOCKED-REQUEST-TEMP-SHELL` applies the shared request adapter to WPHX-312.75. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named blocked-request/invalid-url/stream-filename/response-size/ssl/redirect/method/head/safety/stream/nonblocking helper calls, and keeps the invalid-and-blocked oracle/candidate case green. The shared shell calls the named `blockedRequest` Haxe helper for the PHP-owned `block_request( $url )` result while PHP still owns URL filtering, `parse_url`, invalid-url handling, `block_request` execution/policy, `WP_Error` construction, translation/`sprintf`, `http_api_debug`, Requests dispatch avoidance, and response handling. This retires the copied/runner-patched public shell for the blocked-request branch; it still does not claim full `WP_Http::request`, `block_request` internals, URL parsing or validation internals, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-RETIRE-WP-HTTP-REQUEST-PREEMPTIVE-RESPONSE-TEMP-SHELL` applies the shared request adapter to WPHX-312.76. The runner now compiles the generated request shell, installs it into the candidate package, verifies manifest `class:WP_Http` with `unsupported=[]`, verifies request-shell IR feature flags and named preemptive-response/blocked-request/invalid-url/stream-filename/response-size/ssl/redirect/method/head/safety/stream/nonblocking helper calls, and keeps the preemptive-response oracle/candidate case green. The shared shell calls the named `preemptiveResponse` Haxe helper for the PHP-owned `pre_http_request` filter result while PHP still owns filter execution/timing/payload, native returned value shape, URL handling, invalid/blocked branches, Requests dispatch avoidance, and response handling. This retires the copied/runner-patched public shell for the preemptive-response branch; it still does not claim full `WP_Http::request`, `pre_http_request` filter semantics, returned response shape validation, live network behavior, upstream HTTP PHPUnit parity, installed distribution behavior, or whole-file `WP_Http` ownership.

`WPHX-COMP-PHP-COOKIE-CONSTRUCTOR-IR-PROMOTION` supersedes the cookie constructor template checkpoint by emitting `WP_Http_Cookie::__construct` from structured WPHX PHP core IR. The compiler core now supports the generic PHP constructs that boundary needed: bare `return;`, `list(...)` assignment, dynamic object properties such as `$this->$key`, null coalescing, and ternary expressions. The WPHX-312.53 runner requires the cookie constructor adapter template to be absent, requires those IR feature flags in the WPHX PHP manifest, and keeps all six cookie oracle/candidate behavior cases green. PHP-visible constructor parsing/defaults, `parse_url`, `strtotime`, `urldecode`, and dynamic Set-Cookie attributes remain public-boundary compatibility behavior; Haxe ownership remains the post-construction matcher/header/attribute behavior.

`WPHX-COMP-PHP-TRANSPORT-RAW-BLOCK-RETIREMENT` removes the remaining inline raw PHP adapter bodies from the WordPress profile. `WPHX-COMP-PHP-DISPATCH-ADAPTER-IR-PROMOTION` promotes private `WP_Http::_dispatch_request()` from a compiler-owned template into structured WPHX PHP core IR using `PhpStaticLocal` and dynamic class construction. `WPHX-COMP-PHP-TRANSPORT-GET-FIRST-IR-PROMOTION` then promotes public `WP_Http::_get_first_available_transport()` from a compiler-owned template into structured WPHX PHP core IR using `PhpForeach`, helper static calls, long-array call arguments, and `call_user_func`. `WPHX-COMP-PHP-COOKIE-CONSTRUCTOR-IR-PROMOTION` and `WPHX-COMP-PHP-REQUEST-NONBLOCKING-IR-PROMOTION` finish the active template retirement queue. The WordPress profile now records zero `PhpRawBlock` occurrences and zero active adapter templates.

`WPHX-COMP-PHP-ADAPTER-RAW-BLOCK-GUARD` adds a precommit-backed policy check for the WordPress adapter profile:

```bash
npm run wphx:php:adapter-raw-blocks
npm run wphx:php:adapter-raw-blocks:check
```

The guard records `manifests/wphx-php/adapter-raw-block-policy.v1.json` and fails if `WphxPhpWordPressAdapters.hx` introduces any inline `PhpRawBlock` body. The current WordPress profile has zero `PhpRawBlock` occurrences, zero `renderTemplate` references, and no live template renderer helper; the guard treats a missing template directory as an empty template set so fresh checkouts do not depend on untracked directories. If a future task admits a compiler-owned adapter template again, the only allowed `PhpRawBlock` form remains `PhpRawBlock(rendered.code)` with static template metadata, provenance, and parity gates. The companion receipt is `receipts/compiler/wphx-comp-php-adapter-template-reference-policy.v1.json`.

`WPHX-COMP-PHP-ADAPTER-TEMPLATE-CONTENT-GUARD` extends the policy from reference existence to template contents. The same script now rejects invalid `{{PLACEHOLDER}}` syntax, requires the placeholders present in each template to match the static `renderTemplate` replacement metadata, renders each template with deterministic lint stand-ins, wraps each rendered body in a method-scope PHP fixture, and runs `php -l`. The companion receipt is `receipts/compiler/wphx-comp-php-adapter-template-content-policy.v1.json`. This is syntax/provenance evidence for bounded adapter templates; runtime parity still belongs to the focused oracle/candidate runners.

## First Contract

The initial metadata contract is intentionally small:

- `@:wp.file("wp-includes/name.php")` selects the generated PHP output path.
- `@:wp.global("function_name")` emits a module-level Haxe function as a global PHP function.
- `@:native("Class_Name")` emits an annotated Haxe class with that public PHP class name.
- `@:wp.ifMissing` wraps generated functions/classes in `function_exists` or `class_exists(..., false)` guards.
- `@:wp.haxeBootstrap("CONSTANT_NAME")` emits a guarded stock Haxe PHP runtime bootstrap for facade shells that delegate to Haxe-generated implementation classes. ADR-014 makes this acceptable for bounded fixtures and leaf candidates, but broad public-shell distribution claims still require include-path/autoload, warning/error-handler, and stack-trace/source-map probes.
- `@:wp.scriptAdapter("adapter-name")` emits a bounded direct file-scope or segment-shell script adapter selected by name. The current adapters are `include-side-effects`, which proves include timing, include returns, function-scope locals, and output buffering; `template-segment-admin-style`, which proves the first minimized generated segment shell with ordered guard/declaration/script/literal/template/control/return behavior and now prints through the bounded segment-plan printer; and `template-segment-nested-parent` / `template-segment-nested-partial`, which prove a generated parent/partial include pair with caller-scope locals, include returns, repeated include, and include_once behavior through the same segment-plan printer.
- `@:wp.order(n)` orders multiple declarations that share one generated PHP file.
- `@:wp.const` emits a static field as a PHP class constant.
- `@:wp.byRef` emits a PHP `&$parameter` for reference-visible ABI boundaries.
- `@:wp.visibility("protected")`, `@:wp.name("name")`, and `@:wp.defaultArray` preserve PHP reflection-visible class/member/static-method/parameter ABI when Haxe's source-level spelling differs.

The emitter also writes `wphx-php-emission.v1.json` with generated paths, declarations, source modules, `core_ir_features`, bounded `segment_plans` where script adapters have a file-segment contract, hashes-by-runner evidence, and unsupported construct notes.

## Scope

This is not yet a full PHP backend. The first verified behavior is global functions, by-reference parameters, public interfaces/classes, inheritance/implements, constants, constructors, instance/static methods, public/protected/static properties, simple expressions, facade/bootstrap delegation, bounded WordPress Core public-method adapters, PHP lint, and PHP execution. New language features should be added only when a facade, linker, or WordPress driver fixture needs them.

The generator should reuse or adapt Haxe stdlib and stock PHP target behavior wherever practical, using `../haxe.compilerdev.reference/haxe` as the reference for std/php lowering. WordPress-specific metadata and lowering are acceptable for original paths, conditional declarations, reflection-visible ABI, native PHP array boundaries, and plugin/theme compatibility, but they should remain named and bounded rather than becoming a parallel reimplementation of the Haxe PHP target.

The next target gate is using the grouped original-path adapter and segment-model evidence to retire copied or JS-patched public shells one boundary at a time. The full `WP_Http::request` method and broad mixed PHP/HTML template ownership remain deliberately later.
