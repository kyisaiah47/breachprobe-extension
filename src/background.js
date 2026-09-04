/* THE SERVICE WORKER. It owns the scan and the badge, and the popup owns nothing but drawing.
 *
 * ⛔ THE SCAN DOES NOT RUN IN THE POPUP, AND THAT IS THE WHOLE REASON THIS FILE EXISTS.
 * BreachProbe's scan route declares `maxDuration = 45`: it fetches the page, pulls every bundle
 * the page ships, sweeps the Supabase REST surface and then signs up two throwaway users and
 * reads across them. A popup is destroyed the moment the window loses focus, so a scan started
 * in the popup dies the first time somebody clicks back onto their own app to look at it, and
 * the person is left with a spinner that never resolves and no record that anything ran. The
 * worker survives that. It keeps the in-flight promise, so a popup reopened halfway through
 * attaches to the SAME scan rather than starting a second one against somebody's database.
 *
 * The badge is the only thing this extension paints outside its own popup, and it is per tab:
 * `chrome.action.setBadgeText({ tabId })` scopes it, so a verdict for one app never sits on the
 * toolbar while a different tab is in front. That scoping is also why no "tabs" permission is
 * needed. Nothing here watches navigation.
 */

import { runScan } from "./api.js";
import { readVerdict, writeVerdict } from "./store.js";
import { SEVERITY_COLOR, issueCount, worstSeverity } from "./vocab.js";

/** origin -> Promise<verdict>. One scan per origin at a time, shared by every popup that asks. */
const inFlight = new Map();

const BADGE_RUNNING = "#95c2ff"; // BRAND-ASSETS.json colors.accent
const BADGE_QUIET = "#6b6b6b"; // `low` carries no fill in the ramp, so the badge borrows a grey
const BADGE_CLEAN = "#8ed44a"; // colors.severity.pass

async function setBadge(tabId, text, color) {
  if (typeof tabId !== "number") return;
  try {
    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      await chrome.action.setBadgeBackgroundColor({ tabId, color });
      if (chrome.action.setBadgeTextColor) {
        await chrome.action.setBadgeTextColor({ tabId, color: "#0a0a0a" });
      }
    }
  } catch {
    /* the tab closed while the scan was running; there is nothing to paint */
  }
}

/** What the toolbar says once a verdict exists. */
function badgeForVerdict(verdict) {
  if (!verdict || verdict.reachable === false) return { text: "?", color: BADGE_QUIET };
  const issues = issueCount(verdict.counts);
  if (!issues) return { text: "OK", color: BADGE_CLEAN };
  const worst = worstSeverity(verdict.findings || []);
  const color = (worst && SEVERITY_COLOR[worst]) || BADGE_QUIET;
  return { text: String(issues), color };
}

/**
 * The verdict shape the popup draws. It is the route's own free result with the scan id kept
 * beside it, plus the origin the request was made for. Nothing is renamed and nothing is
 * recomputed: `score` and `grade` stay null when BreachProbe could not reach the host.
 */
function toVerdict(origin, body) {
  return {
    origin,
    scanId: body.scanId || null,
    url: body.url,
    host: body.host,
    reachable: body.reachable,
    supabaseDetected: body.supabaseDetected,
    score: body.score,
    grade: body.grade,
    counts: body.counts,
    summary: body.summary,
    findings: Array.isArray(body.findings) ? body.findings : [],
    rlsTeaser: body.rlsTeaser || null,
    scannedAt: body.scannedAt || new Date().toISOString(),
  };
}

async function scan(origin, tabId) {
  if (inFlight.has(origin)) return inFlight.get(origin);

  const job = (async () => {
    await setBadge(tabId, "…", BADGE_RUNNING);
    try {
      const body = await runScan(origin, true);
      const verdict = toVerdict(origin, body);
      await writeVerdict(origin, verdict);
      const badge = badgeForVerdict(verdict);
      await setBadge(tabId, badge.text, badge.color);
      return verdict;
    } catch (err) {
      await setBadge(tabId, "", BADGE_QUIET);
      throw err;
    } finally {
      inFlight.delete(origin);
    }
  })();

  inFlight.set(origin, job);
  return job;
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || typeof msg !== "object") return false;

  if (msg.type === "state") {
    (async () => {
      const verdict = await readVerdict(msg.origin);
      if (verdict) {
        const badge = badgeForVerdict(verdict);
        await setBadge(msg.tabId, badge.text, badge.color);
      }
      sendResponse({ ok: true, verdict, running: inFlight.has(msg.origin) });
    })();
    return true;
  }

  if (msg.type === "scan") {
    scan(msg.origin, msg.tabId).then(
      (verdict) => sendResponse({ ok: true, verdict }),
      (err) => sendResponse({ ok: false, error: String((err && err.message) || err) }),
    );
    return true;
  }

  return false;
});
