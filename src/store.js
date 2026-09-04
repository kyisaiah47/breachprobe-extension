/* THE ONLY THING THIS EXTENSION KEEPS: the last verdict for each origin, in chrome.storage.local.
 *
 * Nothing else is written anywhere. No history per origin, no scan queue, no analytics, no
 * identifier for the person using it, no sync storage, no cookies, no remote log of its own. The
 * scan itself is recorded by BreachProbe, which is what /api/scan has always done and what the
 * product's privacy page describes; this extension adds no second record of anyone.
 *
 * ONE RECORD PER ORIGIN, and the newest KEEP origins are the ones held. The cap is here because
 * an unbounded map in chrome.storage.local eventually meets the quota and starts throwing on
 * write, and a scanner that silently stops remembering is worse than one that forgets the
 * origin you last looked at a year ago.
 */

const PREFIX = "verdict:";
const KEEP = 100;

function key(origin) {
  return PREFIX + origin;
}

/** The last verdict recorded for an origin, or null. */
export async function readVerdict(origin) {
  const k = key(origin);
  const bag = await chrome.storage.local.get(k);
  return bag[k] || null;
}

/** Record a verdict as the last one for its origin, then prune to the newest KEEP origins. */
export async function writeVerdict(origin, verdict) {
  await chrome.storage.local.set({ [key(origin)]: verdict });
  await prune();
}

export async function clearAll() {
  await chrome.storage.local.clear();
}

async function prune() {
  const all = await chrome.storage.local.get(null);
  const rows = Object.entries(all).filter(([k]) => k.startsWith(PREFIX));
  if (rows.length <= KEEP) return;
  rows.sort((a, b) => String(b[1] && b[1].scannedAt).localeCompare(String(a[1] && a[1].scannedAt)));
  const drop = rows.slice(KEEP).map(([k]) => k);
  if (drop.length) await chrome.storage.local.remove(drop);
}
