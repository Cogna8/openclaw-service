// k6 latency benchmark for POST /api/v1/evaluate (COG-166 v0.4 T1.5).
//
// Phases (selected via PHASE env var, default = measurement):
//   warmup       — ramping-arrival-rate, 0 → 100 RPS over 60s. Discard.
//   measurement  — constant 100 RPS for 5 min. The reportable run.
//   soak         — constant  50 RPS for 60 min. Memory / drift check.
//
// Run from Sydney for syd1-local latency. If you must run from elsewhere,
// capture an RTT baseline first (see README) and add the cross-region caveat
// to the report header.

import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";
import {
  buildPayload,
  EXPECTED_DISTRIBUTION,
  MIX_TOLERANCE,
  MISMATCH_CEILING,
} from "./payloads.js";

const BASE_URL =
  __ENV.CG8_BENCHMARK_BASE_URL || "https://openclaw-api.cogna8.ai";
const API_KEY = __ENV.CG8_BENCHMARK_API_KEY;
const AGENT_ID = __ENV.CG8_BENCHMARK_AGENT_ID;
const RUN_LABEL = __ENV.CG8_BENCHMARK_RUN_LABEL || "unlabeled";
const PHASE = __ENV.PHASE || "measurement";

if (!API_KEY) throw new Error("CG8_BENCHMARK_API_KEY is required");
if (!AGENT_ID) throw new Error("CG8_BENCHMARK_AGENT_ID is required");

const PHASES = {
  warmup: {
    executor: "ramping-arrival-rate",
    startRate: 0,
    timeUnit: "1s",
    preAllocatedVUs: 50,
    maxVUs: 200,
    stages: [{ target: 100, duration: "60s" }],
  },
  measurement: {
    executor: "constant-arrival-rate",
    rate: 100,
    timeUnit: "1s",
    duration: "5m",
    preAllocatedVUs: 50,
    maxVUs: 200,
  },
  soak: {
    executor: "constant-arrival-rate",
    rate: 50,
    timeUnit: "1s",
    duration: "60m",
    preAllocatedVUs: 30,
    maxVUs: 100,
  },
};

const phaseConfig = PHASES[PHASE];
if (!phaseConfig) {
  throw new Error(
    `Unknown PHASE=${PHASE}. Use one of: ${Object.keys(PHASES).join(", ")}`,
  );
}

// Per-decision rate metrics. Each request marks exactly one as `true` and the
// others as `false`, so each metric's `rate` value equals that decision's
// observed share of total requests. Thresholds bound the run-level mix.
const decisionAllowRate = new Rate("decision_allow_rate");
const decisionBlockRate = new Rate("decision_block_rate");
const decisionConfirmRate = new Rate("decision_confirm_rate");

// Mismatch = harness predicted X (from tool name) but server returned Y.
// Bench rules are deterministic; non-zero mismatch means rule drift.
const decisionMismatchRate = new Rate("decision_mismatch_rate");

// Counters for the human-readable summary.
const decisionAllow = new Counter("decisions_allow_total");
const decisionBlock = new Counter("decisions_block_total");
const decisionConfirm = new Counter("decisions_confirm_total");
const decisionUnexpected = new Counter("decisions_unexpected_total");
const decisionMismatch = new Counter("decisions_mismatch_total");

// Pre-declare counters for status codes we expect to see.
// k6 requires metrics declared at init time, not lazily inside iteration.
const httpStatus200 = new Counter("http_status_200");
const httpStatus400 = new Counter("http_status_400");
const httpStatus401 = new Counter("http_status_401");
const httpStatus403 = new Counter("http_status_403");
const httpStatus404 = new Counter("http_status_404");
const httpStatus429 = new Counter("http_status_429");
const httpStatus500 = new Counter("http_status_500");
const httpStatus502 = new Counter("http_status_502");
const httpStatus503 = new Counter("http_status_503");
const httpStatus504 = new Counter("http_status_504");
const httpStatusOther = new Counter("http_status_other");

function bumpStatus(code) {
  switch (code) {
    case 200: httpStatus200.add(1); break;
    case 400: httpStatus400.add(1); break;
    case 401: httpStatus401.add(1); break;
    case 403: httpStatus403.add(1); break;
    case 404: httpStatus404.add(1); break;
    case 429: httpStatus429.add(1); break;
    case 500: httpStatus500.add(1); break;
    case 502: httpStatus502.add(1); break;
    case 503: httpStatus503.add(1); break;
    case 504: httpStatus504.add(1); break;
    default: httpStatusOther.add(1);
  }
}

const lo = (target) => Math.max(0, target - MIX_TOLERANCE).toFixed(4);
const hi = (target) => Math.min(1, target + MIX_TOLERANCE).toFixed(4);

export const options = {
  scenarios: { [PHASE]: phaseConfig },
  // Tags applied to every metric sample so the JSON output is queryable.
  tags: {
    phase: PHASE,
    run_label: RUN_LABEL,
  },
  thresholds: {
    // Service health: bench traffic should not 5xx and should stay well under
    // the 500ms p99 publish target. p99<2000 is a soft circuit-breaker.
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(99)<2000"],
    // Decision mix must converge to the target distribution within tolerance.
    // Failure here means the workload is no longer representative.
    decision_allow_rate: [
      `rate>=${lo(EXPECTED_DISTRIBUTION.allow)}`,
      `rate<=${hi(EXPECTED_DISTRIBUTION.allow)}`,
    ],
    decision_block_rate: [
      `rate>=${lo(EXPECTED_DISTRIBUTION.block)}`,
      `rate<=${hi(EXPECTED_DISTRIBUTION.block)}`,
    ],
    decision_confirm_rate: [
      `rate>=${lo(EXPECTED_DISTRIBUTION.confirm)}`,
      `rate<=${hi(EXPECTED_DISTRIBUTION.confirm)}`,
    ],
    // Bench rules are deterministic, so any expected/actual divergence is a
    // bench-environment problem (rules edited mid-run, etc.).
    decision_mismatch_rate: [`rate<${MISMATCH_CEILING}`],
  },
};

export default function () {
  const { body, expectedDecision } = buildPayload(AGENT_ID);
  const res = http.post(`${BASE_URL}/api/v1/evaluate`, JSON.stringify(body), {
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    tags: { expected_decision: expectedDecision },
  });

  bumpStatus(res.status);

  const ok = check(res, {
    "status 200": (r) => r.status === 200,
    "decision in {allow, block, confirm}": (r) => {
      try {
        return ["allow", "block", "confirm"].includes(r.json("decision"));
      } catch (_e) {
        return false;
      }
    },
  });

  if (!ok) {
    decisionAllowRate.add(false);
    decisionBlockRate.add(false);
    decisionConfirmRate.add(false);
    decisionMismatchRate.add(true);
    return;
  }

  const decision = res.json("decision");
  decisionAllowRate.add(decision === "allow");
  decisionBlockRate.add(decision === "block");
  decisionConfirmRate.add(decision === "confirm");
  decisionMismatchRate.add(decision !== expectedDecision);

  if (decision === "allow") decisionAllow.add(1);
  else if (decision === "block") decisionBlock.add(1);
  else if (decision === "confirm") decisionConfirm.add(1);
  else decisionUnexpected.add(1);

  if (decision !== expectedDecision) decisionMismatch.add(1);
}

function fmtMs(v) {
  return typeof v === "number" ? `${v.toFixed(2)}ms` : "n/a";
}

function fmtPct(v) {
  return typeof v === "number" ? `${(v * 100).toFixed(2)}%` : "n/a";
}

function fmtTarget(rate) {
  return `${(rate * 100).toFixed(0)}%`;
}

export function handleSummary(data) {
  const m = data.metrics;
  const allow = m.decisions_allow_total?.values?.count || 0;
  const block = m.decisions_block_total?.values?.count || 0;
  const confirm = m.decisions_confirm_total?.values?.count || 0;
  const unexpected = m.decisions_unexpected_total?.values?.count || 0;
  const mismatch = m.decisions_mismatch_total?.values?.count || 0;
  const total = allow + block + confirm + unexpected;

  const lines = [
    "",
    `=== ${RUN_LABEL} / phase=${PHASE} ===`,
    `iterations:           ${m.iterations?.values?.count || 0}`,
    `decisions (total):    ${total}`,
    `  allow:              ${allow} (${fmtPct(m.decision_allow_rate?.values?.rate)}, target ${fmtTarget(EXPECTED_DISTRIBUTION.allow)} ±${MIX_TOLERANCE * 100}pp)`,
    `  block:              ${block} (${fmtPct(m.decision_block_rate?.values?.rate)}, target ${fmtTarget(EXPECTED_DISTRIBUTION.block)} ±${MIX_TOLERANCE * 100}pp)`,
    `  confirm:            ${confirm} (${fmtPct(m.decision_confirm_rate?.values?.rate)}, target ${fmtTarget(EXPECTED_DISTRIBUTION.confirm)} ±${MIX_TOLERANCE * 100}pp)`,
    `  unexpected:         ${unexpected}`,
    `  mismatches (e≠a):   ${mismatch} (${fmtPct(m.decision_mismatch_rate?.values?.rate)}, ceiling ${MISMATCH_CEILING * 100}%)`,
    "",
    "latency (http_req_duration):",
    `  p50:                ${fmtMs(m.http_req_duration?.values?.med)}`,
    `  p95:                ${fmtMs(m.http_req_duration?.values?.["p(95)"])}`,
    `  p99:                ${fmtMs(m.http_req_duration?.values?.["p(99)"])}`,
    `  max:                ${fmtMs(m.http_req_duration?.values?.max)}`,
    "",
    `error rate (http_req_failed): ${fmtPct(m.http_req_failed?.values?.rate)}`,
    "",
    "status code breakdown:",
    ...Object.keys(m)
      .filter((k) => k.startsWith("http_status_"))
      .sort()
      .map((k) => `  ${k.replace("http_status_", "")}: ${m[k]?.values?.count || 0}`),
    "",
  ];

  // Annotate threshold breaches in the textual summary so they're visible
  // even before scrolling to k6's own threshold report.
  const breaches = [];
  for (const [name, t] of Object.entries(data.thresholds || {})) {
    if (t && t.ok === false) breaches.push(name);
  }
  if (breaches.length) {
    lines.push(`!!! threshold breaches: ${breaches.join(", ")}`);
    lines.push("");
  }

  const summary = lines.join("\n");

  return {
    stdout: summary,
    [`results/${PHASE}-${RUN_LABEL}.json`]: JSON.stringify(data, null, 2),
    [`results/${PHASE}-${RUN_LABEL}.summary.txt`]: summary,
  };
}
