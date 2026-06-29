# ADR-014: Haxe PHP Bootstrap Lifecycle in WordPress

Status: Accepted

Date: 2026-06-29

## Context

WPHX PHP public adapters sometimes delegate into stock Haxe PHP implementation classes. Those adapters currently emit a guarded Haxe runtime bootstrap before the public declarations that need it:

```php
if (!defined('WPHX_EXAMPLE_BOOTSTRAPPED')) {
	define('WPHX_EXAMPLE_BOOTSTRAPPED', true);
	$wphx_haxe_lib = dirname(__DIR__, 2) . '/haxe/lib';
	set_include_path(get_include_path() . PATH_SEPARATOR . $wphx_haxe_lib);
	spl_autoload_register(function ($class) {
		$file = stream_resolve_include_path(str_replace('\\', '/', $class) . '.php');
		if ($file) {
			include_once $file;
		}
	});
	\php\Boot::__hx__init();
}
```

This is not invisible plumbing. It mutates request state through `include_path`, SPL autoloaders, Haxe runtime initialization, mbstring encoding, error-handler behavior, and stack traces. Those effects are observable to WordPress plugins, themes, drop-ins, operators, and tests.

The locked Haxe 4.3.7 PHP runtime source shows that `php.Boot::__init__()` calls `mb_internal_encoding('UTF-8')` and, unless `HAXE_CUSTOM_ERROR_HANDLER` is defined and true, may install an error handler that converts ordinary PHP errors into `ErrorException`. That default is useful for standalone Haxe PHP programs, but it is a compatibility pressure for WordPress because WordPress often treats warnings/notices as observable diagnostics rather than exceptions.

ADR-001 and ADR-013 accept the hybrid split: stock Haxe PHP emits private implementation classes; WPHX PHP emits original-path public adapters. This ADR defines the lifecycle policy for the stock Haxe runtime bootstrap when those two lanes meet.

## Decision

Treat Haxe PHP bootstrap as a WordPress compatibility boundary, not as a helper snippet.

Current WPHX public-shell fixtures may continue using guarded top-level bootstrap blocks for bounded leaf/candidate evidence, but no broad public-shell distribution claim may rely on bootstrap behavior until the required probes below pass and the emitted profile is adjusted to match their policy.

The target durable model is:

1. one request-local bootstrap decision per generated distribution profile, not one accidental runtime setup per public file;
2. idempotent include-path setup, with no duplicate Haxe library entries under repeated `require`, `include`, or neighboring original-path shells;
3. deterministic SPL autoloader registration, appended after existing WordPress/plugin autoloaders unless a fixture proves a different order is required;
4. Haxe runtime initialization called only after the Haxe library path and autoloader are available;
5. WordPress-compatible warning/notice behavior by default, with `HAXE_CUSTOM_ERROR_HANDLER` or an equivalent runtime option used before `php.Boot::__hx__init()` unless a minimized fixture proves that Haxe's handler is safe for the claimed surface;
6. explicit debug/parity/release stack-trace and source-map behavior, tied to the build profiles in `profiles/wp70-build-profiles.v1.json`;
7. generated manifests that record which public files bootstrap Haxe, which bootstrap constant/profile they use, and what request-state effects are claimed.

The current per-shell `@:wp.haxeBootstrap("CONSTANT")` block remains acceptable for minimized compiler fixtures and bounded WP_Http helper candidates. It is not sufficient evidence for whole-file Core ownership, broad plugin-facing distribution claims, or template/caller-scope ownership.

## Bootstrap Timing

WPHX PHP may emit a Haxe bootstrap block only in original-path files that actually need stock Haxe PHP implementation classes. Pure public adapters whose bodies are fully emitted by WPHX PHP core/profile IR should not bootstrap Haxe just because neighboring fixtures do.

If a generated public file declares WordPress-visible functions or classes, the Haxe bootstrap must not change their conditional declaration timing. For pluggable-style files, declaration guards still decide whether a function exists; the bootstrap may prepare implementation classes, but it must not replace `function_exists` timing with class autoload side effects.

For broad distribution profiles, bootstrap should eventually move from repeated per-file snippets to a shared generated bootstrap plan or helper that is itself original-path/load-order aware. That move needs evidence; this ADR does not require the refactor before the next leaf helpers.

## Error Handling

WordPress-compatible public shells must not silently turn warnings, notices, or deprecations into exceptions.

`wordpresshx-l7k` proves the stock Haxe PHP default is unsafe for broad WordPress request lifecycle: when no prior PHP error handler exists, stock bootstrap installs a throwing handler, mutates `error_reporting`, and converts an unsuppressed PHP include warning into `ErrorException`. The same probe proves that defining `HAXE_CUSTOM_ERROR_HANDLER` as true before Haxe runtime initialization prevents that handler from being installed and preserves ordinary PHP warning return behavior.

`wordpresshx-9h2` implements that policy for the WPHX PHP WordPress profile: generated bootstrap blocks now define `HAXE_CUSTOM_ERROR_HANDLER` before `php.Boot::__hx__init()` unless `-D wphx_php_bootstrap_error_handler=stock` is selected for an explicit stock-control/debug fixture. Bounded candidate fixtures that opt into stock behavior must list warning/notice behavior as a non-claim when it is outside the tested boundary.

Implemented evidence: `wordpresshx-l7k` and `wordpresshx-9h2` record the warning/error-handler proof and emitted-profile proof in `manifests/wphx-php/bootstrap-error-handler.v1.json` and `receipts/compiler/wphx-comp-php-bootstrap-error-handler-probe.v1.json`.

## Include Path And Autoloading

The current Haxe PHP front generator appends a Haxe library path to `include_path` and registers an SPL autoloader that resolves PHP class names to files. WPHX PHP mirrors that shape for public adapters that delegate to stock Haxe PHP output.

Before broad distribution claims, `wordpresshx-ade` must prove:

- the Haxe library path is appended exactly once per request/profile;
- repeated `require` or `include` of generated public files does not duplicate path or autoloader state;
- autoloader order is deterministic and WordPress/plugin autoloaders remain observable in the expected order;
- multiple generated files that need Haxe implementation classes share a safe bootstrap plan rather than registering conflicting loaders;
- `php.Boot::__hx__init()` is reachable only after the path/autoloader setup it needs.

Implemented evidence: `wordpresshx-ade` records the first minimized shared-constant proof in `manifests/wphx-php/bootstrap-autoload.v1.json` and `receipts/compiler/wphx-comp-php-bootstrap-autoload-probe.v1.json`. That fixture proves append-once include-path behavior, appended SPL autoloader order after an existing probe autoloader, repeated `require` safety, shared-bootstrap-constant idempotence across two original-path shells, `php.Boot` availability after bootstrap, and delegation into stock Haxe PHP implementation code. It does not prove multiple different bootstrap constants or profile-wide shared bootstrap helpers.

## Stack Traces And Source Maps

Debuggability is part of the product surface. Generated public PHP should remain readable enough for operators, and stack traces should identify both the original WordPress-facing file and the Haxe implementation source when the failure crosses that boundary.

`wordpresshx-o71` adds the first minimized WPHX bootstrap debug probe. It triggers a controlled `haxe\ValueException` through a WPHX original-path public shell into stock Haxe PHP implementation code across debug, parity, and release profiles. The probe records that:

- PHP `Throwable` traces include both the WPHX original-path public adapter frame and the stock Haxe PHP implementation frame;
- debug and parity profiles emit `BootstrapKernel.php.map` and preserve inline Haxe source-position comments;
- release omits `BootstrapKernel.php.map` while preserving PHP stack frames and inline Haxe source-position comments in this bounded fixture;
- runtime paths and source-map paths are normalized so receipts do not embed machine-specific workspace paths.

Implemented evidence: `wordpresshx-o71` records the stack-trace/source-map proof in `manifests/wphx-php/bootstrap-debug.v1.json` and `receipts/compiler/wphx-comp-php-bootstrap-debug-probe.v1.json`.

This closes the first bootstrap debug gate for bounded WPHX public shells. It does not claim operator-facing stack-frame rewriting, removal of Haxe runtime frames from PHP `Throwable` output, packaged-distribution stack-trace UX, or mixed PHP/HTML template source mapping.

## Required Gates Before Broadening

Before a WPHX-generated public shell moves beyond bounded helper/candidate ownership into durable broad distribution ownership, require:

1. generated public-shell shape snapshots for the relevant shell shape;
2. static ABI and runtime reflection probes for the public boundary;
3. behavior parity probes against the WordPress oracle for the claimed behavior;
4. include-path/autoload/repeated-bootstrap evidence from `wordpresshx-ade`;
5. warning/error-handler evidence from `wordpresshx-l7k`;
6. stack-trace/source-map evidence from `wordpresshx-o71`;
7. packaged-distribution evidence showing the generated file is installed at the original path and no copied fallback owns the claimed boundary;
8. ownership manifests that list bootstrap effects and non-claims.

## Consequences

- Haxe bootstrap is an admitted public-shell effect and must be recorded in manifests/receipts.
- Current leaf fixtures can keep using the per-shell constant guard, but they must not imply broad request-lifecycle safety.
- WPHX PHP should avoid bootstrapping Haxe for adapters whose body is already fully emitted by WPHX PHP IR.
- Any change to Haxe error-handler behavior should be treated as compiler-pressure evidence if it is generic to Haxe PHP, or as WPHX profile evidence if it is WordPress public-shell-specific.
- A later shared bootstrap helper/profile may replace repeated snippets, but only with load-order, plugin/drop-in, and repeated-include evidence.

## Follow-Up Gates

- `wordpresshx-ade` / `WPHX-COMP-PHP-BOOTSTRAP-AUTOLOAD-PROBE`: closed for the first shared-bootstrap-constant fixture; future profile-wide/multiple-constant work should create a narrower follow-up when needed.
- `wordpresshx-l7k` / `WPHX-COMP-PHP-BOOTSTRAP-ERROR-HANDLER-PROBE`: closed; proves the non-throwing policy must be selected before broad WordPress public-shell claims.
- `wordpresshx-9h2` / `WPHX-COMP-PHP-BOOTSTRAP-NONTHROWING-PROFILE`: closed; emits the non-throwing bootstrap policy through the default WPHX PHP WordPress profile and keeps `stock` as an explicit control.
- `wordpresshx-o71` / `WPHX-COMP-PHP-BOOTSTRAP-DEBUG-PROBE`: closed for the first WPHX shell into stock Haxe PHP implementation stack-trace/source-map probe; future packaged-distribution stack UX should use a narrower follow-up.

## Non-Claims

This ADR does not claim:

- the current WPHX bootstrap block is safe for whole WordPress distribution ownership;
- the stock Haxe PHP error handler is WordPress-compatible by default;
- mixed template/caller-scope bootstrap safety;
- whole-file `WP_Http` ownership;
- a full custom PHP backend.

## Supersession

This ADR refines ADR-001, ADR-003, and ADR-013. It may be superseded by a later bootstrap-profile ADR or a custom PHP target ADR if evidence shows the current hybrid bootstrap cannot preserve WordPress request-state behavior.
