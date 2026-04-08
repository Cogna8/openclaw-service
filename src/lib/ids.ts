import { customAlphabet } from "nanoid";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generate = customAlphabet(ALPHABET, 8);

export function generateAccountId(): string {
  return `acct_${generate()}`;
}

export function generateApiKeyId(): string {
  return `key_${generate()}`;
}

export function generateAgentId(): string {
  return `agt_${generate()}`;
}

export function generateRuleId(): string {
  return `rl_${generate()}`;
}

export function generateEvaluationId(): string {
  return `ev_${generate()}`;
}
