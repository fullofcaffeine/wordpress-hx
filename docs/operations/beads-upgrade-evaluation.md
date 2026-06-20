# Beads Upgrade Evaluation

WPHX-016 upgraded this repository from Beads `0.49.0` to stable Beads `1.0.4`.

## Decision

Upgrade accepted and applied.

Reasons:

- `0.49.0` did not provide `bd backup`.
- `0.49.0` did not provide `bd dolt`.
- WPHX-807 requires Dolt sync and `bd backup` restore proof, so staying on `0.49.0` would make the next operation task impossible to complete honestly.
- The official release feed reported `v1.0.4` as the latest stable release, while `v1.0.5` was marked prerelease/gated. Do not upgrade to `1.0.5` under this decision.

Reference docs checked:

- https://github.com/gastownhall/beads/releases
- https://github.com/gastownhall/beads/blob/main/docs/FAQ.md
- https://github.com/gastownhall/beads/blob/main/docs/DOLT.md
- https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md

## Migration Performed

1. Exported current Beads state to `.beads/issues.jsonl`.
2. Created an out-of-repo backup of `.beads`.
3. Installed Beads `v1.0.4` with the official installer, which verified the release checksum.
4. Ran `bd bootstrap --yes` to import the tracked JSONL into embedded Dolt storage.
5. Verified 28 issues: 7 open, 1 in progress, 20 closed.
6. Kept `.beads/issues.jsonl` as the tracked interchange export.

## Hook Impact

The project keeps custom hooks in `scripts/hooks`. `bd migrate hooks --dry-run` reported no required migration for those custom hooks.

`bd info` currently reports two Beads-managed hooks missing because this repo does not install Beads' marker-managed `post-checkout` or `prepare-commit-msg` hooks. That is accepted for now because the project hooks already enforce Beads export, Haxe formatting, and secret scans. Revisit only if a later Beads task adopts marker-managed hooks.

The project hooks were updated from removed `bd sync --flush-only` calls to `bd export -o .beads/issues.jsonl`. `post-merge` keeps a JSONL import fallback until WPHX-807 configures the Dolt remote.

## Follow-Up

WPHX-807 owns:

- configuring a Dolt remote or sync branch;
- configuring a durable `bd backup` destination;
- proving restore from a fresh checkout;
- recording the final sync/backup runbook.
