# Multi-Agent Drill

WPHX-806 proves the write-capable parallel-agent protocol before the program splits real work across WordPressHX worktrees and a future GutenbergHX sibling repository.

The drill manifest is:

```text
manifests/operations/multi-agent-drill.v1.json
```

Validate it with:

```bash
npm run operations:multi-agent:check
```

When proving a fresh two-agent selection, also check live readiness:

```bash
node tools/operations/check-multi-agent-drill.mjs --live-ready
```

The current drill pairs:

- `WPHX-011` license/provenance audit.
- `WPHX-016` Beads CLI upgrade evaluation.

These tasks are intentionally independent: they have different Beads issue IDs, branches, worktrees, owned paths, generated outputs, and handoff discoveries. Shared generated outputs, such as receipt evidence links and `.beads/issues.jsonl`, are coordinator-owned and rebuilt after integration.

## Worker Setup

From a nested checkout or task worktree, pin Beads to the program root:

```bash
export WPHX_ROOT=/absolute/path/to/wordpresshx
"$WPHX_ROOT/tools/bd-wphx" ready --json
```

The wrapper changes directory to the program root before invoking `bd`; it does not create a second task database.

Each write-capable worker receives:

- a Beads issue ID and `WPHX-*` external ref;
- a branch and worktree under `../wordpresshx-worktrees/`;
- a generated task packet path;
- owned paths, generated paths, and read-only reference paths;
- required handoff fields.

## Handoff Review

The coordinator must reject integration when:

- two workers claim the same issue;
- branches or worktrees collide;
- owned, generated, or conditional paths overlap;
- a worker manually edits coordinator-owned shared outputs;
- a discovery is omitted from the handoff or lacks a resolution.

For a future `gutenberghx` repository, the same drill applies with `wordpress-hx` as the Beads and receipt authority. Cross-repo receipts must name both the WordPressHX program commit and the GutenbergHX implementation commit.
