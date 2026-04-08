export type RuleStatusFields = {
  status: "active" | "disabled" | "removed";
  disabledAt: Date | null;
  removedAt: Date | null;
};

export function activateRule(
  rule: RuleStatusFields,
): { status: "active"; disabledAt: null; removedAt: null } {
  return { status: "active", disabledAt: null, removedAt: null };
}

export function disableRule(
  rule: RuleStatusFields,
): { status: "disabled"; disabledAt: Date; removedAt: null } {
  return { status: "disabled", disabledAt: new Date(), removedAt: null };
}

export function removeRule(
  rule: RuleStatusFields,
): { status: "removed"; removedAt: Date } {
  return { status: "removed", removedAt: new Date() };
}

export function validateRuleStatusConsistency(rule: RuleStatusFields): boolean {
  switch (rule.status) {
    case "active":
      return rule.disabledAt === null && rule.removedAt === null;
    case "disabled":
      return rule.disabledAt !== null && rule.removedAt === null;
    case "removed":
      return rule.removedAt !== null;
    default:
      return false;
  }
}
