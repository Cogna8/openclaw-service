import type { CachedRule } from "./rule-cache.js";

export type NormalizedToolCall = {
  toolName: string;
  actionClass: string | null;
  sender: string | null;
  path: string | null;
  resourceId: string | null;
  countInSession: number | null;
};

export type MatchResult = {
  ruleId: string;
  rulePublicId: string;
  ruleType: "block" | "confirm" | "exclude" | "protect" | "threshold";
  reasonCode:
    | "protected_target"
    | "blocked_tool"
    | "threshold_exceeded"
    | "excluded_target"
    | "confirmation_required";
  message: string;
};

const PRIORITY_ORDER: CachedRule["type"][] = [
  "protect",
  "block",
  "threshold",
  "exclude",
  "confirm",
];

function toolMatches(rule: CachedRule, call: NormalizedToolCall): boolean {
  if (!rule.toolMatch) return false;

  const toolName = call.toolName.toLowerCase();
  const actionClass = call.actionClass?.toLowerCase() ?? null;

  if (rule.toolMatchRegex) {
    if (actionClass !== null && rule.toolMatchRegex.test(actionClass)) return true;
    return rule.toolMatchRegex.test(toolName);
  }

  const rm = rule.toolMatch.toLowerCase();
  if (actionClass !== null && rm === actionClass) return true;
  return rm === toolName;
}

function targetMatches(
  rule: CachedRule,
  call: NormalizedToolCall,
): boolean {
  if (!rule.targetKind || !rule.targetValueNormalized) return false;

  let callValue: string | null = null;
  if (rule.targetKind === "sender") callValue = call.sender;
  else if (rule.targetKind === "path") callValue = call.path;
  else if (rule.targetKind === "resource_id") callValue = call.resourceId;

  if (callValue === null) return false;

  const cv = callValue.toLowerCase();

  if (rule.targetValueRegex) {
    return rule.targetValueRegex.test(cv);
  }

  return cv === rule.targetValueNormalized.toLowerCase();
}

function targetDescription(rule: CachedRule): string {
  const kind = rule.targetKind === "resource_id" ? "Resource" : rule.targetKind === "sender" ? "Sender" : "Path";
  return `${kind} ${rule.targetValueNormalized}`;
}

function tryMatchProtect(rule: CachedRule, call: NormalizedToolCall): MatchResult | null {
  if (!targetMatches(rule, call)) return null;
  return {
    ruleId: rule.id,
    rulePublicId: rule.publicId,
    ruleType: "protect",
    reasonCode: "protected_target",
    message: `${targetDescription(rule)} is protected`,
  };
}

function tryMatchBlock(rule: CachedRule, call: NormalizedToolCall): MatchResult | null {
  if (!toolMatches(rule, call)) return null;
  return {
    ruleId: rule.id,
    rulePublicId: rule.publicId,
    ruleType: "block",
    reasonCode: "blocked_tool",
    message: `Tool ${rule.toolMatch} is blocked`,
  };
}

function tryMatchThreshold(rule: CachedRule, call: NormalizedToolCall): MatchResult | null {
  if (!toolMatches(rule, call)) return null;
  if (call.countInSession === null || call.countInSession === undefined) return null;
  if (rule.thresholdMax === null || rule.thresholdMax === undefined) return null;
  if (call.countInSession >= rule.thresholdMax) {
    return {
      ruleId: rule.id,
      rulePublicId: rule.publicId,
      ruleType: "threshold",
      reasonCode: "threshold_exceeded",
      message: `${rule.toolMatch} limit of ${rule.thresholdMax} per session exceeded`,
    };
  }
  return null;
}

function tryMatchExclude(rule: CachedRule, call: NormalizedToolCall): MatchResult | null {
  if (!toolMatches(rule, call)) return null;
  if (!targetMatches(rule, call)) return null;
  return {
    ruleId: rule.id,
    rulePublicId: rule.publicId,
    ruleType: "exclude",
    reasonCode: "excluded_target",
    message: `${targetDescription(rule)} excluded from ${rule.toolMatch}`,
  };
}

function tryMatchConfirm(rule: CachedRule, call: NormalizedToolCall): MatchResult | null {
  if (!toolMatches(rule, call)) return null;
  return {
    ruleId: rule.id,
    rulePublicId: rule.publicId,
    ruleType: "confirm",
    reasonCode: "confirmation_required",
    message: `Confirmation required before ${rule.toolMatch}`,
  };
}

const matchers: Record<CachedRule["type"], (rule: CachedRule, call: NormalizedToolCall) => MatchResult | null> = {
  protect: tryMatchProtect,
  block: tryMatchBlock,
  threshold: tryMatchThreshold,
  exclude: tryMatchExclude,
  confirm: tryMatchConfirm,
};

export function matchRules(rules: CachedRule[], call: NormalizedToolCall): MatchResult | null {
  for (const type of PRIORITY_ORDER) {
    const group = rules.filter((r) => r.type === type);
    for (const rule of group) {
      const result = matchers[type](rule, call);
      if (result) return result;
    }
  }
  return null;
}
