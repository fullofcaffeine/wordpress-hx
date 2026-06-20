# Haxe Escape Hatches

WPHX-211 makes `Dynamic`, `untyped`, raw target syntax, broad casts, and generated `Any` explicit review points.

## Rule

Use concrete Haxe types first. If a runtime boundary cannot be expressed yet, isolate it behind a named typedef/helper and add a nearby `WPHX-211:` comment explaining why the escape hatch remains necessary.

## Check

Run:

```bash
npm run haxe:escape-hatches
npm run haxe:escape-hatches:check
```

The check scans tracked Haxe files for `Dynamic`, `untyped`, `php.Syntax.code`, `cast`, and `Any`, then requires a nearby `WPHX-211:` justification. Evidence is recorded in:

- `manifests/haxe/wphx-211-escape-hatches.v1.json`
- `receipts/haxe/wphx-211-escape-hatches.v1.json`
