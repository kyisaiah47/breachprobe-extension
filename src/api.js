/* THE ONE PLACE THIS EXTENSION TALKS TO BREACHPROBE, AND IT IS THE PRODUCT'S OWN ENDPOINT.
 *
 * ⛔ THERE IS NO SCANNER IN HERE. Every check, every severity, every score and every letter grade
 * is decided by src/lib/scan in ~/CompoundLabs/breachprobe and served from POST /api/scan. A second
 * implementation living in a browser extension would drift from the product within a week and
 * would put a number next to the BreachProbe name that BreachProbe never computed.
 *
 * The request shape is the route's, read off src/app/api/scan/route.ts on 2026-09-04:
 *
 *     POST /api/scan  { url, ownerConfirmed }
 *       400  { error }                       no url, or ownerConfirmed absent
 *       502  { error }                       the engine threw
 *       200  { scanId, ...toFree(result) }
 *
 * and toFree(), in src/lib/scan/index.ts, is:
 *
 *     { url, host, reachable, supabaseDetected, score, grade, counts, summary, scannedAt,
 *       findings: [{ id, category, severity, title, detail }], rlsTeaser }
 *
 * `score` and `grade` are NULL when the host could not be reached. That is deliberate on the
 * product's side and the note on ScanResult says why: a security tool that prints a red F, 0/100
 * for a site it never reached is stating a verdict it did not earn. Nothing here may turn a null
 * into a zero.
 *
 * CORS: this file runs in the service worker, and the manifest carries a host permission for
 * breachprobe.kynth.studio, so the fetch is not a CORS request. Content scripts are the exception
 * to that rule, which is one of the reasons this extension has none.
 */

export const ORIGIN = "https://breachprobe.kynth.studio";
export const SCAN_ENDPOINT = `${ORIGIN}/api/scan`;

/** The full report a scan id addresses on the product's own site. */
export function reportUrl(scanId) {
  return `${ORIGIN}/report/${encodeURIComponent(scanId)}`;
}

/** Where a visitor lands when there is no scan id to point at. */
export function scanPageUrl() {
  return `${ORIGIN}/#scan`;
}

/**
 * Run one scan through BreachProbe.
 *
 * @param {string} url            the page origin being scanned
 * @param {boolean} ownerConfirmed the attestation the route refuses the request without
 * @returns {Promise<object>} the free result, verbatim from the route
 */
export async function runScan(url, ownerConfirmed) {
  const res = await fetch(SCAN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url, ownerConfirmed }),
  });

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* fall through to the status-only message below */
  }

  if (!res.ok) {
    const message = body && typeof body.error === "string" ? body.error : `Scan failed (HTTP ${res.status}).`;
    throw new Error(message);
  }
  if (!body || typeof body !== "object") throw new Error("Scan failed: the response was not readable.");
  return body;
}
