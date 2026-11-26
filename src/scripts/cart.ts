// The bag. Lines are fragrance + size, saved on the phone. Checkout = name, pick up or delivery, then one WhatsApp message.
import { D, byId, mlOf, money, wa, h, wireSheet, openSheet, poster, moodOf } from './data';
import { makeRef, orderMessage, validate, type Line } from '../lib/messages';
import { setPending } from './pending';

const KEY = D.checkout.cartKey;
const MAX = D.checkout.maxPerLine;
const cart: Record<string, number> = {};           // "<id>:<sizeKey>" -> qty
const subs = new Set<() => void>();

try {
  const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
  for (const [k, q] of Object.entries(saved)) {
    const [id, size] = k.split(':'); const it = byId.get(id);
    if (it && it.prices[size] && Number.isInteger(q) && (q as number) > 0) cart[k] = Math.min(q as number, MAX);
  }
} catch { /* storage blocked: the bag still works, it just is not remembered */ }

const save = () => { try { localStorage.setItem(KEY, JSON.stringify(cart)); } catch { /* ignore */ } };
const notify = () => subs.forEach((f) => f());
export const keyOf = (id: string, size: string) => `${id}:${size}`;
export const qtyOf = (id: string) => Object.entries(cart).filter(([k]) => k.startsWith(id + ':')).reduce((a, [, q]) => a + q, 0);
export const count = () => Object.values(cart).reduce((a, b) => a + b, 0);
export function lines(): Line[] {
  return Object.entries(cart).map(([k, qty]) => { const [id, size] = k.split(':'); const it = byId.get(id)!; return { name: it.name, ml: mlOf(size), qty, unit: it.prices[size] }; });
}
export const total = () => lines().reduce((a, l) => a + l.unit * l.qty, 0);
export function set(k: string, q: number) { q = Math.max(0, Math.min(MAX, q)); if (q === 0) delete cart[k]; else cart[k] = q; save(); notify(); }
export const add = (id: string, size = D.defaultSize, n = 1) => { const k = keyOf(id, size); set(k, (cart[k] || 0) + n); };
export const clear = () => { for (const k of Object.keys(cart)) delete cart[k]; save(); notify(); };
/** "Add · 50 ml" becomes "Added (2)" once that fragrance is in the bag */
export function syncAddButton(b: HTMLButtonElement) {
  const id = b.dataset.id!; const q = qtyOf(id);
  b.textContent = q ? `Added (${q})` : `Add · ${mlOf(D.defaultSize)} ml`;
  b.dataset.done = q ? 'true' : 'false';
}
export const onChange = (f: () => void) => { subs.add(f); return () => subs.delete(f); };

export function initCart() {
  const bar = document.getElementById('cart-bar'), dlg = document.getElementById('cart-dialog') as HTMLDialogElement | null;
  if (!bar || !dlg) return;
  wireSheet(dlg);
  const barCount = bar.querySelector<HTMLElement>('[data-bar-count]')!, barTotal = bar.querySelector<HTMLElement>('[data-bar-total]')!;
  const headBtn = document.querySelector<HTMLElement>('.bag-btn'), headCount = headBtn?.querySelector<HTMLElement>('[data-count]');
  const list = dlg.querySelector<HTMLElement>('[data-list]')!, empty = dlg.querySelector<HTMLElement>('[data-empty]')!;
  const form = dlg.querySelector<HTMLFormElement>('#order-form')!, foot = dlg.querySelector<HTMLElement>('[data-foot]')!;
  const sum = dlg.querySelector<HTMLElement>('[data-sum]')!, send = dlg.querySelector<HTMLAnchorElement>('[data-send]')!;
  const addrWrap = dlg.querySelector<HTMLElement>('[data-addr]')!;
  let ref = '', lastCount = count();

  const field = (n: string) => form.elements.namedItem(n) as HTMLInputElement | HTMLTextAreaElement;
  const fulfil = () => (form.querySelector<HTMLInputElement>('input[name=fulfil]:checked')?.value ?? 'pickup') as 'pickup' | 'delivery';
  const input = () => ({ business: D.business.name, ref, lines: lines(), name: field('name').value, fulfil: fulfil(), address: field('address').value, note: field('note').value });

  function renderList() {
    list.replaceChildren();
    for (const [k, q] of Object.entries(cart)) {
      const [id, size] = k.split(':'); const it = byId.get(id)!; const m = moodOf(it);
      const thumb = h('img', { class: 'thumb', src: poster(id), alt: '', width: 61, height: 74, decoding: 'async' });
      thumb.style.setProperty('--a', m.a); thumb.style.setProperty('--b', m.b);
      const stepBtn = (label: string, text: string, fn: () => void) => { const b = h('button', { type: 'button', class: 'step', 'aria-label': label }, text); b.addEventListener('click', fn); return b; };
      const rm = h('button', { type: 'button', class: 'linkbtn rm', 'aria-label': `Remove ${it.name}, ${mlOf(size)} ml` }, 'Remove');
      rm.addEventListener('click', () => set(k, 0));
      list.append(h('li', { class: 'cart-row' }, thumb,
        h('div', { class: 'ci' }, h('strong', {}, it.name), h('span', { class: 'cn' }, `${mlOf(size)} ml`), h('span', { class: 'cp' }, `${money(it.prices[size])} each`), rm),
        h('div', { class: 'stepper', role: 'group', 'aria-label': `Quantity of ${it.name}` }, stepBtn(`One less ${it.name}`, '−', () => set(k, q - 1)), h('output', { class: 'qty', 'aria-live': 'polite' }, String(q)), stepBtn(`One more ${it.name}`, '+', () => set(k, q + 1))),
        h('span', { class: 'line-total' }, money(it.prices[size] * q))));
    }
  }
  function updateLink() { send.href = wa(orderMessage(input(), money)); }
  function render() {
    const n = count();
    barCount.textContent = String(n);
    if (headCount) headCount.textContent = String(n);
    headBtn?.classList.toggle('has', n > 0);
    barTotal.textContent = n ? `${n === 1 ? '1 item' : `${n} items`} · ${money(total())}` : '';
    bar!.dataset.open = n > 0 ? 'true' : 'false';
    if (n > lastCount) { bar!.classList.remove('bump'); void bar!.offsetWidth; bar!.classList.add('bump'); }
    lastCount = n;
    // "Add · 50 ml" turns into "Added (2)" on every add button for that fragrance
    document.querySelectorAll<HTMLButtonElement>('[data-add]').forEach(syncAddButton);
    renderList();
    empty.hidden = n > 0; form.hidden = n === 0; foot.hidden = n === 0;
    sum.textContent = money(total());
    if (n > 0) { if (!ref) ref = makeRef(D.checkout.refPrefix, 'ORD', new Date()); updateLink(); }
  }

  const showErr = (errs: Record<string, string>) => {
    form.querySelectorAll<HTMLElement>('[data-err]').forEach((e) => { const m = errs[e.dataset.err!] ?? ''; e.textContent = m; (e.closest('.field') as HTMLElement | null)?.setAttribute('data-bad', String(!!m)); });
    const first = Object.keys(errs)[0]; if (first) (field(first) as HTMLElement).focus();
  };
  form.addEventListener('input', () => { addrWrap.hidden = fulfil() !== 'delivery'; updateLink(); });
  form.addEventListener('submit', (e) => e.preventDefault());

  send.addEventListener('click', (e) => {
    const errs = validate({ name: field('name').value, fulfil: fulfil(), address: field('address').value });
    showErr(errs);
    if (Object.keys(errs).length || count() === 0) { e.preventDefault(); return; }
    updateLink();
    const inp = input();
    setPending({
      kind: 'order', ref, at: Date.now(), summary: `${count()} item(s), ${money(total())}`,
      lead: { type: 'order', ref, name: inp.name.trim(), fulfil: inp.fulfil, address: inp.fulfil === 'delivery' ? inp.address.trim() : '', note: inp.note.trim(), items: inp.lines.map((l) => `${l.name} ${l.ml}ml x${l.qty}`).join('; '), total: total(), message: orderMessage(inp, money) },
    });
    // the link carries on to WhatsApp; when the person returns, pending.ts asks whether it went through
  });

  document.addEventListener('click', (e) => {
    const t = e.target as Element;
    const b = t.closest<HTMLElement>('[data-add]');
    if (b && b.dataset.id) { add(b.dataset.id); return; }
    if (t.closest('[data-cart-open]')) { ref = ref || makeRef(D.checkout.refPrefix, 'ORD', new Date()); openSheet(dlg); }
  });
  document.addEventListener('open-cart', () => openSheet(dlg));
  dlg.querySelector('[data-clear]')!.addEventListener('click', clear);
  onChange(render);
  render();
  // a fresh reference after a finished or cleared order
  onChange(() => { if (count() === 0) ref = ''; });
}
