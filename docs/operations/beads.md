# Beads Operations

`wordpress-hx` uses the root `.beads` directory as the issue database for this porting program. Run `bd prime` before taking work, then claim the specific issue you are changing.

## Version Pin

- Required local Beads version: `1.0.4`.
- The version is pinned in `.beads/.local_version` and mirrored in `toolchain.lock.json`.
- Current database storage: embedded Dolt at `.beads/embeddeddolt/` with tracked JSONL export at `.beads/issues.jsonl`.
- WPHX-016 upgraded from `0.49.0` because the old CLI did not provide `bd backup` or `bd dolt`, both of which are required before WPHX-807 can prove sync and restore.
- Do not upgrade to `1.0.5`; upstream marks that prerelease as gated. Re-evaluate only through a new Beads/toolchain issue.

`bd doctor` in `1.0.4` reports that doctor is not yet supported in embedded mode. Use `bd info`, `bd dolt status --json`, `bd backup status --json`, `bd list --all --json`, and the receipt for WPHX-016 until a later Beads release restores an embedded-mode doctor.

## Root Authority

The root `.beads` database in this repository is the task authority for WordPressHX program work, including future GutenbergHX planning until an ADR explicitly creates a different cross-repo protocol.

Sibling repositories may have their own `.beads` directories. Treat them as local context for those repositories, not as active stores for this program:

- Do not write WordPressHX tasks into sibling `.beads` stores.
- Do not copy sibling Beads rules verbatim into this repo.
- When a task requires editing a sibling repo, enter that repo, read its `AGENTS.md`, and follow its local workflow for that scoped work.
- Mirror any cross-repo decision, dependency, or pin back into this repo through Beads, lock manifests, docs, or receipts.

## Sync Discipline

WPHX-807 configured a Dolt remote at `git+https://github.com/fullofcaffeine/wordpress-hx.git`. Beads state syncs through Dolt refs; `.beads/issues.jsonl` remains a tracked export for review and interchange.

In `1.0.4`, cross-machine sync should use Dolt remotes:

```bash
bd dolt remote add origin <dolt-compatible-remote>
bd dolt push
bd dolt pull
```

Backup and restore should use:

```bash
bd backup init <backup-destination>
bd backup sync
bd backup restore <backup-destination>
```

WPHX-807 owns selecting the durable destination, configuring the remote, and proving restore from a fresh checkout.
The WPHX-807 runbook is `docs/operations/beads-backup-restore.md`.

Before pushing:

```bash
bd export -o .beads/issues.jsonl
git pull --rebase
git push
git status --short --branch
```

The working tree is healthy only when Beads JSONL is committed and the branch is up to date with `origin/main`.

## Health Check

Use:

```bash
bd info
bd dolt status --json
bd backup status --json
bd ready
```

Expected bootstrap status:

- `.beads/` exists at repository root.
- `issues.jsonl` is tracked by git.
- `.beads/embeddeddolt/`, `.beads/backup/`, and `.beads/export-state.json` are local runtime state and ignored by git.
- The Beads merge driver is configured as `bd merge %A %O %A %B`.
- Git hooks are installed from `scripts/hooks`.
- No nested active store is used for this program.

Warnings for missing sync or backup configuration are acceptable only while tracked by WPHX-807.
