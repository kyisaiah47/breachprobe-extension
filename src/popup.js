/* THE POPUP. It reads the tab, asks the worker to scan, and draws what BreachProbe sent back.
 *
 * ⛔ IT DECIDES NOTHING. There is no severity logic here, no scoring, no threshold, no rewording
 * of a finding. Every string on this surface is either the engine's own (`summary`, `title`,
 * `detail`, `grade`) or a label copied out of the product in src/vocab.js. A popup that composes
 * its own sentence about somebody's security posture is a second product wearing the same name.
 *
 * THE TAB. `chrome.tabs.query({ active: true, currentWindow: true })` returns the tab whose URL
 * the person is looking at, and `activeTab` is what makes `tab.url` readable: the permission is
 * granted by executing the action, which is what opening this popup is. Nothing here reads any
 * other tab, injects anything into the page, or asks for a host permission on the site being
 * scanned. The URL is all this needs, because the scan runs on BreachProbe's servers against the
 * public internet, exactly as it does when somebody types the URL into the field on the landing.
 */

import { reportUrl, scanPageUrl } from "./api.js";
import {
  CATEGORY_WHERE,
  CHECK_STEPS,
  OWNER_CONFIRM_LABEL,
  SEVERITY_COLOR,
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  issueCount,
} from "./vocab.js";
import { glyph } from "./glyphs.js";

const $ = (id) => document.getElementById(id);

const panes = {
  start: $("pane-start"),
  running: $("pane-running"),
  verdict: $("pane-verdict"),
  idle: $("pane-idle"),
};

function show(name) {
  for (const [key, el] of Object.entries(panes)) el.hidden = key !== name;
}

let TAB = null;
let ORIGIN = null;
let stepTimer = null;

function fmtOrigin(origin) {
  return origin.replace(/^https?:\/\//, "");
}

/* ── the running pane ─────────────────────────────────────────────────────────────────────── */

function startSteps() {
  const list = $("steps");
  list.textContent = "";
  for (const label of CHECK_STEPS) {
    const li = document.createElement("li");
    li.textContent = label;
    list.appendChild(li);
  }
  let i = 0;
  const tick = () => {
    const items = [...list.children];
    items.forEach((li, n) => {
      li.classList.toggle("on", n === i);
      li.classList.toggle("done", n < i);
    });
    if (i < items.length - 1) i += 1;
  };
  tick();
  /* The engine does not report progress, so this walks the five stages it does run rather than
   * claiming to know which one is live. It stops on the last one and waits there. */
  stepTimer = setInterval(tick, 2600);
}

function stopSteps() {
  if (stepTimer) clearInterval(stepTimer);
  stepTimer = null;
}

/* ── the verdict pane ─────────────────────────────────────────────────────────────────────── */

function sevChip(sev, count) {
  /* `.rs-chip` wearing `.rs-sev rs-sev--<step>`, the exact markup Severity.tsx renders, with the
   * same rule for a zero count: it takes the neutral state, because "0 critical" in a red chip is
   * the loudest thing on a clean report saying the best news on it. */
  const tone = count === 0 ? "rs-chip--off" : `rs-sev rs-sev--${sev}`;
  const text = count === undefined ? SEVERITY_LABEL[sev] : `${count} ${SEVERITY_LABEL[sev].toLowerCase()}`;
  return `<span class="rs-chip ${tone}">${glyph(sev, 14)}${text}</span>`;
}

function renderVerdict(verdict) {
  stopSteps();

  $("summary").textContent = verdict.summary || "";

  /* score and grade are NULL when BreachProbe could not reach the host, and that null is the
   * product's own decision: a security tool that prints a red F, 0/100 for a site it never
   * reached is stating a verdict it did not earn. Nothing here turns it into a number. */
  const line = $("verdict-line");
  if (verdict.reachable === false || verdict.grade === null || verdict.score === null) {
    line.innerHTML = `Not measured. <strong>${escape(fmtOrigin(verdict.origin))}</strong> could not be reached.`;
  } else {
    line.innerHTML = `Grade <strong>${escape(verdict.grade)}</strong>, <strong>${verdict.score}</strong>/100 on the checks that ran.`;
  }

  const counts = $("counts");
  counts.innerHTML = "";
  const c = verdict.counts || {};
  for (const sev of SEVERITY_ORDER) {
    if (sev === "pass" && !c.pass) continue;
    const li = document.createElement("li");
    li.innerHTML = sevChip(sev, c[sev] || 0);
    counts.appendChild(li);
  }

  const list = $("findings");
  list.innerHTML = "";
  const findings = [...(verdict.findings || [])].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  for (const f of findings) {
    const li = document.createElement("li");
    const colour = SEVERITY_COLOR[f.severity];
    li.innerHTML =
      `<span class="sev" style="color:${colour || "var(--rs-dim)"}">${glyph(f.severity, 13)}` +
      `${escape(SEVERITY_LABEL[f.severity] || f.severity)}</span>` +
      `<span><span class="title">${escape(f.title)}</span>` +
      `<span class="where">${escape(CATEGORY_WHERE[f.category] || f.category)}</span></span>`;
    list.appendChild(li);
  }
  if (!findings.length) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="sev"></span><span class="title">No findings were returned for this app.</span>`;
    list.appendChild(li);
  }

  const rls = $("rls");
  if (verdict.rlsTeaser && verdict.rlsTeaser.detail) {
    rls.textContent = verdict.rlsTeaser.detail;
    rls.hidden = false;
  } else {
    rls.hidden = true;
  }

  const report = $("report");
  if (verdict.scanId) {
    report.href = reportUrl(verdict.scanId);
    report.textContent = "Open the full report";
  } else {
    report.href = scanPageUrl();
    report.textContent = "Open BreachProbe";
  }

  const when = verdict.scannedAt ? new Date(verdict.scannedAt) : null;
  $("stamp").textContent = when
    ? `Scanned ${when.toLocaleString()}. ${issueCount(verdict.counts)} issue(s) on the checks that ran.`
    : "";

  show("verdict");
}

function escape(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (ch) => {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
  });
}

/* ── driving a scan ───────────────────────────────────────────────────────────────────────── */

function ask(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

async function runScan() {
  $("start-err").hidden = true;
  show("running");
  startSteps();
  const res = await ask({ type: "scan", origin: ORIGIN, tabId: TAB.id });
  stopSteps();
  if (!res || !res.ok) {
    $("start-err").textContent = (res && res.error) || "The scan did not complete.";
    $("start-err").hidden = false;
    show("start");
    return;
  }
  renderVerdict(res.verdict);
}

/* ── boot ─────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  $("owner-label").textContent = OWNER_CONFIRM_LABEL;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  TAB = tab || null;

  let url = null;
  try {
    url = TAB && TAB.url ? new URL(TAB.url) : null;
  } catch {
    url = null;
  }
  if (!url || (url.protocol !== "https:" && url.protocol !== "http:")) {
    $("origin").textContent = "";
    show("idle");
    return;
  }

  ORIGIN = url.origin;
  $("origin").innerHTML = `Scanning <strong>${escape(fmtOrigin(ORIGIN))}</strong>`;

  const owner = $("owner");
  const button = $("scan");
  owner.addEventListener("change", () => {
    button.disabled = !owner.checked;
  });
  button.addEventListener("click", runScan);
  $("rescan").addEventListener("click", () => {
    show("start");
    owner.checked = false;
    button.disabled = true;
  });

  const state = await ask({ type: "state", origin: ORIGIN, tabId: TAB.id });
  if (state && state.running) {
    show("running");
    startSteps();
    const res = await ask({ type: "scan", origin: ORIGIN, tabId: TAB.id });
    stopSteps();
    if (res && res.ok) renderVerdict(res.verdict);
    else show("start");
    return;
  }
  if (state && state.verdict) {
    renderVerdict(state.verdict);
    return;
  }
  show("start");
}

main();
