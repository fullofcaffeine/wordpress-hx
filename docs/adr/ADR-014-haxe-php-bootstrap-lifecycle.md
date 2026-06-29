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

Until `wordpresshx-l7k` proves the safe behavior, broad distribution profiles must assume the stock Haxe PHP error handler is unsafe for WordPress request lifecycle. The preferred release/parity policy is to define `HAXE_CUSTOM_ERROR_HANDLER` as true before Haxe runtime initialization, or to use a documented equivalent if the stock target gains a cleaner option.

Bounded candidate fixtures that use the current bootstrap must list this as a non-claim when warning/notice behavior is outside the tested boundary.

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

Before broad distribution claims, `wordpresshx-o71` must prove or update policy for:

- stack frames through a WPHX original-path public adapter into stock Haxe PHP implementation code;
- debug and parity profile source-map/source-position behavior;
- release profile behavior when source maps and oracle traces are removed;
- normalized local paths so receipts do not embed machine-specific workspace paths;
- whether Haxe runtime frames are acceptable, hidden, or mapped in operator-facing diagnostics.

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
- `wordpresshx-l7k` / `WPHX-COMP-PHP-BOOTSTRAP-ERROR-HANDLER-PROBE`: warning/notice/error-handler behavior with and without `HAXE_CUSTOM_ERROR_HANDLER`.
- `wordpresshx-o71` / `WPHX-COMP-PHP-BOOTSTRAP-DEBUG-PROBE`: stack traces, source maps, and debug/parity/release profile behavior through a WPHX shell into stock Haxe PHP implementation code.

## Non-Claims

This ADR does not claim:

- the current WPHX bootstrap block is safe for whole WordPress distribution ownership;
- the stock Haxe PHP error handler is WordPress-compatible by default;
- mixed template/caller-scope bootstrap safety;
- whole-file `WP_Http` ownership;
- a full custom PHP backend.

## Supersession

This ADR refines ADR-001, ADR-003, and ADR-013. It may be superseded by a later bootstrap-profile ADR or a custom PHP target ADR if evidence shows the current hybrid bootstrap cannot preserve WordPress request-state behavior.
