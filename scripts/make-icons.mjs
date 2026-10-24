// Generates the PWA icons: the flexed-biceps emoji (Twemoji, CC BY 4.0) on the app's dark background.
// Run: npm run icons
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';

const EMOJI_URL = 'https://raw.githubusercontent.com/jdecked/twemoji/main/assets/svg/1f4aa.svg';
const BG = '#0b0b0f';
// Keep the emoji inside the maskable safe zone (inner 80% circle) so Android masks never crop it.
const EMOJI_SCALE = 0.58;

const res = await fetch(EMOJI_URL);
if (!res.ok) throw new Error(`Twemoji download failed: HTTP ${res.status}`);
const svg = Buffer.from(await res.text());

async function icon(size) {
  const emoji = Math.round(size * EMOJI_SCALE);
  const glyph = await sharp(svg, { density: 600 }).resize(emoji, emoji).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: BG } })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toBuffer();
}

await mkdir('public', { recursive: true });
await writeFile('public/icon-192.png', await icon(192));
await writeFile('public/icon-512.png', await icon(512));
await writeFile('public/apple-touch-icon.png', await icon(180));
console.log('Icons written');
