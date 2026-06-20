# Toolchain Lock

WPHX-002 pins the bootstrap toolchain before translated WordPress code exists. The lock is intentionally split between executable tools, sibling source repositories, compiler backend sources, and PHP container images.

The active lock is `toolchain.lock.json`. Its first clean build receipt is `receipts/toolchain/wphx-002-toolchain-lock.v1.json`.

## Pinning Rules

- Pin executable tools by observed version and command.
- Pin sibling repositories by committed revision, not by mutable working tree state.
- Record dirty sibling worktrees as observations only.
- Pin PHP CI images by OCI index digest plus Linux amd64 and arm64 child digests.
- Keep generated smoke output outside the repository unless a later issue explicitly promotes it to a fixture.

## Current Scope

The WPHX-002 clean build receipt proves that Haxe 4.3.7 can compile a minimal Haxe program to the PHP target and that the generated PHP can execute under the local PHP 8.4 CLI.

Full compatibility gates remain separate:

- WPHX-101 owns the reusable stock Haxe PHP matrix smoke project.
- WPHX-401 owns the full genes-ts/classic Genes build and output-mode verification.
