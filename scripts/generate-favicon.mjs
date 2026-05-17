import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const root = path.resolve(import.meta.dirname, "..");
const src = path.join(root, "public/brand/favicon-source.png");
const iconOut = path.join(root, "src/app/icon.png");
const appleOut = path.join(root, "src/app/apple-icon.png");

if (!fs.existsSync(src)) {
  console.error(`Missing favicon source: ${src}`);
  process.exit(1);
}

async function makeIcon(size, out) {
  const trimmed = await sharp(src).trim({ threshold: 12 }).toBuffer();

  await sharp(trimmed)
    .resize(Math.round(size * 0.92), Math.round(size * 0.92), {
      fit: "inside",
    })
    .extend({
      top: Math.round(size * 0.04),
      bottom: Math.round(size * 0.04),
      left: Math.round(size * 0.04),
      right: Math.round(size * 0.04),
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(size, size, { fit: "cover", position: "centre" })
    .png()
    .toFile(out);
}

await makeIcon(32, iconOut);
await makeIcon(192, appleOut);

console.log("Favicons generated:", {
  icon: fs.statSync(iconOut).size,
  apple: fs.statSync(appleOut).size,
});
