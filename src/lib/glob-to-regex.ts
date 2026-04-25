/**
 * Converts a glob pattern to an anchored, case-insensitive RegExp.
 *
 * Grammar:
 *   *   matches any sequence of characters EXCEPT '/'
 *   **  matches any sequence including '/'
 *   Everything else is treated literally (regex metacharacters escaped).
 *
 * The result is anchored with ^...$ and uses the 'i' flag.
 *
 * Examples:
 *   "bash"        -> /^bash$/i
 *   "bash*"       -> /^bash[^/]*$/i
 *   "*delete*"    -> /^[^/]*delete[^/]*$/i
 *   "/etc/*"      -> /^\/etc\/[^/]*$/i
 *   "/etc/**"     -> /^\/etc\/.*$/i
 *   "a.b"         -> /^a\.b$/i  (literal)
 */
export function globToRegex(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i]!;
    if (ch === "*") {
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 2;
      } else {
        out += "[^/]*";
        i += 1;
      }
      continue;
    }
    if (/[.+?^${}()|[\]\\]/.test(ch)) {
      out += "\\" + ch;
    } else {
      out += ch;
    }
    i += 1;
  }
  return new RegExp("^" + out + "$", "i");
}

/**
 * Returns true if a string contains any glob metacharacter.
 * Used to skip regex compilation for rules that don't need it.
 */
export function hasGlob(pattern: string): boolean {
  return pattern.includes("*");
}
