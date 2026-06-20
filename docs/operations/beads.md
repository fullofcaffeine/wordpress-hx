# Beads Operations

`wordpress-hx` uses the root `.beads` directory as the issue database for this porting program. Run `bd prime` before taking work, then claim the specific issue you are changing.

## Version Pin

- Required local Beads version: `0.49.0`.
- The version is pinned in `.beads/.local_version` and mirrored in `toolchain.lock.json`.
- Current database storage: SQLite with tracked JSONL export at `.beads/issues.jsonl`.
- Current repo fingerprint observed by `bd doctor`: `3536cce9`.

`bd doctor` may warn that a newer Beads CLI exists. Do not upgrade casually. File or claim a Beads/toolchain issue before changing the pinned version, then update `toolchain.lock.json`, this note, and any affected hooks in the same change.

## Root Authority

The root `.beads` database in this repository is the task authority for WordPressHX program work, including future GutenbergHX planning until an ADR explicitly creates a different cross-repo protocol.

Sibling repositories may have their own `.beads` directories. Treat them as local context for those repositories, not as active stores for this program:

- Do not write WordPressHX tasks into sibling `.beads` stores.
- Do not copy sibling Beads rules verbatim into this repo.
- When a task requires editing a sibling repo, enter that repo, read its `AGENTS.md`, and follow its local workflow for that scoped work.
- Mirror any cross-repo decision, dependency, or pin back into this repo through Beads, lock manifests, docs, or receipts.

## Sync Discipline

For this bootstrap phase, Beads writes directly to the current branch and no sync branch is configured. That is acceptable while this repo is single-operator, but the warning must stay visible in `bd doctor` until WPHX-807 decides the Dolt/sync-branch backup model.

Before pushing:

```bash
bd sync
git pull --rebase
git push
git status --short --branch
```

The working tree is healthy only when Beads JSONL is committed and the branch is up to date with `origin/main`.

## Health Check

Use:

```bash
bd doctor
bd ready
```

Expected bootstrap status:

- `.beads/` exists at repository root.
- `issues.jsonl` is tracked by git.
- The Beads merge driver is configured as `bd merge %A %O %A %B`.
- Git hooks are installed from `scripts/hooks`.
- No nested active store is used for this program.

Warnings for CLI updates and missing sync branch are acceptable only while tracked by open Beads work.
