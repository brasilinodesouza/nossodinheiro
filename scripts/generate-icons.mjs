import sharp from "sharp";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const input = path.join(directory, "../public/icons/source.svg");
for (const size of [192, 512])
  await sharp(input)
    .resize(size, size)
    .png()
    .toFile(path.join(directory, `../public/icons/icon-${size}.png`));
await sharp(input)
  .resize(512, 512)
  .png()
  .toFile(path.join(directory, "../public/icons/maskable-512.png"));
await sharp(input)
  .resize(180, 180)
  .png()
  .toFile(path.join(directory, "../src/app/apple-icon.png"));
