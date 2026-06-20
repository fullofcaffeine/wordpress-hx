# Agent Instructions

This project uses **bd** (beads) for issue tracking. Run `bd prime` at session start for current workflow context.

The product and architecture authority is `docs/prd/wordpress-haxe-port.md`. Do not begin broad WordPress or Gutenberg source translation before the PRD feasibility gates pass.

## Work Surface

- This repository is the program control plane and future Haxe implementation home.
- A future `../gutenberghx` sibling repo may hold Gutenberg package implementation work after the browser feasibility gates justify parallelization. Until an ADR says otherwise, this repo's Beads database remains the task authority for that work.
- `../wordpress-develop` is the vanilla WordPress 7.0 oracle checkout. Treat it as read-only unless a task explicitly says otherwise.
- `../gutenberg` is the forward Gutenberg 23.4 oracle checkout. Do not mix this baseline into the WordPress 7.0 distribution track without an ADR.
- `../genes` is the active genes-ts compiler checkout. Compiler fixes discovered here must be generic genes-ts work, not WordPress-specific special cases.
- `../haxe.compilerdev.reference/haxe` is the Haxe 4.3.7 compiler source reference, including the PHP generator. Treat the wider `../haxe.compilerdev.reference` tree as reference material with nested repos.
- `../haxe.compilerdev.reference` also contains local source references for tink/coconut/genes-style libraries. Use `../haxe.compilerdev.reference/tink_hxx` when designing HHX/markup parsing and typed template authoring.
- `../opencodehx` and `../codex-hxrust` are precedent/reference repos for porting workflow, Beads practice, compiler-pressure handling, and generated-target quality. Do not copy their rules blindly; adapt only what fits this PRD.

Record checkout paths, commits, dirty state, and intended authority in `upstream.lock.json` or later lock manifests before using a repo as evidence.

## Core Porting Rules

1. Behavioral parity wins. Upstream WordPress and Gutenberg are the oracles; a cleaner Haxe design is not enough to change observable behavior.
2. Haxe-authored source is authoritative for migrated runtime logic. Generated PHP, TypeScript, TSX, JavaScript, source maps, manifests, and distro files are build artifacts.
3. This is a complete port, not a typed wrapper layer. Typed compatibility surfaces are bootstrap scaffolding for ABI preservation, inventories, shells, and oracle tests; every temporary wrapper needs an ownership state and removal gate.
4. Fix design smells when evidence and tests protect the compatibility boundary. Before parity, internal improvements must preserve observable behavior; after parity, refactor behind the same oracle gates.
5. Never hand-edit generated target files. Fix Haxe source, macros, the linker, genes-ts, or the Haxe PHP backend.
6. Do not hide unsupported constructs. Create Beads issues and compiler-pressure records with minimized fixtures, upstream references, fallback, and removal condition.
7. Keep upstream checkouts as siblings by default. Do not vendor, copy, or submodule WordPress, Gutenberg, genes-ts, or compiler repos unless a Beads task and ADR explicitly choose that path.
8. Keep CAF out of bootstrap work. Preserve machine-readable boundaries for future ingestion, but do not add CAF commands, gates, or dependencies during the initial program setup.

## Haxe and Target Design

- Prefer typed Haxe models, abstracts, enums, typedefs, and macros where they strengthen the source without obscuring target behavior.
- Target-shaped Haxe is allowed when it preserves WordPress PHP, browser, React, or package semantics. Do not add a broad portability abstraction before parity evidence exists.
- Avoid casual `Dynamic`, `untyped`, raw `php.Syntax.code`, raw JavaScript, broad casts, or generated `any`. Use them only at documented runtime/compiler boundaries, keep the scope tiny, and file follow-up work when the boundary should narrow.
- Macros should generate deterministic boilerplate, manifests, validators, and ABI bindings. They should not become broad textual rewrites of generated PHP or TypeScript.
- Public PHP boundaries must preserve native PHP arrays, globals, references, conditional declarations, reflection-visible signatures, classes, traits, include timing, and mixed template behavior.
- Browser boundaries must preserve package exports, WordPress script handles, globals, object semantics, React/TSX behavior, source maps, and upstream bundling expectations.

## Compiler Improvement Loop

When this port exposes a genes-ts or Haxe PHP target limitation:

1. Reduce it to the smallest generic fixture.
2. File/link Beads work in this repo and, when editing a sibling compiler repo, follow that repo's own `AGENTS.md` and task workflow.
3. Fix the compiler generically. Never add WordPress/Gutenberg path names, product assumptions, or one-off special cases to `../genes` or Haxe compiler code.
4. Run the relevant compiler checks before relying on the fix here.
5. Update pins, manifests, compiler-pressure records, and receipts only after the fix is landed or explicitly recorded as temporary local evidence.

Generated target readability is a product surface. If good Haxe source emits weak, noisy, or invalid target code, prefer a generic compiler improvement over source contortions.

## Documentation

Keep `README.md`, `docs/operations/repositories.md`, `docs/operations/dependent-libraries.md`, `docs/operations/hhx-template-policy.md`, `docs/operations/port-philosophy.md`, `docs/operations/beads.md`, `docs/operations/agent-instructions.md`, `docs/operations/ownership-state-model.md`, lock manifests, `AGENTS.md`, and Beads current as repo paths, baselines, gates, or operating rules change. Do not let chat history become the only source of truth.

## Beads Authority

- Required local Beads version is pinned in `.beads/.local_version` and mirrored in `toolchain.lock.json`.
- The root `.beads` store is authoritative for this program. Sibling repo `.beads` stores are reference context unless the current task explicitly enters that repository and follows its own `AGENTS.md`.
- From sibling checkouts, nested repos, or task worktrees, use `tools/bd-wphx` from the program root so Beads commands resolve to this repository's root database.
- Parallel write-capable agents must follow `docs/operations/multi-agent.md`: one claimed Beads issue, one branch, one worktree, non-overlapping owned paths, and a handoff that records discoveries.
- Beads sync branch setup is intentionally deferred to WPHX-807; until then, `bd doctor` may warn about missing sync-branch configuration but must not report data corruption or untracked JSONL.

## Local Hooks and Checks

- Install hooks with `npm run hooks:install` after cloning or when hook scripts change.
- The pre-commit hook must run a staged gitleaks scan and format staged `.hx` files with `haxelib run formatter`.
- Use `npm run security:gitleaks` for full-history secret scanning.
- Use `npm run format:haxe:check` for tracked Haxe formatting checks. It is valid for this to report no tracked Haxe files during bootstrap.

## Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Atomically claim work
bd close <id>         # Complete work
bd sync               # Sync with git
```

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
