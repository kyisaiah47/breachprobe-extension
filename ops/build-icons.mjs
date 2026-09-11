/* THE TOOLBAR ICONS, DRAWN FROM BREACHPROBE'S OWN MARK.
 *
 *   node ops/build-icons.mjs
 *
 * The geometry below is `src/components/product-mark.mjs` in ~/CompoundLabs/breachprobe, and the
 * plate is `src/app/icon.svg` from the same repo: a #0a0a0a tile at rx 7 on a 32 box, the mark
 * on a 32x28 viewBox translated and scaled onto it, in the accent at two opacities. Both were
 * read on 2026-09-04.
 *
 * ⛔ IT IS NOT ALLOWED TO DRIFT, AND THE GATE IS THE POINT. `assertMatchesProduct()` re-reads
 * product-mark.mjs whenever that repo is on this disk and refuses to build if either path string
 * or the accent has moved. The estate has already shipped a favicon that was a different drawing
 * from its own nav, on four products at once, for exactly the reason this guard exists: a hand
 * copy of a shape has no way of knowing the shape changed. There is no flag to skip it.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "icons");

/* ── the drawing, copied byte for byte from breachprobe/src/components/product-mark.mjs ── */
const UPPER = "M16 1 L27 4.8 V12.1 H5 V4.8 Z";
const LOWER = "M5 14.7 H27 C27 20.9 22.2 25.3 16 27 C9.8 25.3 5 20.9 5 14.7 Z";
const ACCENT = "#95c2ff";
const PAGE = "#0a0a0a";

/* ── the plate, copied from breachprobe/src/app/icon.svg ── */
const PLATE_RX = 7;
const PLACE = 'transform="translate(2.5 4.188) scale(0.84375)"';

const SIZES = [16, 32, 48, 128];

const PRODUCT_MARK = path.resolve(
  process.env.BREACHPROBE_REPO || path.join(ROOT, "..", "breachprobe"),
  "src/components/product-mark.mjs",
);
const PRODUCT_ICON = path.resolve(
  process.env.BREACHPROBE_REPO || path.join(ROOT, "..", "breachprobe"),
  "src/app/icon.svg",
);

function assertMatchesProduct() {
  if (!existsSync(PRODUCT_MARK)) {
    console.log(`mark check SKIPPED: ${PRODUCT_MARK} is not on this disk`);
    return;
  }
  const src = readFileSync(PRODUCT_MARK, "utf8");
  const problems = [];
  if (!src.includes(`"${UPPER}"`)) problems.push("the UPPER path has moved in product-mark.mjs");
  if (!src.includes(`"${LOWER}"`)) problems.push("the LOWER path has moved in product-mark.mjs");
  if (!src.includes(ACCENT)) problems.push(`the accent ${ACCENT} is no longer in product-mark.mjs`);
  if (existsSync(PRODUCT_ICON)) {
    const icon = readFileSync(PRODUCT_ICON, "utf8");
    if (!icon.includes(`rx="${PLATE_RX}"`)) problems.push("the plate radius has moved in icon.svg");
    if (!icon.includes(PLACE)) problems.push("the mark placement has moved in icon.svg");
    if (!icon.includes(`fill="${PAGE}"`)) problems.push(`the plate is no longer ${PAGE} in icon.svg`);
  }
  if (problems.length) {
    console.error("BreachProbe's mark has changed and these icons would ship the old drawing:");
    for (const p of problems) console.error(`  ${p}`);
    console.error(`  source: ${PRODUCT_MARK}`);
    process.exit(1);
  }
  console.log(`mark check OK against ${PRODUCT_MARK}`);
}

function plateSvg() {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">` +
    `<rect width="32" height="32" rx="${PLATE_RX}" fill="${PAGE}"/>` +
    `<g ${PLACE}>` +
    `<path d="${UPPER}" fill="${ACCENT}" fill-opacity="0.62"></path>` +
    `<path d="${LOWER}" fill="${ACCENT}"></path>` +
    `</g></svg>`
  );
}

async function main() {
  assertMatchesProduct();
  mkdirSync(OUT, { recursive: true });
  const svg = Buffer.from(plateSvg());
  writeFileSync(path.join(OUT, "icon.svg"), plateSvg() + "\n");
  for (const size of SIZES) {
    const file = path.join(OUT, `icon${size}.png`);
    await sharp(svg, { density: Math.max(72, Math.round((size / 32) * 288)) })
      .resize(size, size, { fit: "fill" })
      .png({ compressionLevel: 9 })
      .toFile(file);
    console.log(`wrote ${path.relative(ROOT, file)}`);
  }
  /* The store's own 128 tile is the same drawing; the dashboard asks for it separately. */
  const store = path.join(ROOT, "store", "store-icon-128.png");
  await sharp(svg, { density: 1152 }).resize(128, 128, { fit: "fill" }).png({ compressionLevel: 9 }).toFile(store);
  console.log(`wrote ${path.relative(ROOT, store)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
