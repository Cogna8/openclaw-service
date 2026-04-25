import type { MatchResult, NormalizedToolCall } from "./rule-matcher.js";

export type ConfirmPromptPayload = {
  title: string;
  description: string;
  severity: "warning" | "critical";
};

const TITLE_BY_ACTION_CLASS: Record<string, string> = {
  exec: "Command execution requires approval",
  file_delete: "File deletion requires approval",
  file_write: "File write requires approval",
  browser: "Browser action requires approval",
  message_send: "Message send requires approval",
  email_send: "Email action requires approval",
  email_archive: "Email action requires approval",
  email_delete: "Email action requires approval",
  calendar_write: "Calendar change requires approval",
  memory_write: "Memory change requires approval",
  memory_delete: "Memory change requires approval",
  cron_create: "Scheduled task change requires approval",
  cron_delete: "Scheduled task change requires approval",
  session_spawn: "Sub-agent spawn requires approval",
};

const CRITICAL_ACTION_CLASSES = new Set<string>(["exec", "file_delete"]);

const CRITICAL_PATH_PREFIXES = [
  "/etc/",
  "/usr/",
  "/system/",
  "/bin/",
  "/sbin/",
  "~/.ssh/",
  "~/.aws/",
  "~/.config/gcloud/",
];

const FALLBACK_TITLE = "Tool call requires approval";

function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return value.slice(0, max - 1) + "…";
}

function isCriticalPath(path: string | null): boolean {
  if (!path) return false;
  const lower = path.toLowerCase();
  return CRITICAL_PATH_PREFIXES.some((p) => lower.startsWith(p));
}

export function buildConfirmPrompt(
  match: MatchResult,
  call: NormalizedToolCall,
): ConfirmPromptPayload {
  const actionClass = call.actionClass ?? null;
  const toolName = call.toolName;

  let title = FALLBACK_TITLE;
  if (actionClass && TITLE_BY_ACTION_CLASS[actionClass]) {
    title = TITLE_BY_ACTION_CLASS[actionClass];
  }
  title = truncate(title, 80);
  if (title.length < 8) title = FALLBACK_TITLE;

  let description: string;
  if (call.path) {
    description = `${toolName} — ${call.path}`;
  } else if (call.resourceId) {
    description = `${toolName} — ${call.resourceId}`;
  } else {
    description = toolName;
  }

  description = truncate(description, 256);
  if (description.endsWith(" — ")) description = toolName;
  if (description.length < 3) description = toolName;

  const critical =
    (actionClass !== null && CRITICAL_ACTION_CLASSES.has(actionClass)) ||
    isCriticalPath(call.path);

  void match;

  return {
    title,
    description,
    severity: critical ? "critical" : "warning",
  };
}
