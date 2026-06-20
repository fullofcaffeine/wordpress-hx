# Parity Dashboard

WPHX-009 introduces a command-line dashboard over the current evidence. It is intentionally data-first: generated JSON manifests plus query commands that later UI or report tooling can consume.

Build the dashboard:

```bash
npm run dashboard:build
```

Query it:

```bash
npm run dashboard -- summary
npm run dashboard -- file wp-includes/plugin.php
npm run dashboard -- api add_filter
npm run dashboard -- package block-editor
npm run dashboard -- task WPHX-009
npm run dashboard -- gate G0
```

Verify the required query surfaces:

```bash
npm run dashboard:check
```

Outputs:

- `manifests/dashboard/parity-dashboard.v1.json`
- `manifests/dashboard/api-index.v1.json`
- `manifests/dashboard/package-index.v1.json`
- `manifests/dashboard/gate-index.v1.json`

This is not a parity claim. It is a navigation surface over inventories, upstream baselines, oracle receipts, and Beads task state.
