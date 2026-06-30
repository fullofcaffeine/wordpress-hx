# WPHX PHP Compiler

`WPHX-COMP-PHP` starts the in-repo custom PHP compiler for WordPress-shaped public files. The intended long-term shape is a modern Reflaxe PHP compiler core plus a WordPress compatibility profile, not a WordPress-only text generator.

The compiler is a Haxe/Reflaxe module under `src/wphx/compiler/php`. It uses Reflaxe manual output so emitted file paths can be WordPress distribution paths such as `wp-includes/*.php`, not merely Haxe package paths. Reflaxe is loaded through the explicit classpath recorded in `toolchain.lock.json` and `upstream.lock.json`.

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

The v0 IR in `src/wphx/compiler/php/WphxPhpCompiler.hx` covers the proven public-shell shapes: original-path files, guarded global functions, classes/interfaces, bounded direct file-scope script adapters, compiler-emitted segment shell adapters, a bounded segment-plan printer for generated template shells, structured segment-plan emission metadata, methods, properties, constants, Haxe bootstrap markers, protected methods, by-reference parameters, and manifest declarations. The first reusable PHP-core method-body nodes now cover `if`/`else`, `for`, `foreach`, `break`, `continue`, `return`, native array reads/writes/appends, array casts, int/string casts, long array literals, object construction, local variables, assignments, function calls, method calls, and static calls. The emission manifest records these as `core_ir_features` and `segment_plans` so richer adapters can depend on them explicitly.

This IR is deliberately narrower than a full PHP backend, but it is the front door of the staged custom compiler. Add new nodes only when a fixture or WordPress slice needs them, and pair each addition with generated-shape, static/runtime ABI, behavior, and receipt evidence as appropriate. Grouped `WP_Http` adapters, the file-segment/template model, the first generated admin-style segment shell, the first generated nested segment shell, the segment-plan printer, and structured segment-plan manifest metadata are now proven gates; the next template movement should replace temporary public shells one bounded segment plan at a time without jumping to broad mixed PHP/HTML ownership.

`WPHX-COMP-PHP.06` adds the first generated `WP_Http::buildCookieHeader( &$r )` original-path shell. It is a WordPress profile pressure gate over native PHP array mutation, scalar cookie upgrading, `WP_Http_Cookie` object preservation, filter timing, and helper delegation. `WPHX-COMP-PHP-CORE-IR-NATIVE-ARRAYS` keeps the same public-shell behavior while moving the native-array body through reusable PHP-core IR nodes. This is still not arbitrary Haxe expression lowering or a complete PHP backend.

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
