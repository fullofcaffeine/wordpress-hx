# Contributing

This is currently a private experimental program repository.

## Workflow

- Use Beads for task state. Start with `bd prime`, choose work with `bd ready --json`, and claim before editing.
- Keep work tied to PRD external references such as `WPHX-001` through Beads, commits, receipts, and manifests.
- Do not maintain parallel Markdown TODO queues.
- Do not begin broad WordPress or Gutenberg translation before the PRD feasibility gates pass.

## Source Rules

- Treat sibling upstream checkouts as read-only oracles unless a task explicitly authorizes changes.
- Keep compiler fixes generic in their owning repos.
- Do not hand-edit generated target files.
- Record discovered work immediately as Beads issues.

## Landing

Before ending a work session, run the relevant quality gates, sync Beads, commit, push, and verify `git status` is up to date with origin.

