// Where the floating bottles live. Pure maths (tested in test/run.ts): spread n bottles over a zone with room between them.
export type Rect = { x: number; y: number; w: number; h: number };
export type Home = { x: number; y: number; s: number };       // centre (px) and bottle height (px)

const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** try every column count and keep the one that lets the bottles be biggest while still leaving clear space around each */
export function layoutHomes(n: number, z: Rect): Home[] {
  if (n <= 0) return [];
  let best = { cols: 1, size: 0 };
  for (let c = 1; c <= n; c++) {
    const rows = Math.ceil(n / c), cw = z.w / c, ch = z.h / rows;
    const size = Math.min(ch * 0.74, cw / 1.5, z.h * 0.45);
    if (size > best.size + 0.5) best = { cols: c, size };
  }
  const { cols, size } = best, rows = Math.ceil(n / cols), cw = z.w / cols, ch = z.h / rows;
  const out: Home[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols), inRow = r < rows - 1 ? cols : n - cols * (rows - 1), k = i - r * cols;
    const x = z.x + (z.w - inRow * cw) / 2 + (k + 0.5) * cw + (r % 2 ? cw * 0.07 : -cw * 0.07) * (inRow > 1 ? 1 : 0) + (hash(i + 1) - 0.5) * cw * 0.1;
    const y = z.y + (r + 0.5) * ch + (hash(i + 17) - 0.5) * ch * 0.1;
    out.push({ x, y, s: size });
  }
  return out;
}

/** the big pose of the chosen bottle: as tall as the zone allows, never wider than the zone */
export function focusPose(z: Rect): Home {
  const s = Math.min(z.h * 0.86, (z.w * 0.82) / 0.92);
  return { x: z.x + z.w / 2, y: z.y + z.h / 2, s };
}
