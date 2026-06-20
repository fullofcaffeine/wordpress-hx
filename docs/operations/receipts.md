# Receipt Evidence

WPHX-805 records a machine-checkable link between closed Beads tasks and verification receipts.

Build the evidence-link manifest:

```bash
npm run receipts:build
```

Validate it:

```bash
npm run receipts:validate
```

Validation fails when:

- a closed task has no evidence-link entry;
- an evidence-link entry has no receipt;
- a receipt path is missing;
- a receipt SHA-256 no longer matches the manifest;
- a receipt points to a different `WPHX-*` external reference.

The active manifest is `manifests/receipts/evidence-links.v1.json`.
