#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(git rev-parse --show-toplevel)"
MODE="check"

if [ "${1:-}" = "--write" ]; then
  MODE="write"
fi

if ! haxelib run formatter --help >/dev/null 2>&1; then
  echo "[haxe-format] ERROR: haxelib formatter is required." >&2
  echo "[haxe-format] Install: haxelib install formatter" >&2
  exit 1
fi

HX_FILES=()
while IFS= read -r hx_file; do
  if [ -n "$hx_file" ]; then
    HX_FILES+=("$hx_file")
  fi
done < <(
  git -C "$ROOT_DIR" ls-files '*.hx' \
    ':!build/*' ':!dist/*' ':!src-gen/*' ':!vendor/*' \
    || true
)

if [ "${#HX_FILES[@]}" -eq 0 ]; then
  echo "[haxe-format] No tracked Haxe files."
  exit 0
fi

FORMAT_ARGS=()
for hx_file in "${HX_FILES[@]}"; do
  FORMAT_ARGS+=("-s" "$ROOT_DIR/$hx_file")
done

if [ "$MODE" = "write" ]; then
  haxelib run formatter "${FORMAT_ARGS[@]}"
else
  haxelib run formatter --check "${FORMAT_ARGS[@]}"
fi

