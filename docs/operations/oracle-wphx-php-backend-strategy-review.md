# Oracle Review Prompt: WPHX PHP Backend Strategy

This prompt bundle is for the external architecture reviewer, referred to in project notes as **the oracle**. WordPress and Gutenberg remain the behavior oracles.

## Decision Under Review

Review whether WordPressHX should continue the staged WPHX PHP Adapter IR path, promote WPHX PHP into a broader custom/Reflaxe PHP backend soon, extract a reusable `reflaxe.php` target, improve stock Haxe PHP, or split responsibilities differently.

Current proposed decision:

- WPHX PHP uses Reflaxe infrastructure under `src/wphx/compiler/php`.
- Current admitted scope remains bounded WordPress original-path public adapter emission through Adapter IR.
- Stock Haxe PHP remains private implementation emitter and std/php oracle.
- Full backend promotion is evidence-gated by ADR-015 criteria.

## Context To Provide

- `docs/adr/ADR-001-php-emission-architecture.md`
- `docs/adr/ADR-013-wphx-php-adapter-ir-and-scope.md`
- `docs/adr/ADR-014-haxe-php-bootstrap-lifecycle.md`
- `docs/adr/ADR-015-wphx-php-backend-strategy.md`
- `docs/operations/wphx-php-compiler.md`
- `docs/operations/progress-matrix.md`
- `receipts/operations/wphx-comp-php-staged-custom-compiler.v1.json`
- `receipts/compiler/wphx-comp-php-request-nonblocking-ir-promotion.v1.json`
- `receipts/compiler/wphx-comp-php-cookie-constructor-ir-promotion.v1.json`
- `receipts/compiler/wphx-comp-php-transport-get-first-ir-promotion.v1.json`
- `receipts/compiler/wphx-comp-php-public-shell-snapshots.v1.json`

## Questions For The Oracle

1. Is the staged Adapter IR path still the right default for WordPress public PHP parity, given the current evidence?
2. Are the ADR-015 backend-promotion criteria strong enough to prevent accidental WordPress-only backend accretion?
3. Should WPHX PHP move sooner toward a full Reflaxe/custom PHP target because the compiler already uses Reflaxe infrastructure?
4. Which generic lowering/runtime features should be promoted next into reusable PHP core IR versus kept in the WordPress profile?
5. Is the generated PHP quality bar sufficient for WordPress plugin/theme ecosystem compatibility, reflection, stack traces, and operator debugging?
6. What evidence would justify replacing stock Haxe PHP as the private implementation emitter?
7. What risks are missing around stdlib reuse, runtime boot, source maps, dynamic dispatch, native PHP arrays, warning behavior, mixed templates, and public file topology?

## Expected Output

Ask the oracle for:

- a recommended strategy;
- a list of risks or missing evidence;
- changes to ADR-015 criteria if needed;
- concrete next compiler-pressure fixtures;
- a clear statement on whether broad `reflaxe.php` extraction should start now, later, or not at all.

The response should be stored as an operations receipt and summarized in `docs/operations/oracle.md` before any backend-promotion ADR supersedes ADR-015.
