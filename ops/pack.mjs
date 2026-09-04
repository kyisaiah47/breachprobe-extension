/* THE PACKAGE. Zips exactly what ships, nothing the ops/ folder or the repo carries besides.
 *
 *   node ops/pack.mjs
 *
 * Writes dist/breachprobe-extension.zip from manifest.json, src/, icons/ and fonts/, the same
 * four things the manifest and the popup HTML/CSS ever reference. ops/, store/, .git and node
 * tooling never enter the zip; a stray dev file inside the package is exactly the kind of thing
 * a store reviewer flags.
 */
import { existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "dist");
const OUT_FILE = path.join(OUT_DIR, "breachprobe-extension.zip");

const INCLUDE = ["manifest.json", "src", "icons", "fonts"];

for (const rel of INCLUDE) {
  if (!existsSync(path.join(ROOT, rel))) {
    console.error(`ops/pack.mjs: missing ${rel}, run ops/check.mjs first`);
    process.exit(1);
  }
}

rmSync(OUT_DIR, { recursive: true, force: true });
mkdirSync(OUT_DIR, { recursive: true });

execFileSync("zip", ["-r", "-X", OUT_FILE, ...INCLUDE], { cwd: ROOT, stdio: "inherit" });
console.log(`wrote ${path.relative(ROOT, OUT_FILE)}`);
