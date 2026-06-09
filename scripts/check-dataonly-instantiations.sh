#!/usr/bin/env bash
# Quantitative regression guard for `DataOnly<T>`'s type-graph cost.
#
# `DataOnly` recurses through arbitrary (incl. circular) types; a refactor that
# accidentally removes the depth bound — or makes a branch exponential — would
# balloon TypeScript's instantiation count and, eventually, trip the hard
# TS2589 depth cap. This guard compiles the isolated DataOnly type-test with
# `tsc --extendedDiagnostics` and fails if the `Instantiations:` count exceeds a
# generous budget, catching a blowup long before it becomes a hard error.
#
# Baseline at introduction: ~21k instantiations. Budget is ~3x headroom so it is
# not flaky across TS versions but still catches an order-of-magnitude blowup.
# Override with DATAONLY_INSTANTIATION_BUDGET.
set -euo pipefail

BUDGET="${DATAONLY_INSTANTIATION_BUDGET:-60000}"
cd "$(dirname "$0")/../packages/ts-go-run-types"

OUT="$(pnpm exec tsc -p tsconfig.dataonly-types.json --noEmit --extendedDiagnostics 2>&1)"
echo "$OUT" | grep -iE "Types:|Instantiations:|Check time" || true

if echo "$OUT" | grep -q "error TS"; then
  echo "✗ DataOnly type-test failed to typecheck:"
  echo "$OUT" | grep "error TS"
  exit 1
fi

COUNT="$(echo "$OUT" | grep -i "Instantiations:" | grep -oE "[0-9]+" | head -1)"
if [ -z "$COUNT" ]; then
  echo "✗ could not read Instantiations count from tsc --extendedDiagnostics"
  exit 1
fi

if [ "$COUNT" -gt "$BUDGET" ]; then
  echo "✗ DataOnly instantiations ($COUNT) exceed budget ($BUDGET) — likely a recursion/exponential regression in DataOnly<T>."
  exit 1
fi

echo "✓ DataOnly instantiations ($COUNT) within budget ($BUDGET)."
