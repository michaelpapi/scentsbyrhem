// Config and logic tests: `npm test`. No browser needed.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { siteSchema, productsSchema, faqSchema, creditsSchema } from '../src/config/schema';
import { crossChecks, contrast } from '../src/config/validate';
import { layoutHomes, focusPose } from '../src/scripts/gl/layout';
import { makeRef, orderMessage, customMessage, dateWindow, validate, orderTotal } from '../src/lib/messages';

const root = new URL('../', import.meta.url);
const load = (p: string) => JSON.parse(readFileSync(new URL(p, root), 'utf8'));
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
let n = 0; const t = (name: string, fn: () => void) => { fn(); n++; console.log('ok', name); };

const site = load('src/data/site.json'), products = load('src/data/products.json'), faq = load('src/data/faq.json'), credits = load('src/data/credits.json');
const exists = (m: string) => existsSync(new URL(`public/models/${m}.glb`, root));

t('real data passes schema and cross checks', () => {
  siteSchema.parse(site); productsSchema.parse(products); faqSchema.parse(faq); creditsSchema.parse(credits);
  assert.deepEqual(crossChecks(site, products, credits, exists), []);
});
t('whatsapp number must be a Nigerian number (234 + 10 digits)', () => {
  assert.ok(siteSchema.safeParse({ ...clone(site), contact: { ...site.contact, whatsapp: '23490348112418' } }).success === false, '14 digits is rejected');
  assert.ok(siteSchema.safeParse({ ...clone(site), contact: { ...site.contact, whatsapp: '08034811241' } }).success === false, 'local format rejected');
  assert.equal(site.contact.whatsapp, '2349034812418');
});
t('low contrast palette is caught', () => {
  const s = clone(site); s.palette.blush = '#7A1633';
  assert.ok(crossChecks(s, products, credits, exists).some((e) => /contrast/.test(e)));
  assert.ok(contrast('#000000', '#ffffff') > 20);
});
t('unknown category, missing model and missing size price are caught', () => {
  const p1 = clone(products); p1.items[0].category = 'nope';
  assert.ok(crossChecks(site, p1, credits, exists).length > 0);
  const p2 = clone(products); p2.items[0].model = 'does-not-exist';
  assert.ok(crossChecks(site, p2, credits, exists).some((e) => /does-not-exist/.test(e)));
  const p3 = clone(products); delete p3.items[0].prices['50'];
  assert.ok(crossChecks(site, p3, credits, exists).length > 0 || !productsSchema.safeParse(p3).success);
});
t('every CC-BY model has a credit entry', () => {
  for (const it of products.items) assert.ok(credits.some((c: any) => c.model === it.model || c.id === it.model || JSON.stringify(c).includes(it.model)), `credit for ${it.model}`);
});

const now = new Date(2026, 10, 25, 10, 0, 0);
t('reference codes are readable and unique-ish', () => {
  const r = makeRef('SBR', 'ORD', now, () => 0);
  assert.equal(r, 'SBR-ORD-261125-AAAA');
  const many = new Set(Array.from({ length: 500 }, () => makeRef('SBR', 'CUS', now)));
  assert.ok(many.size > 495);
  assert.ok(![...many].some((x) => /[01IO]/.test(x.split('-')[3])), 'no look-alike characters');
});
const money = (v: number) => `₦${v.toLocaleString('en-NG')}`;
t('order message has everything the owner needs', () => {
  const lines = [{ name: 'Velvet Oud', ml: 50, qty: 2, unit: 40000 }, { name: 'Noir Absolu', ml: 30, qty: 1, unit: 22000 }];
  assert.equal(orderTotal(lines), 102000);
  const m = orderMessage({ business: 'ScentsByRhem', ref: 'SBR-ORD-1', lines, name: '  Ada   Obi ', fulfil: 'delivery', address: '1 Road,\nLekki', note: '' }, money);
  for (const s of ['SBR-ORD-1', 'Velvet Oud · 50 ml × 2', '₦102,000', 'Name: Ada Obi', 'Receive: Delivery', 'Address: 1 Road, Lekki']) assert.ok(m.includes(s), s);
  assert.ok(!m.includes('Note:'));
  const pick = orderMessage({ business: 'B', ref: 'R', lines, name: 'A', fulfil: 'pickup', address: 'ignored' }, money);
  assert.ok(!pick.includes('Address'), 'pick up never sends an address');
});
t('custom message includes the requested brand', () => {
  const m = customMessage({ business: 'B', ref: 'SBR-CUS-1', kindLabel: 'A perfume that is not in the collection', brand: 'Baccarat Rouge 540', details: '', size: '50 ml', budget: 'x', needBy: '', name: 'Ada', fulfil: 'pickup' });
  assert.ok(m.includes('Brand / fragrance: Baccarat Rouge 540') && !m.includes('Needed by') && !m.includes('Details'));
});
t('date window: 3 days notice, 120 days ahead', () => {
  const w = dateWindow(now, 3, 120);
  assert.equal(w.min, '2026-11-28'); assert.equal(w.max, '2027-03-25');
});
t('form validation', () => {
  assert.ok(validate({ name: 'A', fulfil: 'pickup' }).name);
  assert.ok(validate({ name: 'Ada', fulfil: 'delivery', address: 'x' }).address);
  assert.deepEqual(validate({ name: 'Ada', fulfil: 'pickup' }), {});
  assert.ok(validate({ name: 'Ada', fulfil: 'pickup', needBrand: true, brand: ' ' }).brand);
  assert.ok(validate({ name: 'Ada', fulfil: 'pickup', date: '2026-11-26', min: '2026-11-28', max: '2027-03-25' }).date);
  assert.ok(validate({ name: 'Ada', fulfil: 'pickup', date: '2027-06-01', min: '2026-11-28', max: '2027-03-25' }).date);
  assert.deepEqual(validate({ name: 'Ada', fulfil: 'pickup', date: '2026-12-10', min: '2026-11-28', max: '2027-03-25' }), {});
});
t('hero copy is validated', () => {
  assert.ok(siteSchema.safeParse({ ...clone(site), hero: { kicker: 'x', title: 'y', text: 'z' } }).success === false);
});
t('floating bottles never crowd each other and stay in their zone', () => {
  for (const [w, h] of [[760, 620], [350, 400], [320, 300], [900, 700]]) for (const k of [1, 2, 3, 5, 9]) {
    const z = { x: 20, y: 40, w, h }, hs = layoutHomes(k, z);
    assert.equal(hs.length, k);
    for (const a of hs) { assert.ok(a.s > 20, 'bottle is visible'); assert.ok(a.x - a.s * 0.5 >= z.x - 1 && a.x + a.s * 0.5 <= z.x + z.w + 1, `x inside zone (${w}x${h}, ${k})`); assert.ok(a.y - a.s / 2 >= z.y - 1 && a.y + a.s / 2 <= z.y + z.h + 1, `y inside zone (${w}x${h}, ${k})`); }
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
      const dx = Math.abs(hs[i].x - hs[j].x), dy = Math.abs(hs[i].y - hs[j].y), s = hs[0].s;
      assert.ok(dx > s * 0.62 || dy > s * 1.02, `bottles ${i} and ${j} keep clear (${w}x${h}, ${k})`);
    }
  }
  const f = focusPose({ x: 0, y: 0, w: 400, h: 300 });
  assert.ok(f.s <= 300 * 0.86 + 0.01 && f.x === 200 && f.y === 150);
});
t('shop address must be a bare https origin', () => {
  assert.equal(site.url, 'https://scentsbyrhem.netlify.app');
  for (const bad of ['http://scentsbyrhem.netlify.app', 'https://scentsbyrhem.netlify.app/', 'scentsbyrhem.netlify.app', 'https://x.app/shop']) assert.ok(siteSchema.safeParse({ ...clone(site), url: bad }).success === false, bad);
  assert.ok(siteSchema.safeParse({ ...clone(site), url: 'https://scentsbyrhem.com' }).success);
});
t('every fragrance has a share picture', () => {
  for (const it of products.items) assert.ok(existsSync(new URL(`public/og/${it.id}.jpg`, root)), `public/og/${it.id}.jpg missing: run python3 scripts/og.py`);
});
console.log(`${n} tests passed`);
