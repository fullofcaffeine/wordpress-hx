# Inventory

WPHX-006 establishes the first deterministic inventory pass for executable source, shipped executable artifacts, and tests.

Run:

```bash
npm run inventory
```

The generator reads pinned baselines from local sibling repositories and cached upstream artifacts:

- `../wordpress-develop` at WordPress 7.0.0
- `../gutenberg` at the WordPress 7.0 embedded Gutenberg commit
- `../gutenberg` at the forward Gutenberg 23.4.0 tag
- `/tmp/wordpresshx-upstream/wordpress-7.0.zip`
- `/tmp/wordpresshx-upstream/gutenberg-core-a2a354cf35e5.tar.gz`

Outputs:

- `manifests/source-inventory.jsonl`
- `manifests/artifact-provenance.jsonl`
- `manifests/test-inventory.jsonl`
- `manifests/inventory-summary.v1.json`
- `receipts/inventory/wphx-006-inventory.v1.json`

The first pass is intentionally broad. It classifies executable paths by language, source kind, area, baseline, and upstream origin. WPHX-007 owns formal schemas and validators; later domain work will refine owners, public APIs, dependencies, risk tags, and generated artifact mappings.
