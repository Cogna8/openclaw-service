export function trimWhitespace(value: string): string {
  return value.trim();
}

export function lowercaseEnumValues(value: string): string {
  return value.toLowerCase();
}

export function lowercaseEmail(value: string): string {
  return value.toLowerCase().trim();
}

export function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

export function buildTargetValueNormalized(
  targetKind: "sender" | "path" | "resource_id",
  targetValue: string,
): string {
  const trimmed = trimWhitespace(targetValue);
  switch (targetKind) {
    case "sender":
      return lowercaseEmail(trimmed);
    case "path":
      return normalizePath(trimmed).toLowerCase();
    case "resource_id":
      return trimmed.toLowerCase();
  }
}

export type RuleFingerprintInput = {
  type: "block" | "confirm" | "exclude" | "protect" | "threshold";
  toolMatch?: string;
  targetKind?: "sender" | "path" | "resource_id";
  targetValue?: string;
  thresholdMax?: number;
  thresholdPeriod?: "session";
};

export function buildNormalizedFingerprint(input: RuleFingerprintInput): string {
  const { type } = input;

  switch (type) {
    case "block":
      return `block:${input.toolMatch ?? ""}`;
    case "confirm":
      return `confirm:${input.toolMatch ?? ""}`;
    case "exclude": {
      const normalized = buildTargetValueNormalized(
        input.targetKind!,
        input.targetValue!,
      );
      return `exclude:${input.toolMatch ?? ""}:${input.targetKind}:${normalized}`;
    }
    case "protect": {
      const normalized = buildTargetValueNormalized(
        input.targetKind!,
        input.targetValue!,
      );
      return `protect:${input.targetKind}:${normalized}`;
    }
    case "threshold":
      return `threshold:${input.toolMatch ?? ""}:${input.thresholdMax}:${input.thresholdPeriod}`;
  }
}
