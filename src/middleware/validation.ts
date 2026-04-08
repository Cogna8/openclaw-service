import { NextRequest } from "next/server";
import { PayloadTooLargeError, ValidationError } from "../lib/errors.js";

const DEFAULT_MAX_BYTES = 8192;

// --- Body parsing ---

export async function parseJsonBody(
  req: NextRequest,
  maxBytes: number = DEFAULT_MAX_BYTES,
): Promise<unknown> {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json") && !contentType.includes("+json")) {
    throw new ValidationError("Content-Type must be application/json");
  }

  const rawText = await req.text();
  const byteSize = new TextEncoder().encode(rawText).byteLength;

  if (byteSize > maxBytes) {
    throw new PayloadTooLargeError(
      `Request body is ${byteSize} bytes, maximum is ${maxBytes}`,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new ValidationError("Invalid JSON in request body");
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  return parsed;
}

// --- Shared validators ---

export function validateString(
  obj: Record<string, unknown>,
  field: string,
  maxLength?: number,
): string {
  const value = obj[field];
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`, field);
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }
  if (value.trim().length === 0) {
    throw new ValidationError(`${field} must not be empty`, field);
  }
  if (maxLength && value.length > maxLength) {
    throw new ValidationError(
      `${field} must be at most ${maxLength} characters`,
      field,
    );
  }
  return value;
}

export function validateOptionalString(
  obj: Record<string, unknown>,
  field: string,
  maxLength?: number,
): string | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }
  if (maxLength && value.length > maxLength) {
    throw new ValidationError(
      `${field} must be at most ${maxLength} characters`,
      field,
    );
  }
  return value;
}

export function validateEnum<T extends string>(
  obj: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T {
  const value = obj[field];
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`, field);
  }
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }
  const lower = value.toLowerCase() as T;
  if (!allowed.includes(lower)) {
    throw new ValidationError(
      `${field} must be one of: ${allowed.join(", ")}`,
      field,
    );
  }
  return lower;
}

export function validateOptionalEnum<T extends string>(
  obj: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
): T | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new ValidationError(`${field} must be a string`, field);
  }
  const lower = value.toLowerCase() as T;
  if (!allowed.includes(lower)) {
    throw new ValidationError(
      `${field} must be one of: ${allowed.join(", ")}`,
      field,
    );
  }
  return lower;
}

export function validatePositiveInt(
  obj: Record<string, unknown>,
  field: string,
): number {
  const value = obj[field];
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`, field);
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new ValidationError(`${field} must be a positive integer`, field);
  }
  return value;
}

export function validateJsonObject(
  obj: Record<string, unknown>,
  field: string,
): Record<string, unknown> {
  const value = obj[field];
  if (value === undefined || value === null) {
    throw new ValidationError(`${field} is required`, field);
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${field} must be a JSON object`, field);
  }
  return value as Record<string, unknown>;
}

export function validateOptionalJsonObject(
  obj: Record<string, unknown>,
  field: string,
): Record<string, unknown> | undefined {
  const value = obj[field];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError(`${field} must be a JSON object`, field);
  }
  return value as Record<string, unknown>;
}

export function rejectUnknownTopLevelFields(
  obj: Record<string, unknown>,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(obj).filter((k) => !allowed.includes(k));
  if (unknown.length > 0) {
    throw new ValidationError(
      `Unknown field(s): ${unknown.join(", ")}`,
      unknown[0],
    );
  }
}

// --- V1 action classes ---

export const V1_ACTION_CLASSES = [
  "file_read",
  "file_write",
  "file_delete",
  "exec",
  "browser",
  "message_send",
  "email_read",
  "email_send",
  "email_archive",
  "email_delete",
  "calendar_read",
  "calendar_write",
  "memory_write",
  "memory_delete",
  "cron_create",
  "cron_delete",
  "session_spawn",
] as const;

export type V1ActionClass = (typeof V1_ACTION_CLASSES)[number];

const TOOL_NAME_RE = /^[a-zA-Z0-9_-]+$/;

// --- Endpoint-specific validators ---

export function validateEvaluateBody(body: Record<string, unknown>): void {
  rejectUnknownTopLevelFields(body, [
    "agent_id",
    "session",
    "channel",
    "tool_call",
  ]);

  validateString(body, "agent_id");

  // session
  const session = validateJsonObject(body, "session");
  validateString(session, "id", 256);
  validateOptionalString(session, "key", 512);

  // channel
  const channel = validateOptionalJsonObject(body, "channel");
  if (channel) {
    validateOptionalString(channel, "provider", 64);
    validateOptionalEnum(channel, "type", [
      "direct",
      "group",
      "channel",
      "unknown",
    ] as const);
  }

  // tool_call
  const toolCall = validateJsonObject(body, "tool_call");
  const toolName = validateString(toolCall, "tool_name", 128);
  if (!TOOL_NAME_RE.test(toolName)) {
    throw new ValidationError(
      "tool_call.tool_name may only contain alphanumeric characters, underscores, and hyphens",
      "tool_call.tool_name",
    );
  }
  validateOptionalEnum(toolCall, "action_class", V1_ACTION_CLASSES);
  validateOptionalJsonObject(toolCall, "targets");
  validateOptionalJsonObject(toolCall, "scope");

  // raw_input size check
  const rawInput = validateOptionalJsonObject(toolCall, "raw_input");
  if (rawInput) {
    const rawInputBytes = new TextEncoder().encode(
      JSON.stringify(rawInput),
    ).byteLength;
    if (rawInputBytes > 2048) {
      throw new ValidationError(
        "tool_call.raw_input must be at most 2KB when serialized",
        "tool_call.raw_input",
      );
    }
  }
}

const RULE_TYPES = [
  "block",
  "confirm",
  "exclude",
  "protect",
  "threshold",
] as const;

export function validateCreateRuleBody(body: Record<string, unknown>): void {
  rejectUnknownTopLevelFields(body, ["agent_id", "type", "spec"]);

  validateString(body, "agent_id");
  validateEnum(body, "type", RULE_TYPES);
  validateJsonObject(body, "spec");
}

export function validateRegisterAgentBody(body: Record<string, unknown>): void {
  rejectUnknownTopLevelFields(body, ["agent", "tools", "catalog_hash"]);

  // agent
  const agent = validateJsonObject(body, "agent");
  validateString(agent, "external_id", 128);
  validateString(agent, "name", 255);
  validateOptionalEnum(agent, "source", ["openclaw"] as const);
  validateOptionalString(agent, "plugin_version");
  validateOptionalString(agent, "agent_version");

  // tools
  const tools = body.tools;
  if (tools === undefined || tools === null) {
    throw new ValidationError("tools is required", "tools");
  }
  if (!Array.isArray(tools)) {
    throw new ValidationError("tools must be an array", "tools");
  }
  if (tools.length > 200) {
    throw new ValidationError("tools must have at most 200 items", "tools");
  }
  for (let i = 0; i < tools.length; i++) {
    const tool = tools[i];
    if (typeof tool !== "object" || tool === null || Array.isArray(tool)) {
      throw new ValidationError(
        `tools[${i}] must be a JSON object`,
        `tools[${i}]`,
      );
    }
    const t = tool as Record<string, unknown>;
    validateString(t, "name", 128);
    validateOptionalEnum(t, "action_class", V1_ACTION_CLASSES);
  }

  validateString(body, "catalog_hash");
}

export function validateRulesQuery(params: URLSearchParams): {
  agent_id: string;
  status: string;
} {
  const agentId = params.get("agent_id");
  if (!agentId) {
    throw new ValidationError("agent_id query parameter is required", "agent_id");
  }

  const status = params.get("status") ?? "active";
  const allowedStatuses = ["active", "disabled", "all"];
  if (!allowedStatuses.includes(status)) {
    throw new ValidationError(
      `status must be one of: ${allowedStatuses.join(", ")}`,
      "status",
    );
  }

  return { agent_id: agentId, status };
}

export function validateRuleIdParam(ruleId: string): void {
  if (!ruleId || ruleId.trim().length === 0) {
    throw new ValidationError("ruleId is required", "ruleId");
  }
  if (!ruleId.startsWith("rl_")) {
    throw new ValidationError("ruleId must have rl_ prefix", "ruleId");
  }
}
