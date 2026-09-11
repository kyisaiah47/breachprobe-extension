/* BREACHPROBE'S OWN VOCABULARY, COPIED FROM THE PRODUCT AND NOT INVENTED HERE.
 *
 * Everything in this file traces to a file in ~/CompoundLabs/breachprobe, read 2026-09-04:
 *
 *   SEVERITY order and names   src/lib/scan/types.ts  ('critical' | 'high' | 'medium' | 'low' | 'pass')
 *   severity colours           BRAND-ASSETS.json      colors.severity, the register's `.rs-sev` ramp
 *   the "low has no fill" rule BRAND-ASSETS.json      "most rows are low and a table that is
 *                                                      entirely coloured says nothing"
 *   CATEGORY names             src/lib/scan/types.ts  ('keys' | 'database' | 'rls' | 'headers' | 'auth')
 *   the WHERE column           src/components/ScanForm.tsx  WHERE, the same five strings
 *   accent / ink / panel / page BRAND-ASSETS.json     colors
 *   the check steps            src/components/ScanForm.tsx  CHECK_STEPS, in the order runScan runs them
 *
 * ⛔ A NEW WORD DOES NOT GET WRITTEN HERE. If the popup needs a label the product does not have,
 * the product is the place to add it. A verdict rendered in a vocabulary BreachProbe does not use
 * is a second product wearing its name.
 */

/** src/lib/scan/types.ts, Severity, in the order the score deducts. */
export const SEVERITY_ORDER = ["critical", "high", "medium", "low", "pass"];

/** The register's `.rs-sev` ramp, BRAND-ASSETS.json colors.severity. `low` carries no fill. */
export const SEVERITY_COLOR = {
  critical: "#ef6b70",
  high: "#f0a25a",
  medium: "#d8c76b",
  low: null,
  pass: "#8ed44a",
};

export const SEVERITY_LABEL = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
  pass: "Pass",
};

/** src/components/ScanForm.tsx, the "Where" column, byte for byte. */
export const CATEGORY_WHERE = {
  keys: "bundle",
  database: "REST",
  rls: "RLS",
  headers: "headers",
  auth: "auth",
};

/** src/components/ScanForm.tsx, CHECK_STEPS, the five stages src/lib/scan actually runs. */
export const CHECK_STEPS = [
  "Fetching the shipped JavaScript",
  "Scanning for exposed API keys",
  "Probing Supabase REST endpoints",
  "Checking security headers",
  "Looking for broken-auth patterns",
];

/** The attestation the scan route refuses the request without, in the landing's own words. */
export const OWNER_CONFIRM_LABEL =
  "I own this app, or I’m authorised to run a security test against it.";

/** BRAND-ASSETS.json colors. */
export const BRAND = {
  accent: "#95c2ff",
  accentHover: "#abcfff",
  ink: "#e5e5e5",
  panel: "#121212",
  page: "#0a0a0a",
};

/** The worst severity present in a set of findings, or null when there is nothing but passes. */
export function worstSeverity(findings) {
  for (const sev of SEVERITY_ORDER) {
    if (sev === "pass") break;
    if (findings.some((f) => f.severity === sev)) return sev;
  }
  return null;
}

/** How many findings are not a pass. The badge counts these. */
export function issueCount(counts) {
  if (!counts) return 0;
  return (counts.critical || 0) + (counts.high || 0) + (counts.medium || 0) + (counts.low || 0);
}
