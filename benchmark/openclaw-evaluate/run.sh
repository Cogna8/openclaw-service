#!/usr/bin/env bash
# Run the COG-166 latency benchmark. No matter where you are in the repo.
# Usage:  ./benchmark/openclaw-evaluate/run.sh warmup
#         ./benchmark/openclaw-evaluate/run.sh measurement
#         ./benchmark/openclaw-evaluate/run.sh soak
set -euo pipefail

PHASE_ARG="${1:-warmup}"

: "${CG8_BENCHMARK_API_KEY:?Set CG8_BENCHMARK_API_KEY before running (bench account key, not committed)}"
export CG8_BENCHMARK_API_KEY
export CG8_BENCHMARK_AGENT_ID="${CG8_BENCHMARK_AGENT_ID:-default}"
export CG8_BENCHMARK_RUN_LABEL="${CG8_BENCHMARK_RUN_LABEL:-2026-04-26-syd1}"
export PHASE="$PHASE_ARG"

# Always run from the script's own directory so `script.js` and `payloads.js`
# resolve regardless of caller's pwd.
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

echo "==> phase=$PHASE  label=$CG8_BENCHMARK_RUN_LABEL  agent=$CG8_BENCHMARK_AGENT_ID"
echo "==> running from: $SCRIPT_DIR"
echo

k6 run script.js
