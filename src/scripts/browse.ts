// The hero controller. Two states on #stage[data-state]:
//   gallery: all bottles float in their own space; tabs filter; tap a bottle (or its hidden keyboard button) to step inside
//   focus:   one bottle forward with its story; swipe / arrows / dots go to the next; X (or Esc) sends everything back up
// A scene (3D `shelf`, or the picture-based `posters` when 3D is off) does the moving; this file decides what happens when.
import { D, catLabel, money, moodOf, reduced, h } from './data';
import type { Item } from './data';
import { glMode } from './gl/glmode';
import { sceneReady, lifted } from './intro';
import { add } from './cart';
import type { Shelf, TagPos } from './gl/shelf';
import type { Rect } from './gl/layout';
import { productPath, wireShare } from './share';

const mod = (n: number, m: number) => ((n % m) + m) % m;
const pad = (n: number) => String(n).padStart(2, '0');

export function initBrowse() {
  const found = document.getElementById('stage'); if (!found) return;
  const root: HTMLElement = found;
  const $ = <T extends HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const view = $('[data-view]'), canvas = $<HTMLCanvasElement>('[data-gl]'), posterBox = $('[data-posters]'), tagBox = $('[data-tags]'), status = $('[data-status]');
  const zoneG = $('[data-zone-g]'), zoneF = $('[data-zone-f]'), body = $('[data-f-body]'), closeBtn = $<HTMLButtonElement>('[data-f-close]');
  const gl = $('[data-g-layer]'), fl = $('[data-f-layer]'), gnote = $('[data-gnote]'), bigword = $('[data-bigword]');
  const layers = [...root.querySelectorAll<HTMLElement>('[data-mood]')];
  const tabs = [...root.querySelectorAll<HTMLButtonElement>('[data-tab]')];
  const chips = [...document.querySelectorAll<HTMLButtonElement>('[data-chip]')];
  const cards = [...document.querySelectorAll<HTMLElement>('[data-card]')];
  const dots = $('[data-dots]'), addBtn = $<HTMLButtonElement>('[data-f-add]'), sizesEl = $('[data-f-sizes]');
  const homeMood = moodOf(D.items[0]), homeTitle = `${D.business.name} | ${D.business.tagline}`;
  let start = D.items.find((i) => i.id === root.dataset.start)?.id;            // a shared link opens straight onto this bottle (once)

  let cat = 'all', list: Item[] = D.items, cur: Item | null = null, state: 'gallery' | 'focus' = 'gallery', scene: Shelf | null = null, onLayer = 0, size = D.defaultSize;
  let bodyTimer = 0, noteTimer = 0, wordTimer = 0, addTimer = 0;
  // only move focus by itself when the person is using the keyboard (a mouse or finger user would see a stray ring)
  let kbd = false;
  addEventListener('keydown', () => { kbd = true; }, true); addEventListener('pointerdown', () => { kbd = false; }, true);
  const idxOf = (it: Item | null) => (it ? list.findIndex((x) => x.id === it.id) : -1);

  /* ---------- little pieces ---------- */
  const rel = (el: HTMLElement): Rect => { const r = el.getBoundingClientRect(), v = view.getBoundingClientRect(); return { x: r.left - v.left, y: r.top - v.top, w: r.width, h: r.height }; };
  const zones = () => ({ gallery: rel(zoneG), focus: rel(zoneF) });
  const ids = () => list.map((i) => i.id);

  function setMood(m: { a: string; b: string; glow: string }) {
    const next = layers[1 - onLayer];
    next.style.setProperty('--a', m.a); next.style.setProperty('--b', m.b); next.style.setProperty('--glow', m.glow);
    next.classList.add('on'); layers[onLayer].classList.remove('on'); onLayer = 1 - onLayer;
    scene?.setMood(m);
  }
  function setWord(text: string) {
    const draw = () => {
      bigword.textContent = text;
      const avail = view.clientWidth || innerWidth;
      bigword.style.fontSize = `${Math.round(Math.max(150, Math.min(790, (avail * 0.96) / (Math.max(text.length, 4) * 0.43))))}px`;
      bigword.classList.remove('swap');
    };
    clearTimeout(wordTimer);
    if (reduced()) { draw(); return; }
    bigword.classList.add('swap'); wordTimer = window.setTimeout(draw, 190);
  }

  /* ---------- gallery text ---------- */
  function setNote() {
    const c = D.categories.find((x) => x.id === cat);
    const title = $('[data-g-title]'), line = $('[data-g-line]');
    const apply = () => {
      if (c) { title.textContent = c.label; line.textContent = `${c.blurb} ${list.length === 1 ? 'One signature' : `${list.length} signatures`} here.`; }
      else { title.textContent = gnote.dataset.allTitle || ''; line.textContent = gnote.dataset.allText || ''; }
      gnote.classList.remove('swap');
    };
    clearTimeout(noteTimer);
    if (reduced()) { apply(); return; }
    gnote.classList.add('swap'); noteTimer = window.setTimeout(apply, 170);
  }

  function setCategory(c: string) {
    if (c === cat) return;
    if (state === 'focus') close(false);
    cat = c;
    list = c === 'all' ? D.items : D.items.filter((i) => i.category === c);
    tabs.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.tab === c)));
    chips.forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.chip === c)));
    cards.forEach((el) => { el.hidden = c !== 'all' && el.dataset.cat !== c; });
    root.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => { (b.parentElement as HTMLElement).hidden = !ids().includes(b.dataset.pick!); });
    setNote(); buildDots();
    scene?.setList(ids());
  }
  tabs.forEach((t) => t.addEventListener('click', () => setCategory(t.dataset.tab!)));
  chips.forEach((t) => t.addEventListener('click', () => setCategory(t.dataset.chip!)));

  /* ---------- focus text ---------- */
  function buildDots() {
    dots.replaceChildren(...list.map((it, i) => {
      const b = h('button', { type: 'button', class: 'dot', 'aria-label': it.name, 'aria-current': cur && it.id === cur.id ? 'true' : undefined });
      b.addEventListener('click', () => { const k = idxOf(cur); if (i !== k) step(i, i > k ? 1 : -1); });
      return b;
    }));
  }
  function fillSizes(it: Item) {
    size = D.defaultSize in it.prices ? D.defaultSize : Object.keys(it.prices)[0];
    sizesEl.replaceChildren(...Object.keys(it.prices).map((k) => {
      const b = h('button', { type: 'button', class: 'f-size', 'aria-pressed': String(k === size) }, `${D.sizes.find((s) => s.key === k)?.ml ?? k} ml`);
      b.addEventListener('click', () => { size = k; [...sizesEl.children].forEach((c) => c.setAttribute('aria-pressed', String(c === b))); $('[data-f-price]').textContent = money(it.prices[k]); });
      return b;
    }));
    $('[data-f-price]').textContent = money(it.prices[size]);
  }
  function fill(it: Item) {
    $('[data-f-n]').textContent = pad(idxOf(it) + 1); $('[data-f-total]').textContent = pad(list.length);
    $('[data-f-cat]').textContent = catLabel(it.category);
    $('[data-f-name]').textContent = it.name;
    $('[data-f-line]').textContent = it.line; $('[data-f-desc]').textContent = it.description;
    $('[data-f-top]').textContent = it.notes.top.join(' · '); $('[data-f-heart]').textContent = it.notes.heart.join(' · '); $('[data-f-base]').textContent = it.notes.base.join(' · ');
    fillSizes(it);
    clearTimeout(addTimer); addBtn.textContent = 'Add to bag';
    [...dots.children].forEach((d, i) => { if (list[i]?.id === it.id) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
  }
  /** unveil: the story is written in, line by line. dir = which side it comes from (0 = from below) */
  function reveal(it: Item, dir: number) {
    clearTimeout(bodyTimer);
    const show = () => {
      fill(it);
      body.style.setProperty('--dx', dir ? `${dir * 36}px` : '0px'); body.style.setProperty('--dy', dir ? '0px' : '16px');
      body.classList.remove('leaving');
      void body.offsetWidth;
      requestAnimationFrame(() => body.classList.add('in'));
    };
    if (reduced() || !body.classList.contains('in')) { body.classList.remove('in'); show(); return; }
    body.classList.remove('in'); body.classList.add('leaving');
    bodyTimer = window.setTimeout(show, 140);
  }
  [...body.children].forEach((c, i) => (c as HTMLElement).style.setProperty('--i', String(i)));

  /* ---------- the address bar follows the bottle, so what you see is what you can share ---------- */
  function sync(it: Item | null) {
    const path = it ? productPath(it.id) : '/';
    try { if (location.pathname !== path) history.replaceState(null, '', path + location.search + location.hash); } catch { /* sandboxed preview: harmless */ }
    document.title = it ? `${it.name} | ${D.business.display}` : homeTitle;
  }
  wireShare($('[data-f-share]'), () => cur?.id ?? null, status);

  /* ---------- state changes ---------- */
  function pick(id: string) {
    if (state === 'focus') return;
    const it = list.find((x) => x.id === id); if (!it) return;
    state = 'focus'; cur = it; root.dataset.state = 'focus'; sync(it);
    fl.removeAttribute('inert'); fl.setAttribute('aria-hidden', 'false'); gl.setAttribute('inert', ''); gl.setAttribute('aria-hidden', 'true');
    setMood(moodOf(it)); setWord(it.name.split(' ')[0]);
    buildDots(); reveal(it, 0);
    scene?.select(id);
    if (kbd) setTimeout(() => { if (state === 'focus') closeBtn.focus({ preventScroll: true }); }, 60);
  }
  function step(i: number, dir: 1 | -1) {
    if (state !== 'focus' || list.length < 2) return;
    const it = list[mod(i, list.length)]; if (!it || it.id === cur?.id) return;
    cur = it; sync(it); setMood(moodOf(it)); setWord(it.name.split(' ')[0]);
    reveal(it, dir);
    scene?.goto(it.id, dir);
  }
  function close(focusBack = true) {
    if (state !== 'focus') return;
    const was = cur; state = 'gallery'; cur = null; root.dataset.state = 'gallery'; sync(null);
    gl.removeAttribute('inert'); gl.setAttribute('aria-hidden', 'false'); fl.setAttribute('inert', ''); fl.setAttribute('aria-hidden', 'true');
    setMood(homeMood); setWord('Rhem');
    body.classList.remove('in', 'leaving'); clearTimeout(bodyTimer);
    scene?.close();
    if (focusBack && was && kbd) setTimeout(() => root.querySelector<HTMLElement>(`[data-pick="${was.id}"], .pp[aria-label^="${was.name}."]`)?.focus({ preventScroll: true }), 60);
  }
  const swipe = (dir: 1 | -1) => { if (state === 'focus' && cur) step(idxOf(cur) + dir, dir); };

  closeBtn.addEventListener('click', () => close());
  $('[data-prev]').addEventListener('click', () => swipe(-1));
  $('[data-next]').addEventListener('click', () => swipe(1));
  root.querySelectorAll<HTMLElement>('[data-pick]').forEach((b) => b.addEventListener('click', () => pick(b.dataset.pick!)));
  addBtn.addEventListener('click', () => {
    if (!cur) return;
    add(cur.id, size); addBtn.textContent = 'Added to bag ✓';
    clearTimeout(addTimer); addTimer = window.setTimeout(() => { addBtn.textContent = 'Add to bag'; }, 1400);
  });
  $('[data-f-look]').addEventListener('click', (e) => {
    if (!cur) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect(), k = e.detail === 0;
    document.dispatchEvent(new CustomEvent('open-product', { detail: { id: cur.id, x: k ? r.left + r.width / 2 : (e as MouseEvent).clientX, y: k ? r.top + r.height / 2 : (e as MouseEvent).clientY } }));
  });
  addEventListener('keydown', (e) => {
    if (state !== 'focus' || document.querySelector('dialog[open]')) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight') swipe(1); else if (e.key === 'ArrowLeft') swipe(-1);
  });
  buildDots();

  /* ---------- the scene ---------- */
  const tagEls = new Map<string, HTMLElement>(D.items.map((it) => [it.id, h('div', { class: 'tag' }, it.name)]));
  tagBox.append(...tagEls.values());
  const last = new Map<string, string>();
  const onFrame = (tags: TagPos[]) => {
    for (const g of tags) {
      const el = tagEls.get(g.id)!;
      const t = `translate3d(${g.x.toFixed(1)}px,${g.y.toFixed(1)}px,0) translateX(-50%)`;
      if (last.get(g.id) !== t) { el.style.transform = t; last.set(g.id, t); }
      el.classList.toggle('on', g.on); el.classList.toggle('hover', g.hover);
    }
  };

  /** the picture version: only used when 3D is off or lost (no WebGL, data saver, ?still) */
  async function startPosters() {
    root.classList.add('posters-on'); root.classList.remove('gl-on');
    const { createPosters } = await import('./posters');
    const p = createPosters({ host: view, box: posterBox, items: D.items, still: reduced(), zones, onSelect: pick, onSwipe: swipe, start });
    scene = p; p.setList(ids());
    if (start && state === 'gallery') pick(start);
    await p.ready; sceneReady();
  }

  /** the 3D version: everything is downloaded together and prepared out of sight while the intro is up, then the bottles pop up (as before) with nothing left to prepare */
  async function startGL(mode: 'lite' | 'full', first?: string) {
    const { createShelf } = await import('./gl/shelf');
    const s = createShelf({
      canvas, host: view, items: D.items, moods: D.moods, mode, still: reduced(), mood: homeMood, zones, first,
      onSelect: pick, onSwipe: swipe,
      onHover: (id) => { view.classList.toggle('point', !!id); },
      onFrame,
      onReady: () => sceneReady(),
      onLost: () => { s.dispose(); tagBox.replaceChildren(); root.classList.remove('gl-on'); if (state === 'focus') close(false); startPosters(); },
    });
    scene = s; root.classList.add('gl-on');
    s.setList(ids());
    if (start && state === 'gallery') pick(start);
    lifted.then(() => s.reveal?.());
    // draw only while the hero is on screen, no sheet is open and the tab is visible
    let visible = true;
    const sync = () => s.setActive(visible && !document.hidden && !document.documentElement.classList.contains('dlg'));
    new IntersectionObserver((en) => { visible = en[0].isIntersecting; sync(); }).observe(root);
    new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    document.addEventListener('visibilitychange', sync);
  }

  const mode = glMode();
  if (mode === 'off') startPosters(); else startGL(mode, start).catch(() => startPosters());
}
