# ADR-017: WPHX PHP Runtime And Stdlib Strategy

Status: Accepted

Date: 2026-07-02

## Context

WPHX PHP is now the active compiler lane for WordPress-facing PHP output, but it is not yet a full arbitrary-Haxe PHP backend. ADR-015 keeps stock Haxe PHP as the private implementation emitter and std/php behavior oracle until WPHX PHP has evidence to move that responsibility. ADR-016 makes that movement an explicit usable-compiler gate.

The risk is reimplementing Haxe PHP runtime behavior piecemeal while chasing WordPress public ABI work. Stock Haxe PHP already owns boot, autoloading, exceptions, arrays, maps, iterators, closures, strings, source-map comments, target intrinsics, and `std/php` extern behavior. WPHX PHP should borrow or adapt that behavior where practical, not invent a parallel runtime because the first driver fixture is small.

## Decision

Use stock Haxe PHP as the runtime/std behavior oracle and borrowing source for WPHX PHP until a later backend-promotion ADR accepts broader ownership.

Near-term WPHX PHP rules:

- Fully WPHX-emitted public shells should avoid stock Haxe bootstrap when they do not need stock implementation classes or runtime helpers.
- Public shells that delegate into stock-Haxe-emitted implementation classes keep using the ADR-014 bootstrap policy: guarded include path, appended autoloader, `php.Boot::__hx__init()`, non-throwing WordPress error-handler profile, and debug/source-map evidence before broad claims.
- Generic WPHX PHP lowering may reuse stock Haxe PHP runtime designs for arrays, maps, iterators, closures, exceptions, strings, reflection basics, source comments, and source maps.
- Do not reimplement `std/php`, boot, exception wrapping, closure helpers, map/iterator behavior, string helpers, or source-map conventions from scratch unless a minimized fixture proves the stock behavior cannot satisfy the WordPress compatibility boundary.
- Keep stock `-php` private implementation output as a bounded fallback until selected WPHX PHP fixtures explicitly replace it.

## Executable Evidence

`tools/wphx-php/run-runtime-stdlib-strategy.mjs` writes a temporary stock-Haxe-PHP source fixture under `build/wphx-php/runtime-stdlib-strategy`, compiles release and debug variants through stock Haxe PHP, runs both with PHP, and records `manifests/wphx-php/runtime-stdlib-strategy.v1.json` plus `receipts/compiler/wphx-comp-php-runtime-stdlib-strategy.v1.json`.

The probe covers:

- stock `index.php` boot shape with include path, SPL autoloader, `php.Boot::__hx__init()`, and main dispatch;
- array filtering/mapping/joining and length behavior;
- string map set/get/key iteration and sorting;
- closures capturing a local value;
- Haxe exception wrapping/catching through `haxe\Exception`;
- `StringTools.trim()` and lowercase behavior through stock PHP lowering;
- JSON output through Haxe stdlib;
- debug source-map files and inline Haxe source comments.

This evidence is deliberately stock-target evidence. It tells WPHX PHP what to borrow or adapt. It does not claim WPHX PHP already owns those runtime/std behaviors.

## Consequences

- The next whole-file WPHX PHP pilot should prefer no-bootstrap WPHX-emitted bodies when behavior is simple enough, and should cite this ADR for any runtime/std behavior it avoids or still delegates.
- When a WPHX public adapter needs generic arrays, maps, closures, exceptions, strings, iterators, or debug behavior, first compare with stock Haxe PHP output and reference sources in `../haxe.compilerdev.reference/haxe`.
- The current nine stock Haxe PHP private-output hxmls remain admitted fallbacks with owners in the gap inventory.
- Full `reflaxe.php` maturity still requires backend-scale evidence and a later ADR.

## Non-Claims

This ADR does not claim:

- WPHX PHP owns the Haxe runtime or stdlib today;
- stock Haxe PHP public output is suitable for WordPress distribution files;
- WPHX PHP can remove stock private implementation output;
- reflection, dynamic dispatch, all iterators, all exceptions, or Unicode/string behavior are fully proven;
- whole-file WordPress ownership or installed WordPress behavior.

## Supersession

This ADR refines ADR-014, ADR-015, and ADR-016 for runtime/std ownership. It may be superseded by a future backend-promotion ADR or extracted `reflaxe.php` target ADR.
