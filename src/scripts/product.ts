// The fragrance sheet. One <dialog> reused for every bottle: fill it, play the bloom, open it. The 3D view loads the first time it opens.
import { D, byId, catLabel, h, mlOf, money, moodOf, poster, wireSheet, openSheet } from './data';
import type { Item } from './data';
import { add } from './cart';
import { bloom } from './transition';
import { glMode } from './gl/glmode';
import { reduced } from './data';
import type { Viewer } from './gl/viewer';
import { wireShare } from './share';

let viewer: Viewer | null = null, viewerTried = false, size = D.defaultSize, current: Item | null = null;

export function initProduct() {
  const found = document.getElementById('product-dialog') as HTMLDialogElement | null;
  if (!found) return;
  const dlg: HTMLDialogElement = found;
  wireSheet(dlg);
  const $ = <T extends HTMLElement>(s: string) => dlg.querySelector<T>(s)!;
  const media = $('[data-pd-media]'), img = $<HTMLImageElement>('[data-pd-poster]'), canvas = $<HTMLCanvasElement>('[data-pd-canvas]');
  const sizesEl = $('[data-sizes]'), priceEl = $('[data-pd-price]'), addBtn = $<HTMLButtonElement>('[data-pd-add]');
  let addTimer = 0;
  wireShare($('[data-pd-share]'), () => current?.id ?? null);

  const list = (el: HTMLElement, a: string[]) => { el.replaceChildren(...a.map((n) => h('li', {}, n))); };
  function fill(it: Item) {
    current = it;
    const m = moodOf(it);
    media.style.setProperty('--a', m.a); media.style.setProperty('--b', m.b); media.style.setProperty('--glow', m.glow);
    media.classList.remove('gl-on');
    img.src = poster(it.id);
    $('[data-pd-cat]').textContent = catLabel(it.category);
    $('[data-pd-name]').textContent = it.name;
    $('[data-pd-line]').textContent = it.line;
    $('[data-pd-desc]').textContent = it.description;
    list($('[data-n-top]'), it.notes.top); list($('[data-n-heart]'), it.notes.heart); list($('[data-n-base]'), it.notes.base);
    size = D.defaultSize in it.prices ? D.defaultSize : Object.keys(it.prices)[0];
    sizesEl.replaceChildren(...Object.keys(it.prices).map((k) => {
      const input = h('input', { type: 'radio', name: 'pd-size', value: k, checked: k === size });
      input.addEventListener('change', () => { size = k; price(); });
      return h('label', { class: 'opt' }, input, h('span', {}, `${mlOf(k)} ml`, h('small', {}, money(it.prices[k]))));
    }));
    price(); addBtn.textContent = 'Add to bag';
  }
  const price = () => { if (current) priceEl.textContent = money(current.prices[size]); };

  addBtn.addEventListener('click', () => {
    if (!current) return;
    add(current.id, size);
    addBtn.textContent = 'Added to bag ✓'; clearTimeout(addTimer);
    addTimer = window.setTimeout(() => { addBtn.textContent = 'Add to bag'; }, 1400);
  });
  dlg.querySelector('[data-zoom-in]')!.addEventListener('click', () => viewer?.zoom(1));
  dlg.querySelector('[data-zoom-out]')!.addEventListener('click', () => viewer?.zoom(-1));
  dlg.querySelector('[data-reset]')!.addEventListener('click', () => viewer?.reset());
  dlg.addEventListener('close', () => { viewer?.setActive(false); });

  async function startViewer(it: Item) {
    const mode = glMode();
    if (mode === 'off') return;
    try {
      if (!viewer && !viewerTried) {
        viewerTried = true;
        const { createViewer } = await import('./gl/viewer');
        viewer = createViewer(canvas, media, mode, reduced(), () => { viewer = null; media.classList.remove('gl-on'); });
      }
      if (!viewer || !dlg.open) return;
      viewer.setActive(true);
      await viewer.show(it);
      if (current === it && dlg.open) media.classList.add('gl-on');
    } catch { media.classList.remove('gl-on'); }
  }

  async function open(id: string, x: number, y: number) {
    const it = byId.get(id); if (!it || dlg.open) return;
    fill(it);
    await bloom(x, y, moodOf(it), () => { openSheet(dlg); startViewer(it); });
    if (!dlg.open && reduced()) { openSheet(dlg); startViewer(it); }
  }

  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-open-product]');
    if (!t) return;
    e.preventDefault();
    const r = t.getBoundingClientRect();
    const keyboard = e.detail === 0 || (e.clientX === 0 && e.clientY === 0);
    open(t.dataset.openProduct!, keyboard ? r.left + r.width / 2 : e.clientX, keyboard ? r.top + r.height / 2 : e.clientY);
  });
  document.addEventListener('open-product', ((e: CustomEvent<{ id: string; x: number; y: number }>) => open(e.detail.id, e.detail.x, e.detail.y)) as unknown as EventListener);
}
