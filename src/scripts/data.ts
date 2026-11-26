// Shared client helpers. The page ships one JSON block (#site-data) with everything the scripts need.
export type Mood = { a: string; b: string; glow: string };
export type Item = {
  id: string; name: string; category: string; model: string; mood: string; badge?: 'new' | 'bestseller';
  line: string; description: string; notes: { top: string[]; heart: string[]; base: string[] };
  prices: Record<string, number>; rot?: [number, number, number]; scale?: number;
};
export type Data = {
  business: { name: string; display: string; tagline: string }; locale: string; currency: string; whatsapp: string;
  moods: Record<string, Mood>;
  checkout: { refPrefix: string; cartKey: string; pendingKey: string; pendingHours: number; maxPerLine: number; fulfilment: ('pickup' | 'delivery')[] };
  custom: { leadDays: number; maxDays: number; kinds: { id: string; label: string }[]; sizes: string[]; budgets: string[] };
  leads: { url: string; token: string; logOrders: boolean };
  intro: { enabled: boolean; minMs: number; maxMs: number };
  categories: { id: string; label: string; blurb: string }[];
  sizes: { ml: number; key: string }[]; defaultSize: string; items: Item[];
};

const node = document.getElementById('site-data');
export const D: Data = node ? JSON.parse(node.textContent || '{}') : ({ items: [], categories: [], sizes: [], moods: {} } as unknown as Data);
export const byId = new Map(D.items.map((i) => [i.id, i]));
export const mlOf = (key: string) => D.sizes.find((s) => s.key === key)?.ml ?? Number(key);
export const catLabel = (id: string) => D.categories.find((c) => c.id === id)?.label ?? '';
export const moodOf = (it: Item) => D.moods[it.mood];
export const poster = (id: string) => `/posters/${id}.webp`;
export const minPrice = (it: Item) => Math.min(...Object.values(it.prices));

const nf = new Intl.NumberFormat(D.locale || 'en-NG', { style: 'currency', currency: D.currency || 'NGN', maximumFractionDigits: 0 });
export const money = (n: number) => nf.format(n);
export const wa = (text: string) => `https://wa.me/${D.whatsapp}?text=${encodeURIComponent(text)}`;

export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const finePointer = () => matchMedia('(hover: hover) and (pointer: fine)').matches;

/** tiny DOM builder: h('div', { class: 'x' }, 'text', childNode) */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string | boolean | number | undefined> = {}, ...kids: (Node | string | null | false)[]) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === 'class') el.className = String(v); else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const kid of kids) if (kid !== null && kid !== false) el.append(kid);
  return el;
}

/* ---------- sheets: native <dialog>, so focus trap, Esc and focus return come for free ---------- */
const anyOpen = () => document.querySelector('dialog[open]') !== null;
export function wireSheet(d: HTMLDialogElement, opts: { backdropClose?: boolean } = {}) {
  if (opts.backdropClose !== false) d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  d.addEventListener('close', () => { if (!anyOpen()) document.documentElement.classList.remove('dlg'); });
}
export function openSheet(d: HTMLDialogElement) {
  if (!d.open) d.showModal();
  document.documentElement.classList.add('dlg');
}
/** a dialog people cannot dismiss by accident: Esc does nothing, the backdrop does nothing */
export function lockSheet(d: HTMLDialogElement) { d.addEventListener('cancel', (e) => e.preventDefault()); }
export function closeAll(except?: HTMLDialogElement) { document.querySelectorAll<HTMLDialogElement>('dialog[open]').forEach((d) => { if (d !== except) d.close(); }); }

export const emit = (name: string, detail?: unknown) => document.dispatchEvent(new CustomEvent(name, { detail }));
