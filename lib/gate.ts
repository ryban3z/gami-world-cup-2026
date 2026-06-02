export const GATE_COOKIE = "gami_gate";

/**
 * Constant-time-ish comparison of the submitted password to the configured one.
 * Runs in a Node (server action) context. Returns false if no password is set.
 */
export function checkSitePassword(
  input: string,
  expected: string | undefined,
): boolean {
  if (!expected) return false;
  if (input.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
