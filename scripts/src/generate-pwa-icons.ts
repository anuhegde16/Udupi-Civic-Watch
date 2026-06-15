import sharp from "sharp";
import { readFileSync, copyFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "../../artifacts/cleanspot/public");
const svgPath = join(publicDir, "favicon.svg");

const svgBuffer = readFileSync(svgPath);

async function main() {
  console.log("Generating PWA icons from favicon.svg ...");

  await sharp(svgBuffer, { density: 300 })
    .resize(192, 192)
    .png()
    .toFile(join(publicDir, "icon-192.png"));
  console.log("✓ icon-192.png");

  await sharp(svgBuffer, { density: 300 })
    .resize(512, 512)
    .png()
    .toFile(join(publicDir, "icon-512.png"));
  console.log("✓ icon-512.png");

  copyFileSync(join(publicDir, "icon-192.png"), join(publicDir, "apple-touch-icon.png"));
  console.log("✓ apple-touch-icon.png");

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
