# Port Slice Task Template

Use this template when creating or refining Beads issues for source translation, wrappers, template adoption, compiler-pressure work, or smell fixes.

## Scope

- Beads issue:
- External ref:
- Owned Haxe paths:
- Generated artifact paths:
- Upstream oracle paths and refs:
- Public contract surface:

## Ownership

- Starting ownership state: `external_oracle | temporary_bridge | scaffolded_haxe | haxe_parity_candidate | verified_haxe_owned`
- Target ownership state:
- Ownership manifest path:
- Required manifest schema: `manifests/schemas/ownership-manifest.schema.json`

If the slice introduces or keeps a `temporary_bridge`, include:

- Bridge kind:
- Why this bridge is necessary now:
- Behavior/ABI/template/package boundary that contains it:
- Removal owner issue:
- Removal condition:
- Target state after removal:

Do not close the task while a temporary bridge has no removal condition.

## Smell Fix Policy

If the slice fixes a design smell, record:

- Smell being fixed:
- Why this is safe before or after parity:
- Expected observable behavior: `no_observable_change | adr_approved_behavior_change`
- Compatibility evidence:
- ADR path, if behavior changes:

Do not treat a cleaner design as acceptance evidence. Acceptance evidence must come from oracle tests, differential fixtures, ABI manifests, generated-output snapshots, receipts, or an accepted ADR.

## Verification

- Commands to run:
- Required receipts:
- Manifest updates:
- Compiler-pressure follow-ups:
- Known temporary exceptions:

## Close Checklist

- Ownership manifest validates.
- Temporary bridges have removal gates.
- Smell fixes cite compatibility evidence.
- Generated artifacts are reproducible or explicitly deferred.
- Beads issue links receipt paths.
- `bd export -o .beads/issues.jsonl`, quality gates, commit, and push are complete.
