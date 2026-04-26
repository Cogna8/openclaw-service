// Workload generator for the /api/v1/evaluate latency benchmark.
//
// The bench agent (acct_qCKGadaO / agent default) has 44 block rules + 1
// confirm rule (smoke_test). Decisions are driven entirely by tool_name —
// none of the bench rules use target_kind. So the harness predicts the
// decision from the tool name alone and verifies it post-hoc.

const TOOLS = {
  // Tool names with NO matching rule → server returns "allow".
  allow: [
    "echo",
    "read_file",
    "list_files",
    "git_status",
    "ping",
    "noop",
    "head",
    "tail",
    "ls",
    "cat",
  ],
  // Tool names that match a block rule → server returns "block".
  block: [
    "bash",
    "rm",
    "python",
    "curl",
    "eval",
    "exec",
    "write_file",
    "delete_file",
    "run_python",
    "powershell",
  ],
  // Tool names that match the single confirm rule → server returns "confirm".
  confirm: ["smoke_test"],
};

export const EXPECTED_DISTRIBUTION = {
  allow: 0.7,
  block: 0.2,
  confirm: 0.1,
};

// Tolerance bounds for the run-level decision mix, expressed as absolute rate
// (e.g. allow target 0.70 ± 0.05 → [0.65, 0.75]). Used by script.js thresholds.
export const MIX_TOLERANCE = 0.05;

// Per-request mismatch rate ceiling (expected vs actual decision).
// Bench rules are deterministic, so any mismatch is rule drift — set the
// floor low enough to catch even single-rule edits mid-run.
export const MISMATCH_CEILING = 0.001;

const TARGET_KINDS = ["sender", "path", "resource_id", null];
const RAW_INPUT_SIZES = [0, 512, 1024, 1985];  // 1985 + {"content":""} wrapper = 1998 bytes, safely under 2KB cap

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickBucket() {
  const r = Math.random();
  if (r < EXPECTED_DISTRIBUTION.allow) return "allow";
  if (r < EXPECTED_DISTRIBUTION.allow + EXPECTED_DISTRIBUTION.block) return "block";
  return "confirm";
}

// Bench rules ignore targets, so this exists purely to vary payload shape and
// size across requests so we exercise serialization/normalization realistically.
function pickTargets() {
  const kind = pick(TARGET_KINDS);
  if (kind === null) return undefined;
  const matching = Math.random() < 0.5;
  switch (kind) {
    case "sender":
      return {
        sender: matching
          ? "sarah@example.com"
          : `user${Math.floor(Math.random() * 1000)}@example.com`,
      };
    case "path":
      return {
        path: matching
          ? "/etc/passwd"
          : `/tmp/file_${Math.floor(Math.random() * 10000)}.txt`,
      };
    case "resource_id":
      return {
        resource_id: matching
          ? "res_protected_1"
          : `res_${Math.floor(Math.random() * 10000)}`,
      };
  }
  return undefined;
}

function pickRawInput() {
  const size = pick(RAW_INPUT_SIZES);
  if (size === 0) return undefined;
  return { content: "x".repeat(size) };
}

let sessionCounter = 0;

export function buildPayload(agentId) {
  const bucket = pickBucket();
  const tool = pick(TOOLS[bucket]);
  sessionCounter += 1;

  // Recycle through 1000 distinct sessions so we exercise the path where the
  // session is new vs repeat without unbounded session-id growth.
  const sessionId = `bench-${sessionCounter % 1000}`;

  const toolCall = { tool_name: tool };
  const targets = pickTargets();
  if (targets) toolCall.targets = targets;
  const rawInput = pickRawInput();
  if (rawInput) toolCall.raw_input = rawInput;

  const body = {
    agent_id: agentId,
    session: { id: sessionId },
    tool_call: toolCall,
  };

  // Body cap = 8 KiB per the service. With 2 KiB raw_input cap and small
  // metadata we should be well under, but guard against drift.
  const json = JSON.stringify(body);
  if (json.length > 8000) {
    delete body.tool_call.raw_input;
  }

  return { body, expectedDecision: bucket };
}
