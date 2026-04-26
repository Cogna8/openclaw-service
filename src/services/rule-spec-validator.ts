import { ValidationError } from "../lib/errors.js";
import {
  trimWhitespace,
  buildTargetValueNormalized,
} from "../lib/rule-normalization.js";

const TOOL_NAME_RE = /^[a-zA-Z0-9_*-]+$/;
const TARGET_KINDS = ["sender", "path", "resource_id"] as const;

export type ValidatedRuleSpec = {
  normalized: {
    toolMatch: string | null;
    targetKind: "sender" | "path" | "resource_id" | null;
    targetValue: string | null;
    targetValueNormalized: string | null;
    thresholdMax: number | null;
    thresholdPeriod: "session" | null;
  };
  normalizedSpec: Record<string, unknown>;
};

function validateToolField(spec: Record<string, unknown>): string {
  const tool = spec.tool;
  if (tool === undefined || tool === null) {
    throw new ValidationError("spec.tool is required", "spec.tool");
  }
  if (typeof tool !== "string") {
    throw new ValidationError("spec.tool must be a string", "spec.tool");
  }
  const trimmed = trimWhitespace(tool);
  if (trimmed.length === 0) {
    throw new ValidationError("spec.tool must not be empty", "spec.tool");
  }
  if (trimmed.length > 128) {
    throw new ValidationError("spec.tool must be at most 128 characters", "spec.tool");
  }
  if (!TOOL_NAME_RE.test(trimmed)) {
    throw new ValidationError(
      "spec.tool may only contain alphanumeric characters, underscores, hyphens, and the wildcard '*'",
      "spec.tool",
    );
  }
  return trimmed;
}

function validateTargetField(spec: Record<string, unknown>): "sender" | "path" | "resource_id" {
  const target = spec.target;
  if (target === undefined || target === null) {
    throw new ValidationError("spec.target is required", "spec.target");
  }
  if (typeof target !== "string") {
    throw new ValidationError("spec.target must be a string", "spec.target");
  }
  const lower = target.toLowerCase() as (typeof TARGET_KINDS)[number];
  if (!TARGET_KINDS.includes(lower)) {
    throw new ValidationError(
      `spec.target must be one of: ${TARGET_KINDS.join(", ")}`,
      "spec.target",
    );
  }
  return lower;
}

function validateValueField(spec: Record<string, unknown>): string {
  const value = spec.value;
  if (value === undefined || value === null) {
    throw new ValidationError("spec.value is required", "spec.value");
  }
  if (typeof value !== "string") {
    throw new ValidationError("spec.value must be a string", "spec.value");
  }
  const trimmed = trimWhitespace(value);
  if (trimmed.length === 0) {
    throw new ValidationError("spec.value must not be empty", "spec.value");
  }
  if (trimmed.length > 500) {
    throw new ValidationError("spec.value must be at most 500 characters", "spec.value");
  }
  return trimmed;
}

function rejectUnknownSpecFields(
  spec: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(spec).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new ValidationError(
      `Unknown spec field(s): ${unknown.join(", ")}`,
      `spec.${unknown[0]}`,
    );
  }
}

function validateBlock(spec: Record<string, unknown>): ValidatedRuleSpec {
  rejectUnknownSpecFields(spec, ["tool"]);
  const tool = validateToolField(spec);
  return {
    normalized: {
      toolMatch: tool.toLowerCase(),
      targetKind: null,
      targetValue: null,
      targetValueNormalized: null,
      thresholdMax: null,
      thresholdPeriod: null,
    },
    normalizedSpec: { tool },
  };
}

function validateConfirm(spec: Record<string, unknown>): ValidatedRuleSpec {
  rejectUnknownSpecFields(spec, ["tool"]);
  const tool = validateToolField(spec);
  return {
    normalized: {
      toolMatch: tool.toLowerCase(),
      targetKind: null,
      targetValue: null,
      targetValueNormalized: null,
      thresholdMax: null,
      thresholdPeriod: null,
    },
    normalizedSpec: { tool },
  };
}

function validateExclude(spec: Record<string, unknown>): ValidatedRuleSpec {
  rejectUnknownSpecFields(spec, ["tool", "target", "value"]);
  const tool = validateToolField(spec);
  const targetKind = validateTargetField(spec);
  const value = validateValueField(spec);
  return {
    normalized: {
      toolMatch: tool.toLowerCase(),
      targetKind,
      targetValue: value,
      targetValueNormalized: buildTargetValueNormalized(targetKind, value),
      thresholdMax: null,
      thresholdPeriod: null,
    },
    normalizedSpec: { tool, target: targetKind, value },
  };
}

function validateProtect(spec: Record<string, unknown>): ValidatedRuleSpec {
  rejectUnknownSpecFields(spec, ["target", "value"]);
  if (spec.tool !== undefined) {
    throw new ValidationError("spec.tool is not allowed for protect rules", "spec.tool");
  }
  const targetKind = validateTargetField(spec);
  const value = validateValueField(spec);
  return {
    normalized: {
      toolMatch: null,
      targetKind,
      targetValue: value,
      targetValueNormalized: buildTargetValueNormalized(targetKind, value),
      thresholdMax: null,
      thresholdPeriod: null,
    },
    normalizedSpec: { target: targetKind, value },
  };
}

function validateThreshold(spec: Record<string, unknown>): ValidatedRuleSpec {
  rejectUnknownSpecFields(spec, ["tool", "max", "period"]);
  const tool = validateToolField(spec);

  const max = spec.max;
  if (max === undefined || max === null) {
    throw new ValidationError("spec.max is required", "spec.max");
  }
  if (typeof max !== "number" || !Number.isInteger(max)) {
    throw new ValidationError("spec.max must be a positive integer", "spec.max");
  }
  if (max < 1 || max > 1000) {
    throw new ValidationError("spec.max must be between 1 and 1000", "spec.max");
  }

  let period: "session" = "session";
  if (spec.period !== undefined && spec.period !== null) {
    if (typeof spec.period !== "string") {
      throw new ValidationError("spec.period must be a string", "spec.period");
    }
    const lower = spec.period.toLowerCase();
    if (lower !== "session") {
      throw new ValidationError("spec.period must be one of: session", "spec.period");
    }
    period = lower as "session";
  }

  return {
    normalized: {
      toolMatch: tool.toLowerCase(),
      targetKind: null,
      targetValue: null,
      targetValueNormalized: null,
      thresholdMax: max,
      thresholdPeriod: period,
    },
    normalizedSpec: { tool, max, period },
  };
}

const validators: Record<string, (spec: Record<string, unknown>) => ValidatedRuleSpec> = {
  block: validateBlock,
  confirm: validateConfirm,
  exclude: validateExclude,
  protect: validateProtect,
  threshold: validateThreshold,
};

export function validateAndNormalizeRuleSpec(
  type: string,
  spec: Record<string, unknown>,
): ValidatedRuleSpec {
  const validator = validators[type];
  if (!validator) {
    throw new ValidationError(`Unknown rule type: ${type}`, "type");
  }
  return validator(spec);
}
