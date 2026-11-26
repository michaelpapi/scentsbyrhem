// Loads every data file, checks the schema, then the cross-file rules. `npm run validate` (also runs before every build).
import { readFileSync, existsSync } from 'node:fs';
import { siteSchema, productsSchema, faqSchema, creditsSchema } from './schema';

const root = new URL('../../', import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));

/** WCAG contrast ratio of two #rrggbb colours */
export function contrast(a: string, b: string) {
  const lum = (h: string) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

export function crossChecks(site: any, products: any, credits: any, modelExists: (id: string) => boolean): string[] {
  const errs: string[] = [];
  const p = site.palette;
  const pairs: [string, string, string, number][] = [
    ['ink on blush (page text)', p.ink, p.blush, 7], ['blush on burgundy (buttons)', p.blush, p.burgundy, 4.5],
    ['pink on deep (light text on dark)', p.pink, p.deep, 7], ['deep on pink (pink buttons)', p.deep, p.pink, 7],
  ];
  for (const [name, fg, bg, min] of pairs) { const r = contrast(fg, bg); if (r < min) errs.push(`palette: ${name} contrast ${r.toFixed(2)} is below ${min}`); }
  // text over the stage must stay readable against the lighter end of every mood
  for (const [k, m] of Object.entries<any>(site.moods)) { const r = contrast(p.blush, m.b); if (r < 3) errs.push(`moods.${k}: blush text on the light end (${m.b}) contrast ${r.toFixed(2)} is below 3`); }

  const cats = new Set(products.categories.map((c: any) => c.id));
  const sizeKeys = new Set(products.sizes.map((s: any) => s.key));
  if (!sizeKeys.has(products.defaultSize)) errs.push(`products.defaultSize "${products.defaultSize}" is not in products.sizes`);
  const seen = new Set<string>();
  const credited = new Set(credits.map((c: any) => c.model));
  products.items.forEach((it: any, i: number) => {
    const at = `products.items[${i}] (${it.id})`;
    if (seen.has(it.id)) errs.push(`${at}: duplicate product id`); seen.add(it.id);
    if (!cats.has(it.category)) errs.push(`${at}: category "${it.category}" does not exist`);
    if (!site.moods[it.mood]) errs.push(`${at}: mood "${it.mood}" does not exist`);
    if (!modelExists(it.model)) errs.push(`${at}: model file public/models/${it.model}.glb is missing`);
    if (!credited.has(it.model)) errs.push(`${at}: model "${it.model}" has no entry in credits.json`);
    for (const k of Object.keys(it.prices)) if (!sizeKeys.has(k)) errs.push(`${at}: price for unknown size "${k}"`);
    if (!it.prices[products.defaultSize]) errs.push(`${at}: needs a price for the default size ${products.defaultSize}`);
  });
  const used = new Set(products.categories.map((c: any) => c.id));
  for (const c of used) if (!products.items.some((it: any) => it.category === c)) errs.push(`category "${c}" has no products`);
  return errs;
}

export function runValidate() {
  const issues = (e: any, file: string) => (e.issues ?? []).map((i: any) => `${file}: ${i.path.join('.')}: ${i.message}`);
  const out: string[] = [];
  const parts: Record<string, any> = {};
  for (const [file, schema] of [['src/data/site.json', siteSchema], ['src/data/products.json', productsSchema], ['src/data/faq.json', faqSchema], ['src/data/credits.json', creditsSchema]] as const) {
    const r = (schema as any).safeParse(load(file));
    if (!r.success) out.push(...issues(r.error, file)); else parts[file] = r.data;
  }
  if (!out.length) out.push(...crossChecks(parts['src/data/site.json'], parts['src/data/products.json'], parts['src/data/credits.json'], (id) => existsSync(new URL(`public/models/${id}.glb`, root))));
  return out;
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file://').href) {
  const errs = runValidate();
  if (errs.length) { console.error('\nConfig problems:\n' + errs.map((e) => '  - ' + e).join('\n') + '\n'); process.exit(1); }
  console.log('config ok');
}
