import { customAlphabet } from "nanoid";

const ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const generate = customAlphabet(ALPHABET, 8);

export function generateAccountId(): string {
  return `acct_${generate()}`;
}
