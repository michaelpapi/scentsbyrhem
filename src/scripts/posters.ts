// The same floating gallery made of pictures: used when 3D is off (no WebGL, data saver, ?still, context lost).
// Same promises as the 3D scene: bottles spread out with room between them, one tap brings one forward while the rest fall away,
// a swipe pulls the next in from the side, close sends everything back up from below.
import type { Item } from './data';
import { poster } from './data';
import { layoutHomes, focusPose, type Rect } from './gl/layout';
import type { Shelf } from './gl/shelf';

export type PosterOpts = {
  host: HTMLElement; box: HTMLElement; items: Item[]; still: boolean;
  zones(): { gallery: Rect; focus: Rect };
  onSelect(id: string): void; onSwipe(dir: 1 | -1): void;
  start?: string;                          // open straight onto this fragrance (shared link)
};
type P = { el: HTMLButtonElement; item: Item; mode: 'home' | 'focus' | 'off' };

const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function createPosters(o: PosterOpts): Shelf {
  let W = 1, H = 1, size = 100, state: 'gallery' | 'focus' = 'gallery';
  let list: P[] = [], cur: P | null = null;
  const all: P[] = o.items.map((item, k) => {
    const el = document.createElement('button'); el.type = 'button'; el.className = 'pp'; el.setAttribute('aria-label', `${item.name}. Open`);
    el.style.setProperty('--dl', `${-rnd(0, 6).toFixed(2)}s`);
    const img = new Image(); img.src = poster(item.id); img.alt = ''; img.width = 640; img.height = 800; img.decoding = 'async'; img.draggable = false;
    const label = document.createElement('span'); label.textContent = item.name; label.setAttribute('aria-hidden', 'true');
    el.append(img, label);
    el.addEventListener('click', () => { if (state === 'gallery') o.onSelect(item.id); });
    o.box.append(el);
    return { el, item, mode: 'off' } as P;
  });
  list = all.slice();
  const byId = new Map(all.map((p) => [p.item.id, p]));
  let homes: { x: number; y: number; s: number }[] = [];
  const hp = (p: P) => homes[list.indexOf(p)];
  const set = (p: P, x: number, y: number, sc: number, rot: number) => {
    p.el.style.setProperty('--x', x.toFixed(1)); p.el.style.setProperty('--y', y.toFixed(1)); p.el.style.setProperty('--sc', sc.toFixed(3)); p.el.style.setProperty('--rot', `${rot.toFixed(1)}deg`);
  };
  const reflow = (p: P) => void p.el.offsetWidth;
  const below = (p: P) => H + size * 1.8;
  const focusPos = (p: P) => { const f = focusPose(zF); set(p, f.x, f.y, f.s / size, 0); };
  const homePos = (p: P) => { const h = hp(p); if (h) set(p, h.x, h.y, 1, 0); };
  const put = (p: P, delay = 0) => { p.el.style.transitionDelay = delay ? `${delay}ms` : ''; };
  let zG: Rect = { x: 0, y: 0, w: 1, h: 1 }, zF: Rect = zG;

  function layout() {
    const r = o.host.getBoundingClientRect(); W = r.width; H = r.height;
    const z = o.zones(); zG = z.gallery; zF = z.focus;
    homes = layoutHomes(list.length, zG); size = homes[0]?.s ?? 100;
    all.forEach((p) => p.el.style.setProperty('--h', (size * 1.12).toFixed(1)));
    all.forEach((p) => {
      p.el.classList.add('snap');
      if (p.mode === 'focus') focusPos(p); else if (p.mode === 'home') homePos(p); else set(p, hp(p)?.x ?? W / 2, below(p), 1, 0);
      reflow(p); p.el.classList.remove('snap');
    });
  }
  function fall(p: P, delay: number) {
    p.mode = 'off'; p.el.classList.remove('jump'); p.el.classList.add('fall'); put(p, delay);
    set(p, Number(p.el.style.getPropertyValue('--x')) + rnd(-0.06, 0.06) * W, below(p), 1, rnd(-40, 40));
  }
  function rise(p: P, order: number) {
    p.mode = 'home';
    if (o.still) { p.el.classList.remove('fall'); homePos(p); return; }
    p.el.classList.add('snap'); p.el.classList.remove('fall'); const h = hp(p); set(p, (h?.x ?? W / 2) + rnd(-0.3, 0.3) * size, below(p), 1, rnd(-30, 30)); reflow(p);
    p.el.classList.remove('snap'); p.el.classList.add('jump'); put(p, order * 70); homePos(p);
    setTimeout(() => { p.el.classList.remove('jump'); put(p); }, 1100 + order * 70);
  }
  function setList(ids: string[]) {
    const next = ids.map((id) => byId.get(id)).filter((p): p is P => !!p); list = next;
    homes = layoutHomes(list.length, zG); size = homes[0]?.s ?? size;
    all.forEach((p) => p.el.style.setProperty('--h', (size * 1.12).toFixed(1)));
    if (state !== 'gallery') return;
    all.forEach((p) => {
      const k = next.indexOf(p);
      if (k < 0) { if (p.mode !== 'off') fall(p, rnd(0, 120)); return; }
      if (p.mode === 'off') rise(p, k); else { p.el.classList.remove('jump'); put(p); homePos(p); }
    });
  }
  function select(id: string) {
    const p = byId.get(id); if (!p || state === 'focus') return;
    state = 'focus'; cur = p; p.mode = 'focus'; p.el.classList.remove('jump'); put(p); focusPos(p);
    all.forEach((x) => { if (x !== p && x.mode !== 'off') fall(x, rnd(0, 200)); });
  }
  function goto(id: string, dir: 1 | -1) {
    const p = byId.get(id); if (!p || state !== 'focus' || p === cur) return;
    if (cur) fall(cur, 0);
    cur = p; p.mode = 'focus';
    const f = focusPose(zF);
    p.el.classList.add('snap'); p.el.classList.remove('fall'); set(p, dir > 0 ? W + f.s : -f.s, f.y, (f.s * 0.9) / size, dir > 0 ? -18 : 18); reflow(p);
    p.el.classList.remove('snap'); p.el.classList.add('jump'); put(p, 90); focusPos(p);
    setTimeout(() => { p.el.classList.remove('jump'); put(p); }, 1100);
  }
  function close() {
    if (state !== 'focus') return;
    state = 'gallery'; const was = cur; cur = null;
    all.forEach((p) => { if (!list.includes(p) && p !== was) return; });
    list.forEach((p, k) => {
      if (p === was) { p.mode = 'home'; p.el.classList.remove('fall'); put(p); homePos(p); } else rise(p, k);
    });
  }

  // swipe and sideways trackpad scroll, while one bottle is in front
  const root = (o.host.closest('#stage') as HTMLElement | null) ?? o.host;
  let sx = 0, sy = 0, sid = -1;
  const control = (t: EventTarget | null) => t instanceof Element && !!t.closest('.tabs, .f-body, .f-nav, .gnote, .f-close, .tab');
  root.addEventListener('pointerdown', (e) => { if (state !== 'focus' || control(e.target)) return; sx = e.clientX; sy = e.clientY; sid = e.pointerId; });
  root.addEventListener('pointerup', (e) => {
    if (state !== 'focus' || e.pointerId !== sid) return; sid = -1;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.3) o.onSwipe(dx < 0 ? 1 : -1);
  });
  let acc = 0, at = 0, cool = 0;
  root.addEventListener('wheel', (e) => {
    if (state !== 'focus' || Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.1 || Math.abs(e.deltaX) < 1) return;
    if (document.documentElement.classList.contains('dlg')) return;
    e.preventDefault();
    const t = performance.now(); if (t < cool) return; if (t - at > 380) acc = 0; at = t; acc += e.deltaX;
    if (Math.abs(acc) > 80) { o.onSwipe(acc > 0 ? 1 : -1); acc = 0; cool = t + 650; }
  }, { passive: false });

  const ro = new ResizeObserver(layout); ro.observe(o.host);
  root.querySelectorAll('[data-zone-g], [data-zone-f]').forEach((el) => ro.observe(el));
  const first = o.start ? byId.get(o.start) : undefined;
  if (first) { state = 'focus'; cur = first; first.mode = 'focus'; }
  layout();
  if (!first) list.forEach((p, k) => rise(p, k));
  return {
    setList, select, goto, close, resize: layout,
    hover() {}, setMood() {}, setActive() {},
    dispose() { ro.disconnect(); all.forEach((p) => p.el.remove()); },
  };
}
