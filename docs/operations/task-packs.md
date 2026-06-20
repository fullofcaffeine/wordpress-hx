# Task Packs

WPHX-804 adds a deterministic bounded-context packet generator. A task pack is a JSON bundle for one `WPHX-*` issue containing:

- Beads issue details, dependencies, and dependents;
- known related source/docs/tool paths with SHA-256 digests;
- known receipt summaries;
- current baseline, inventory, dashboard, and seed counts;
- useful verification commands.

Generate a pack:

```bash
npm run task-pack -- WPHX-009
```

Write to a specific file:

```bash
npm run task-pack -- WPHX-009 --out build/task-packs/WPHX-009.json
```

Check the sample dashboard task pack:

```bash
npm run task-pack:check
```

Generated packs go under `build/task-packs/` by default and are not committed unless a later task explicitly promotes one to evidence.
