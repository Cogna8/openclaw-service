# /api/v1/evaluate latency benchmark (COG-166 v0.4 T1.5)

k6 harness for the v0.4 latency benchmark of the OpenClaw eval service.

## Targets

Publish gates from the spec:

| metric | target |
|---|---|
| p50 | < 80 ms  |
| p95 | < 200 ms |
| p99 | < 500 ms |

The harness reports these from the `measurement` phase only.

## Layout

```
benchmark/openclaw-evaluate/
├── script.js     # k6 entry point. PHASE-selected scenarios.
├── payloads.js   # Workload generator (tool/target/raw_input rotation).
├── README.md     # This file.
└── results/      # Per-run JSON + text summaries (gitignored except .gitkeep).
```

## Prerequisites

- k6 v0.50+ (`brew install k6` / [k6.io](https://k6.io/docs/getting-started/installation))
- A bench account with `capability_flags.benchAccount = true` set via direct
  DB UPDATE on `accounts`. There is no API endpoint for this flag.
- An ephemeral API key on that account.

## Required environment variables

| var | required | default | notes |
|---|---|---|---|
| `CG8_BENCHMARK_API_KEY`  | yes | — | ephemeral; do not commit |
| `CG8_BENCHMARK_AGENT_ID` | yes | — | external agent id (e.g. `default`) |
| `CG8_BENCHMARK_BASE_URL` | no  | `https://openclaw-api.cogna8.ai` | |
| `CG8_BENCHMARK_RUN_LABEL`| no  | `unlabeled` | tags every metric + result file |
| `PHASE`                  | no  | `measurement` | `warmup` / `measurement` / `soak` |

## Phases

| phase | rate | duration | purpose |
|---|---|---|---|
| `warmup`      | 0 → 100 RPS ramp | 60 s | discard; warms cache, JIT, DB pool |
| `measurement` | 100 RPS constant | 5 min | reportable run for the publish decision |
| `soak`        | 50 RPS constant  | 60 min | drift / memory / connection-leak watch |

## Workload mix

Decisions are driven entirely by `tool_name`. The bench agent has 44 block
rules and 1 confirm rule (`smoke_test`); none use `target_kind`, so target
fields are payload variation only.

| bucket | share | tool names |
|---|---|---|
| allow   | 70% | `echo`, `read_file`, `list_files`, `git_status`, `ping`, `noop`, `head`, `tail`, `ls`, `cat` |
| block   | 20% | `bash`, `rm`, `python`, `curl`, `eval`, `exec`, `write_file`, `delete_file`, `run_python`, `powershell` |
| confirm | 10% | `smoke_test` |

Tolerance: each observed decision rate must land within ±5 percentage points
of its target, otherwise k6 exits non-zero (threshold breach).

> **Confirm-pool caveat.** Only one tool name (`smoke_test`) drives confirm,
> so the confirm slice has zero rule-id diversity. Latency stats for that
> slice are valid; cache/rule-id distribution analysis is not.

## Payload variation per request

- **Tool name** rotates through the bucket pools above (weighted random).
- **Target kind** rotates through `sender` / `path` / `resource_id` / null.
- **Target value** mixes matching and non-matching against rule expectations.
- **`raw_input`** rotates through 0 B / 512 B / 1 KiB / 2 KiB.
- **Session id** cycles through 1000 distinct values (`bench-0` … `bench-999`).
- Total request body is hard-capped at < 8 KiB (service limit).

> **`raw_input` shape caveat.** The 1 KiB / 2 KiB payloads are a single
> `content` key with repeated `x` characters. This exercises serialization
> and network-byte realism (size varies, JSON parse cost scales) but **not**
> real-shape realism (nested objects, mixed types, varied keys). Acceptable
> for latency benchmarking of the eval hot path, since `raw_input` is not
> matched against — it's stored opaquely.

## Running

```bash
export CG8_BENCHMARK_API_KEY='cg8_sk_...'
export CG8_BENCHMARK_AGENT_ID='default'
export CG8_BENCHMARK_RUN_LABEL='2026-04-26-syd1'

# Phase 1: warmup. Discard.
PHASE=warmup k6 run script.js

# Phase 2: measurement. The reportable run.
PHASE=measurement k6 run script.js

# Phase 3: soak (60 min).
PHASE=soak k6 run script.js
```

Each run writes `results/<phase>-<run_label>.json` (full k6 metrics dump)
and `results/<phase>-<run_label>.summary.txt` (human-readable digest).

## Region

Run from Sydney. The service is deployed to `syd1`; running from the same
region keeps cross-region RTT out of the measurement.

If you must run from elsewhere, capture an RTT baseline first and add a
**bold cross-region caveat** to the report header:

```bash
# 100 GETs against /, capture mean and p99
for i in $(seq 1 100); do
  curl -s -o /dev/null -w "%{time_total}\n" \
    "${CG8_BENCHMARK_BASE_URL:-https://openclaw-api.cogna8.ai}/"
done | awk '{
  sum+=$1; a[NR]=$1
} END {
  asort(a); n=NR;
  printf "n=%d mean=%.3fs p99=%.3fs\n", n, sum/n, a[int(n*0.99)]
}'
```

## Threshold breaches → non-zero exit

`script.js` defines thresholds on:

- `http_req_failed   < 1%`
- `http_req_duration p99 < 2000 ms` (soft circuit-breaker, far above publish targets)
- `decision_allow_rate / decision_block_rate / decision_confirm_rate` within ±5pp
- `decision_mismatch_rate < 0.1%` (bench rules are deterministic; even a single edited rule mid-run trips this)

Any breach causes k6 to exit non-zero — the run is **invalid for publishing**.

## Security

- The bench API key is ephemeral. Do **not** commit it. `.gitignore` excludes
  `results/` content already; never write the key to a results file or doc.
- The `benchAccount` capability flag is set by direct DB UPDATE only — there
  is no API endpoint for it (deliberate; see `src/lib/account-flags.ts`).
