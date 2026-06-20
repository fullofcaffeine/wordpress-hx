# Beads Seeding

WPHX-803 makes the initial PRD task graph reproducible by keying seed data on stable `WPHX-*` external references.

The seed manifest is:

```text
manifests/beads/prd-seed.v1.json
```

Check the current Beads graph against the seed:

```bash
npm run beads:seed
```

Apply missing or drifted seed data:

```bash
npm run beads:seed:apply
```

The apply command creates missing issues, updates seeded title/type/priority/description/acceptance/parent fields, and adds missing blocking dependencies. It does not close, reopen, claim, defer, or delete issues.

Regenerate the seed manifest only after an accepted task-graph change:

```bash
node tools/beads/export-seed-manifest.mjs
```
