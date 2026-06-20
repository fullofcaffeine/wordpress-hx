# WordPress Debug Source Maps

WPHX-207 records the first deterministic debug/source-map fixture for generated PHP.

## Contract

- Haxe-generated PHP stack frames map back to Haxe source comments emitted by the stock Haxe PHP target.
- WordPress-facing shell frames map back to original-path linker segment metadata.
- Runtime traces are normalized so local PHP and Docker PHP paths compare deterministically.
- The source map names both the generated PHP file/line and the original source unit or Haxe source line.

## Verification

Run:

```bash
npm run wp:debug:sourcemap
npm run wp:debug:sourcemap:check
```

Evidence is recorded in:

- `manifests/wp-debug/wphx-207-source-map-traces.v1.json`
- `receipts/wp-debug/wphx-207-source-map-traces.v1.json`
