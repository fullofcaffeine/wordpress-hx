#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
MODE="full"

if [ "${1:-}" = "--staged" ]; then
  MODE="staged"
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "[gitleaks] ERROR: gitleaks is required but not installed." >&2
  echo "[gitleaks] Install: https://github.com/gitleaks/gitleaks#installing" >&2
  exit 1
fi

CONFIG_ARGS=()
if [ -f "$ROOT_DIR/.gitleaks.toml" ]; then
  CONFIG_ARGS+=(--config "$ROOT_DIR/.gitleaks.toml")
fi

GITLEAKS_HELP="$(gitleaks --help 2>&1 || true)"

if [ "$MODE" = "staged" ]; then
  echo "[gitleaks] Scanning staged changes"
  if printf '%s' "$GITLEAKS_HELP" | grep -q '\<protect\>'; then
    (cd "$ROOT_DIR" && gitleaks protect --staged --redact "${CONFIG_ARGS[@]}")
  elif printf '%s' "$GITLEAKS_HELP" | grep -q '\<git\>'; then
    (cd "$ROOT_DIR" && gitleaks git --staged --redact "${CONFIG_ARGS[@]}")
  else
    echo "[gitleaks] ERROR: unsupported gitleaks CLI; expected 'protect' or 'git' command." >&2
    exit 1
  fi
  exit 0
fi

if ! printf '%s' "$GITLEAKS_HELP" | grep -q '\<detect\>'; then
  echo "[gitleaks] ERROR: unsupported gitleaks CLI; expected 'detect' command." >&2
  exit 1
fi

commit_count="$(git -C "$ROOT_DIR" rev-list --all --count)"
echo "[gitleaks] Scanning repository history ($commit_count commits)"
git -C "$ROOT_DIR" log -p --all --full-history --no-ext-diff \
  | gitleaks detect --pipe --redact "${CONFIG_ARGS[@]}"

echo "[gitleaks] Scanning current working tree"
gitleaks detect --source "$ROOT_DIR" --no-git --redact "${CONFIG_ARGS[@]}"
