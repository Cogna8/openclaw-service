# Cogna8 OpenClaw Eval Service — Latency Benchmark v0.4

**Ticket:** COG-166
**Date:** 2026-04-26
**Decision:** **HOLD PUBLISH.** Numbers do not meet publish targets. Architecture changes required (COG-179, COG-180) before re-running. See "Decision and rationale" at end.

---

## Method

### Harness

- Tool: k6 0.55+ (script supports k6 ≥ 0.51 due to optional-chaining usage)
- Location: `Cogna8/openclaw-service/benchmark/openclaw-evaluate/`
- Driven by `run.sh` wrapper for env/cwd consistency
- Workload mix: 70% allow / 20% block / 10% confirm — driven by rule outcomes on the bench agent, not pre-decided in the harness
- Bench agent: `account_id=f7e05518-43f7-4e63-90d1-bd9d4a0b4628` (`acct_qCKGadaO`), agent `default`, 44 block rules + 1 confirm rule (`smoke_test`), no allow rules (allow is implicit on no match)
- Bench-account bypass: `capabilityFlags.benchAccount = true` skips rate limit (100/min/key) and monthly cap (10k evaluations) — see `src/lib/account-flags.ts`

### Payload variation

- Tool name: 10 allow names, 10 block names, 1 confirm name (`smoke_test`)
- Target kind: `sender`, `path`, `resource_id`, null
- Target value: 50/50 mix of values that match deny rules and ones that don't
- `raw_input`: `{0, 512, 1024, 1985}` bytes — capped at 1985 to leave headroom under server's 2KB serialized limit (the original 2048 cap caused 25.7% 400 errors in early runs)

### Profile phases

| Phase | Executor | Rate | Duration | VUs |
|---|---|---|---|---|
| Warmup | ramping-arrival-rate | 0→100 RPS | 60s | 50/200 |
| Measurement | constant-arrival-rate | 100 RPS | 5m | 50/200 |
| Soak | constant-arrival-rate | 50 RPS | 60m | 30/100 |

Soak was **not run** — measurement results made it pointless.

### Decision-mix enforcement (k6 thresholds)

- `decision_allow_rate ∈ [0.65, 0.75]`
- `decision_block_rate ∈ [0.15, 0.25]`
- `decision_confirm_rate ∈ [0.05, 0.15]`
- `decision_mismatch_rate < 0.001` (deterministic bench rules)
- `http_req_failed < 0.01`
- `http_req_duration p99 < 2000ms` (soft circuit-breaker, well above publish target)

---

## Environment

| | |
|---|---|
| Service deployment region | **`syd1`** (Vercel Sydney) — per `vercel.json` |
| Database region | **`ap-southeast-2`** (Neon Sydney) |
| Runner location | **Sydney, AU** (Daniel's MacBook, residential connection) |
| Runner→service network | Sydney→syd1, local — RTT well under 50ms |
| Database driver | Prisma 6.19 + Neon HTTP serverless adapter |
| Service framework | Next.js App Router on Vercel serverless functions |
| Bypass active during run | Yes — bench account flagged via `capability_flags.benchAccount=true` |
| Instrumentation env | `CG8_BENCH_INSTRUMENTATION=1` set in production |

**Important geography note:** This benchmark is a same-region test (Sydney runner → syd1 service → Sydney DB). It is **not representative of customer experience.** Customer base is US, so real-world latency includes ~150-200ms cross-Pacific RTT *on top of* what's measured here. See COG-180.

---

## Raw numbers

### Warmup (1 min, 0→100 RPS ramp — discarded from headline)

| Metric | Value |
|---|---|
| Iterations | 2,999 |
| Decision mix | 70.59% / 19.61% / 9.80% |
| Mismatch rate | 0.00% |
| Error rate | 0.00% |
| p50 | 239.61ms |
| p95 | 423.98ms |
| p99 | n/a (insufficient samples) |
| Max | 1,121ms |
| Status codes | 200: 2999 |

### Measurement (5 min @ 100 RPS — reportable)

| Metric | Value | Target | Verdict |
|---|---|---|---|
| Iterations | 27,867 | — | ~93 RPS sustained |
| Decision mix | 70.06 / 19.73 / 9.86 | 70/20/10 ±5pp | ✓ |
| Mismatch rate | 0.36% | <0.1% | ✗ over by 0.26pp |
| **p50** | **264.60ms** | <80ms | ✗ 3.3× over |
| **p95** | **3,554.54ms** | <200ms | ✗ 17.7× over |
| **p99** | n/a (k6 didn't report — sample distribution issue) | <500ms | unmeasured |
| **Max** | **14,387ms** | — | concerning |
| Error rate | 0.36% | <1% | ✓ |
| Status codes | 200: 27,768 / 500: 99 | — | 99 service errors |

**Notable:** k6 emitted `Insufficient VUs, reached 200 active VUs and cannot initialize more`. Sustained latency was high enough that VU pool ran dry during the run — not all requests issued at the targeted rate.

### Soak

Not run. Measurement failed publish targets and produced 99 service errors. Architectural change required before soak is worth doing.

---

## Hot-path inspection findings

### Check 1: `rules.spec` NOT projected — PASS

Verified by code inspection of `src/services/rule-loader.ts`. Active rule query selects only `id`, `publicId`, `type`, `toolMatch`, `targetKind`, `targetValueNormalized`, `thresholdMax`, `thresholdPeriod`. The `spec` column is explicitly NOT in the select. CLAUDE.md constraint respected.

`EXPLAIN ANALYZE` against the rule fetch query for the bench agent:

```
Seq Scan on public.rules
  cost=0.00..10.42 rows=44 width=155
  actual time=0.011..0.045 rows=53 loops=1
  Filter: ((rules.agent_id = '683a7ead-c9b5-488b-b4f2-ed1815af4ccb'::uuid)
           AND (rules.status = 'active'::rule_status_t))
  Buffers: shared hit=7
Planning Time: 0.107 ms
Execution Time: 0.058 ms
```

**Database is fast. 0.058ms per rule fetch.** The latency problem is not the database.

### Check 2: rule-cache hit rate — INCONCLUSIVE

The cache instrumentation pushed at commit `45d6af2` was supposed to log hit rates every 50 calls. Vercel runtime log access through MCP did not surface the logs during this run. Cannot quote a specific hit rate from this run.

What's known from code:
- Cache TTL is 30 seconds, in-process `Map` keyed by `agentId`
- Per-Vercel-function-instance — cold starts have empty cache
- Under sustained 100 RPS with N concurrent function instances, cache thrash is likely

**Action:** Enable `pg_stat_statements` extension in Neon and re-run a focused query-count check (separate ticket — COG-182 follow-up).

### Check 3: DB roundtrips per evaluate — measured by inspection

Reading `src/services/evaluate.ts` (post-bypass commit `45d6af2`) for the bench-account hot path:

| # | Function | Query | Always runs |
|---|---|---|---|
| 1 | `authenticateRequest` | `apiKey.findFirst` (with `account.capabilityFlags`) | Yes |
| 2 | `apiKey.update` (lastUsedAt) | async, fire-and-forget | Yes (non-blocking) |
| 3 | `resolveAgentForAccount` | `agent` lookup | Yes |
| 4 | `resolveActionClass` | `actionClass` lookup if not provided in request | Conditional (yes for bench — harness doesn't supply) |
| 5 | `loadActiveRulesForAgent` | `rule.findMany` on cache miss | Cache miss only |
| 6 | `getOrCreateCurrentUsagePeriod` (in `$transaction`) | `usagePeriod` upsert | Yes |
| 7 | `tx.usagePeriod.update` | usage increment | Bench skips (bypass) |
| 8 | `storeEvaluationEvent` | `evaluationEvent.insert` | Block/confirm only (~30% for our mix) |

**Per-scenario roundtrip count for bench traffic:**

| Scenario | Approx roundtrips |
|---|---|
| Allow, cache hit, action_class supplied, allow not stored | 4 (auth, agent, period; +1 BEGIN/COMMIT) |
| Allow, cache hit, action_class NOT supplied | 5 |
| Allow, cache MISS | 6 |
| Block, cache hit | 6 (incl. event insert) |
| Confirm, cache hit | 6 (incl. event insert) |

These numbers are from code reading, not from Prisma query logs (logs not retrievable through MCP). The pattern explains the latency: 4-6 sequential HTTPS roundtrips per evaluate call, each ~30-80ms through the Neon HTTP adapter, sums to ~150-400ms before any computation.

**This is the latency bottleneck. Documented as a separate ticket: COG-179.**

---

## Optimization observations

1. **The DB itself is not slow.** EXPLAIN shows ~0.05ms for the rule query.
2. **The Neon HTTP serverless adapter pays a per-query HTTPS roundtrip cost.** This is by design (zero connection pooling, lambda cold-start friendly), but it means 6 queries become 6 sequential HTTPS calls.
3. **Sustained 100 RPS exposed concurrency limits.** k6 ran out of VUs at p95=3554ms, suggesting either Vercel function instance cap or DB connection saturation. 99 of 27,867 requests returned 500 — this would not be acceptable in production.
4. **Cache effectiveness is unverifiable from this run.** Need pg_stat_statements or a structured log channel that survives Vercel's runtime log opacity.

---

## Decision and rationale

**Decision: HOLD PUBLISH.**

Three reasons:

1. **Targets missed by wide margins.** p50 3.3× over, p95 17.7× over. Not "almost there." Architectural.
2. **Geography is wrong for the actual audience.** Service is in syd1, customers are in US. Same-region numbers from Sydney are a baseline, not a publish-grade measurement. See COG-180.
3. **99 service errors at sustained 100 RPS** — even if latency were fine, this is a stability concern. The product cannot claim sub-second latency while throwing 500s.

### What needs to happen before re-publishing

In order:

1. **COG-180** — Move service from syd1 to a US region (iad1 or sfo1). Includes Neon DB migration. Region decision deferred at time of writing.
2. **COG-179** — Reduce evaluate hot-path DB roundtrips from 5-6 to 1-2. Architectural change; design needed.
3. **COG-181** — GitHub Actions benchmark runner in matching US region. Replaces the Sydney-laptop runner.
4. **COG-166 republish** — re-run measurement and soak with the above three landed. New numbers go in the plugin README's "Performance" section if they meet targets.

### What does NOT need to change

- The harness itself (k6 script + payload generator) is solid. Decision mix landed at 70.06/19.73/9.86, mismatch rate at 0.36% (mostly from the brief window before the "Block outbound HTTP" template was re-enabled mid-warmup). Re-use as-is for future runs.
- The bench-account bypass (`capabilityFlags.benchAccount`) works correctly. Verified with 200/0 PASS/FAIL pre-measurement.
- The 30s rule cache logic is correct in isolation. Whether it's effective under sustained load is the open question for COG-179.

---

## Plugin README — NOT updated

`Cogna8/openclaw-plugin/README.md` was NOT updated with latency numbers. Per spec acceptance criteria, the README only gets latency claims when numbers meet targets. They don't. Re-evaluate after COG-180 + COG-179.

---

## Reproducibility

To re-run this benchmark from a Sydney machine:

```
cd ~/path/to/openclaw-service
git pull
./benchmark/openclaw-evaluate/run.sh warmup
./benchmark/openclaw-evaluate/run.sh measurement
```

Results land in `benchmark/openclaw-evaluate/results/<phase>-<run_label>.{json,summary.txt}`.

For a US-region run, see COG-181 (GitHub Actions workflow) once it lands.

---

## Linked tickets

- **COG-166** — this benchmark (status: measurement complete, hold publish)
- **COG-179** — reduce evaluate hot-path DB roundtrips (created from this benchmark)
- **COG-180** — move service to US region (created from this benchmark)
- **COG-181** — GitHub Actions benchmark runner (created from this benchmark, blocked by COG-180)
- **COG-161** — v0.4 production refinement epic (parent)
