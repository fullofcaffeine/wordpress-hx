# PHP Smoke Fixture

WPHX-101 owns the stock Haxe PHP smoke fixture. It proves the locked Haxe compiler can produce PHP that runs across the bootstrap PHP matrix before WordPress-specific ABI work begins.

Run the fixture and regenerate the snapshot:

```bash
npm run php:smoke
```

Check the committed snapshot:

```bash
npm run php:smoke:check
```

The fixture source is `fixtures/php-smoke/src/wphx/fixtures/php/SmokeMain.hx`. It compiles with `fixtures/php-smoke/php-smoke.hxml` into ignored `build/php-smoke` output.

The committed snapshot is `manifests/php-smoke/wphx-101-stock-php-smoke.v1.json`. It records generated PHP file digests and runtime output for:

- local PHP CLI;
- pinned Docker PHP 8.4 CLI image;
- pinned Docker PHP 8.5 CLI image.

This is only the stock-target baseline. WordPress-specific pressure starts in WPHX-102 with global facade behavior, then references, native values/globals, public classes, includes, templates, and hooks.
