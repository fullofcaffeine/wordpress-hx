#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"

chmod +x "$ROOT_DIR/scripts/hooks/pre-commit"
chmod +x "$ROOT_DIR/scripts/hooks/pre-push"
chmod +x "$ROOT_DIR/scripts/hooks/post-merge"
chmod +x "$ROOT_DIR/scripts/security/run-gitleaks.sh"
chmod +x "$ROOT_DIR/scripts/lint/haxe-format.sh"
git config core.hooksPath scripts/hooks
git config merge.beads.name "Beads JSONL merge driver"
git config merge.beads.driver "bd merge %A %O %A %B"

echo "[hooks] Installed repository hooks from scripts/hooks."
echo "[hooks] Pre-commit runs Beads sync, staged gitleaks, and staged Haxe formatting."
echo "[hooks] Pre-push runs Beads drift checks, full gitleaks, and Haxe format checks."
echo "[hooks] Configured Beads JSONL merge driver."
