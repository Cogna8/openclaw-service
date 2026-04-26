// Bench-account capability flag.
//
// Set by direct DB UPDATE only (no API endpoint exposes it):
//   UPDATE accounts SET capability_flags =
//     jsonb_set(capability_flags, '{benchAccount}', 'true') WHERE id = '<uuid>';
//
// When set, /evaluate skips the rate limit and the monthly evaluations cap
// (and the cap-related increment) so latency benchmarks aren't capped.

export const BENCH_ACCOUNT_FLAG = "benchAccount";

export function isBenchAccount(flags: unknown): boolean {
  if (!flags || typeof flags !== "object" || Array.isArray(flags)) {
    return false;
  }
  return (flags as Record<string, unknown>)[BENCH_ACCOUNT_FLAG] === true;
}
