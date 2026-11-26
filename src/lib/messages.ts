// Pure functions (no DOM) that build the WhatsApp texts and the reference codes. Tested in test/run.ts.
export type Line = { name: string; ml: number; qty: number; unit: number };
export type OrderInput = { business: string; ref: string; lines: Line[]; name: string; fulfil: 'pickup' | 'delivery'; address?: string; note?: string };
export type CustomInput = { business: string; ref: string; kindLabel: string; brand?: string; details?: string; size: string; budget: string; needBy?: string; name: string; fulfil: 'pickup' | 'delivery'; address?: string };

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no I, O, 0, 1: easy to read out over the phone
export function makeRef(prefix: string, kind: 'ORD' | 'CUS', now: Date, rand: () => number = Math.random) {
  const d = `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  let tail = '';
  for (let i = 0; i < 4; i++) tail += ALPHABET[Math.floor(rand() * ALPHABET.length)];
  return `${prefix}-${kind}-${d}-${tail}`;
}

export const fulfilLabel = (f: 'pickup' | 'delivery') => (f === 'delivery' ? 'Delivery' : 'Pick up');
export const lineTotal = (l: Line) => l.unit * l.qty;
export const orderTotal = (lines: Line[]) => lines.reduce((a, l) => a + lineTotal(l), 0);
const clean = (s: string | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

export function orderMessage(i: OrderInput, money: (n: number) => string) {
  const rows = i.lines.map((l, n) => `${n + 1}. ${l.name} · ${l.ml} ml × ${l.qty} – ${money(lineTotal(l))}`);
  const out = [
    `Hello ${i.business}! I'd like to place an order.`, `Ref: ${i.ref}`, '', ...rows, '', `Total: ${money(orderTotal(i.lines))}`, '',
    `Name: ${clean(i.name)}`, `Receive: ${fulfilLabel(i.fulfil)}`,
  ];
  if (i.fulfil === 'delivery' && clean(i.address)) out.push(`Address: ${clean(i.address)}`);
  if (clean(i.note)) out.push(`Note: ${clean(i.note)}`);
  return out.join('\n');
}

export function customMessage(i: CustomInput) {
  const out = [`Hello ${i.business}! I'd like to request a custom order.`, `Ref: ${i.ref}`, '', `Request: ${i.kindLabel}`];
  if (clean(i.brand)) out.push(`Brand / fragrance: ${clean(i.brand)}`);
  out.push(`Size: ${i.size}`, `Budget: ${i.budget}`);
  if (i.needBy) out.push(`Needed by: ${i.needBy}`);
  if (clean(i.details)) out.push(`Details: ${clean(i.details)}`);
  out.push('', `Name: ${clean(i.name)}`, `Receive: ${fulfilLabel(i.fulfil)}`);
  if (i.fulfil === 'delivery' && clean(i.address)) out.push(`Address: ${clean(i.address)}`);
  return out.join('\n');
}

/** earliest and latest date a custom order may ask for, as yyyy-mm-dd in local time */
export function dateWindow(now: Date, leadDays: number, maxDays: number) {
  const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const a = new Date(now); a.setDate(a.getDate() + leadDays);
  const b = new Date(now); b.setDate(b.getDate() + maxDays);
  return { min: f(a), max: f(b) };
}

export function validate(fields: { name: string; fulfil: string; address?: string; brand?: string; needBrand?: boolean; date?: string; min?: string; max?: string }) {
  const errs: Record<string, string> = {};
  if (clean(fields.name).length < 2) errs.name = 'Please enter your name.';
  if (fields.fulfil === 'delivery' && clean(fields.address).length < 6) errs.address = 'Please enter your delivery address.';
  if (fields.needBrand && clean(fields.brand).length < 2) errs.brand = 'Tell us the brand and the fragrance you want.';
  if (fields.date) {
    if (fields.min && fields.date < fields.min) errs.date = 'We need a little more notice than that. Please choose a later date.';
    else if (fields.max && fields.date > fields.max) errs.date = 'That is too far ahead. Please choose an earlier date.';
  }
  return errs;
}
