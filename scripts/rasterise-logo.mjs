// favicon.svg + _og.svg -> png icons and the share card
import sharp from 'sharp';
import { readFileSync } from 'node:fs';
const fav = readFileSync(new URL('../public/favicon.svg', import.meta.url));
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await sharp(fav, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(new URL(`../public/${name}`, import.meta.url).pathname);
}
await sharp(readFileSync(new URL('./_og.svg', import.meta.url)), { density: 144 }).resize(1200, 630).png({ compressionLevel: 9, palette: true }).toFile(new URL('../public/og.png', import.meta.url).pathname);
console.log('icons + og written');
