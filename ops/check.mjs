/* THE GATE. It fails closed, and it runs before the package is built.
 *
 *   node ops/check.mjs
 *
 * What it asserts, and why each one is here rather than in a comment somebody reads once:
 *
 *  1. The manifest is Manifest V3 and carries every key the Chrome Web Store requires, inside the
 *     limits Google's own reference states: name at most 75 characters, description at most 132.
 *  2. The permission set has not grown. `activeTab`, `storage` and one host permission for
 *     breachprobe.kynth.studio. A store review turns on the permission list, and a permission
 *     added while debugging is the one that ships.
 *  3. There is no content script and no remote code. MV3 forbids loading a remotely hosted file,
 *     and the privacy form asks about it directly.
 *  4. Nothing in the source fetches a host other than breachprobe.kynth.studio. This is the check
 *     that would catch a second scanner quietly growing inside the extension.
 *  5. Every icon size the manifest points at exists on disk.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

const manifest = JSON.parse(readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

if (manifest.manifest_version !== 3) problems.push("manifest_version is not 3");
if (!manifest.name || manifest.name.length > 75) problems.push(`name is missing or over 75 chars: "${manifest.name}"`);
if (!manifest.description || manifest.description.length > 132) {
  problems.push(`description is missing or over 132 chars (${(manifest.description || "").length}): "${manifest.description}"`);
}
if (!manifest.version) problems.push("version is missing");

const ALLOWED_PERMISSIONS = new Set(["activeTab", "storage"]);
const perms = manifest.permissions || [];
for (const p of perms) if (!ALLOWED_PERMISSIONS.has(p)) problems.push(`unexpected permission: "${p}"`);
if (!perms.includes("activeTab")) problems.push("activeTab permission is missing");

const ALLOWED_HOSTS = new Set(["https://breachprobe.kynth.studio/*"]);
const hosts = manifest.host_permissions || [];
for (const h of hosts) if (!ALLOWED_HOSTS.has(h)) problems.push(`unexpected host permission: "${h}"`);
if (hosts.length !== 1) problems.push(`expected exactly one host permission, found ${hosts.length}`);

if (manifest.content_scripts) problems.push("content_scripts is present, and this extension is not supposed to inject into pages");
if (manifest.externally_connectable) problems.push("externally_connectable is present and was never asked for");

for (const size of [16, 32, 48, 128]) {
  const rel = manifest.icons && manifest.icons[String(size)];
  if (!rel) {
    problems.push(`manifest.icons is missing the ${size} entry`);
    continue;
  }
  if (!existsSync(path.join(ROOT, rel))) problems.push(`manifest points at ${rel}, which does not exist`);
}

/* source scan: no remote code, no fetch to a second host */
const SRC_FILES = ["src/api.js", "src/background.js", "src/popup.js", "src/store.js", "src/vocab.js", "src/glyphs.js"];
const ALLOWED_FETCH_HOST = "breachprobe.kynth.studio";

for (const rel of SRC_FILES) {
  const file = path.join(ROOT, rel);
  if (!existsSync(file)) {
    problems.push(`expected source file is missing: ${rel}`);
    continue;
  }
  const src = readFileSync(file, "utf8");
  if (/\bimportScripts\s*\(/.test(src)) problems.push(`${rel} calls importScripts, which can load remote code`);
  if (/\beval\s*\(/.test(src)) problems.push(`${rel} calls eval`);
  const fetchHosts = [...src.matchAll(/fetch\(\s*[`"']https?:\/\/([^/'"`]+)/g)].map((m) => m[1]);
  for (const h of fetchHosts) {
    if (h !== ALLOWED_FETCH_HOST) problems.push(`${rel} fetches "${h}", which is not breachprobe.kynth.studio`);
  }
}

const html = readFileSync(path.join(ROOT, "src/popup.html"), "utf8");
if (/<script[^>]+src=["']https?:\/\//.test(html)) problems.push("popup.html loads a script from a remote URL");

if (problems.length) {
  console.error(`ops/check.mjs: ${problems.length} problem(s), listed below.`);
  for (const p of problems) console.error(`  FAIL: ${p}`);
  process.exit(1);
}
console.log("ops/check.mjs: OK, manifest, permissions and source all pass.");
