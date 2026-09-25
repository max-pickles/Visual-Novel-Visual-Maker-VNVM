#!/usr/bin/env bash
# Compile fixture projects with VNVMaker's compiler (scripts/renpyFixtures.ts)
# and check them with a real Ren'Py: every game must pass `lint`, and every
# playable one must play through to the end.
#
# Usage: scripts/check-renpy.sh <path to a built Ren'Py checkout>
# Playthroughs need a display; on a headless machine run it under xvfb-run.
set -euo pipefail

RENPY="$(cd "$1" && pwd)"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

"$ROOT/node_modules/.bin/esbuild" "$ROOT/scripts/renpyFixtures.ts" \
  --bundle --platform=node --format=esm --outfile="$OUT/fixtures.mjs" --log-level=warning
node "$OUT/fixtures.mjs" "$OUT/games" "$RENPY" "$ROOT"

export SDL_AUDIODRIVER=dummy
failed=0
for dir in "$OUT"/games/*/; do
  name="$(basename "$dir")"
  if ! (cd "$RENPY" && SDL_VIDEODRIVER=dummy timeout 300 ./run.sh "$dir" lint --error-code > "$OUT/$name.lint.log" 2>&1); then
    echo "::error::Ren'Py lint failed for $name"
    cat "$OUT/$name.lint.log" "$dir/errors.txt" "$dir/traceback.txt" 2>/dev/null || true
    failed=1
    continue
  fi
  if [ -f "$dir/vnv_testcases.rpy" ]; then
    # Lint reports testcase statements as unreachable, so add them only now.
    mv "$dir/vnv_testcases.rpy" "$dir/game/"
    if ! (cd "$RENPY" && timeout 300 ./run.sh "$dir" test vnv_play > "$OUT/$name.play.log" 2>&1); then
      echo "::error::Playthrough failed for $name"
      cat "$OUT/$name.play.log" "$dir/traceback.txt" 2>/dev/null || true
      failed=1
      continue
    fi
    echo "ok: $name (lint, playthrough)"
  else
    echo "ok: $name (lint)"
  fi
done
exit "$failed"
