// The hero scene. Two states:
//  gallery: every bottle floats and slowly turns in its own patch of space.
//  focus:   one bottle is brought forward; the others fall away. Swipe for the next one (it is pulled in from the side and the
//           old one drops off). Close: everything jumps back up from below and drifts again.
// Positions are in CSS pixels of the stage (origin top-left), so the page layout (DOM zones) fully decides where bottles go.
import * as THREE from 'three';
import type { Item, Mood } from '../data';
import { loadModel, prefetch, setModelMode, type Loaded } from './models';
import { makeEnv } from './env';
import { createPetals, type Petals } from './petals';
import { clamp, cubicBezier, damp, lerp } from '../ease';
import { layoutHomes, focusPose, type Rect, type Home } from './layout';
import type { GLMode } from './glmode';

export type TagPos = { id: string; x: number; y: number; on: boolean; hover: boolean };
export type ShelfOpts = {
  canvas: HTMLCanvasElement; host: HTMLElement; items: Item[]; moods: Record<string, Mood>; mode: Exclude<GLMode, 'off'>; still: boolean; mood: Mood;
  zones(): { gallery: Rect; focus: Rect };
  first?: string;                          // load this bottle's model first (a shared link opens straight onto it)
  hold?: boolean;                          // load and warm up in the background, draw nothing until `adopt` is called
  onSelect(id: string): void;              // tap on a floating bottle
  onSwipe(dir: 1 | -1): void;              // sideways swipe / scroll while one bottle is in focus (1 = next)
  onHover(id: string | null): void;
  onFrame?(tags: TagPos[]): void;
  onReady(): void; onLost(): void;
};
export type Shelf = {
  adopt(focusId: string | null, ids: string[]): void;
  reveal?(): void;                         // let the bottles rise (they wait for this, so the pop-up happens when the page is actually visible)
  setList(ids: string[]): void; select(id: string): void; goto(id: string, dir: 1 | -1): void; close(): void;
  hover(id: string | null): void; setMood(m: Mood): void; setActive(on: boolean): void; resize(): void; dispose(): void;
};

type Pose = { x: number; y: number; s: number; rz: number; ry: number };
type Anim = { t0: number; dur: number; from: Pose; to: Pose; ease: (p: number) => number; end: 'home' | 'focus' | 'off' };
type Slot = {
  item: Item; group: THREE.Group; glow: THREE.Sprite; hit: THREE.Mesh; loaded?: Loaded;
  pose: Pose; mode: 'off' | 'home' | 'focus'; anim: Anim | null; home: Home;
  phase: number; phase2: number; spin: number; fw: number; hover: number; hoverT: number; tiltX: number; tiltY: number; kick: number; dragX: number; rise: number;
};

const TAU = Math.PI * 2;
const easeOut = cubicBezier(0.23, 1, 0.32, 1);
const easeInOut = cubicBezier(0.77, 0, 0.175, 1);
const easeIn = (p: number) => p * p;
const easeBack = (p: number) => { const c1 = 1.25, c3 = c1 + 1; return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2); };
const wrap = (a: number) => a - Math.round(a / TAU) * TAU;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function createShelf(o: ShelfOpts): Shelf {
  const lite = o.mode === 'lite';
  const renderer = new THREE.WebGLRenderer({ canvas: o.canvas, antialias: !lite, alpha: true, powerPreference: 'high-performance' });
  setModelMode(o.mode);
  let pr = Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 1.5);
  renderer.setPixelRatio(pr);
  renderer.transmissionResolutionScale = 0.5;   // the glass only needs a soft copy of what is behind it: far fewer pixels in the extra pass
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.environment = makeEnv(renderer); scene.environmentIntensity = 0.95;
  const key = new THREE.DirectionalLight(0xffeef2, 2.1); key.position.set(0.5, 0.7, 1); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(o.mood.glow), 3.2); rim.position.set(-0.7, 0.4, -0.8); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffd9e2, 0.28));
  const rimTarget = new THREE.Color(o.mood.glow);
  const camera = new THREE.PerspectiveCamera(28, 1, 10, 8000);
  const petals: Petals | null = o.still ? null : createPetals(lite ? 14 : 36);
  if (petals) scene.add(petals.mesh);

  // soft coloured halo behind every bottle: it also separates neighbours from each other
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gx = gc.getContext('2d')!; const gr = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  gx.fillStyle = gr; gx.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(gc);
  const hitGeo = new THREE.CylinderGeometry(0.58, 0.58, 1.15, 10); const hitMat = new THREE.MeshBasicMaterial({ visible: false });

  let W = 1, H = 1, zG: Rect = { x: 0, y: 0, w: 1, h: 1 }, zF: Rect = { x: 0, y: 0, w: 1, h: 1 };
  let state: 'gallery' | 'focus' = 'gallery';
  let active = !o.hold, dirty = true, disposed = false, ready = false;
  let focusSlot: Slot | null = null, hoverId: string | null = null, lastT = performance.now(), time = 0;
  const zeroPose = (): Pose => ({ x: 0, y: 0, s: 1, rz: 0, ry: 0 });

  const slots: Slot[] = o.items.map((item, k) => {
    const group = new THREE.Group(); group.visible = false; scene.add(group);
    const m = o.moods[item.mood];
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color(m.glow), transparent: true, opacity: 0.4, depthWrite: false }));
    glow.scale.set(2.3, 2.3, 1); glow.position.z = -0.6; group.add(glow);
    const hit = new THREE.Mesh(hitGeo, hitMat); group.add(hit);
    return { item, group, glow, hit, pose: zeroPose(), mode: 'off', anim: null, home: { x: 0, y: 0, s: 100 }, phase: rnd(0, TAU), phase2: rnd(0, TAU), spin: (k % 2 ? 1 : -1) * rnd(0.22, 0.4), fw: 0, hover: 0, hoverT: 0, tiltX: 0, tiltY: 0, kick: 0, dragX: 0, rise: 0 } as Slot;
  });
  const byId = new Map(slots.map((s) => [s.item.id, s]));
  let list: Slot[] = slots.slice();

  /* ---------- layout ---------- */
  const fpose = (s?: Slot) => { const f = focusPose(zF); if (s?.loaded) f.s = Math.min(f.s, (zF.w * 0.9) / Math.max(s.loaded.width, 0.5)); return f; };   // a wide bottle gets a little smaller so it never leaves the screen
  function homes() { const h = layoutHomes(list.length, zG); list.forEach((s, k) => { s.home = h[k]; }); }
  function layout() {
    const r = o.host.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    // big canvases on sharp screens are capped to a pixel budget: the fill cost is what slows weaker graphics chips down
    const fit = Math.max(1, Math.sqrt((lite ? 1.4e6 : 2.1e6) / (W * H)));
    if (pr > fit) { pr = fit; renderer.setPixelRatio(pr); }
    renderer.setSize(W, H, false);
    camera.aspect = W / H; camera.position.set(0, 0, H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))); camera.lookAt(0, 0, 0); camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
    const z = o.zones(); zG = z.gallery; zF = z.focus;
    petals?.resize(W, H); homes(); dirty = true;
  }

  /* ---------- animation helpers ---------- */
  const now = () => performance.now();
  function begin(s: Slot, to: Pose, dur: number, ease: (p: number) => number, end: Anim['end'], delay = 0) {
    if (o.still) { s.pose = { ...to }; s.anim = null; s.mode = end; s.group.visible = end !== 'off'; if (end === 'home') s.fw = 1; dirty = true; return; }
    s.anim = { t0: now() + delay, dur, from: { ...s.pose }, to, ease, end }; s.group.visible = true; dirty = true;
  }
  // a wide, flat bottle is drawn a little smaller so it keeps clear air around it (and never reaches the screen edge while turning)
  const wf = (s: Slot) => (s.loaded ? Math.min(1, 0.66 / Math.max(s.loaded.width, 0.5)) : 1);
  const homePose = (s: Slot): Pose => ({ x: s.home.x, y: s.home.y, s: s.home.s * wf(s), rz: 0, ry: s.pose.ry });
  function fall(s: Slot, delay = 0) {
    if (s.mode === 'off' && !s.anim) return;
    s.mode = 'off'; s.dragX = 0; s.pose.x += drags.get(s) ?? 0; drags.set(s, 0);
    begin(s, { x: s.pose.x + rnd(-0.07, 0.07) * W, y: H + s.pose.s * 1.5, s: s.pose.s, rz: s.pose.rz + rnd(-1.1, 1.1), ry: s.pose.ry + rnd(-2.5, 2.5) }, rnd(650, 900), easeIn, 'off', delay);
  }
  function rise(s: Slot, order: number, gap = 75) {
    if (!s.loaded || !go) { s.rise = order + 1; return; }   // not warm yet (or the reveal has not started): it rises the moment it can
    s.rise = 0; s.mode = 'home'; s.fw = 0;
    s.pose = { x: s.home.x + rnd(-0.3, 0.3) * s.home.s, y: H + s.home.s * 1.5, s: s.home.s, rz: rnd(-0.9, 0.9), ry: rnd(-2, 2) };
    begin(s, homePose(s), gap > 100 ? 900 : 950, easeBack, 'home', order * gap);
  }
  const focusTo = (s: Slot): Pose => { const f = fpose(s); return { x: f.x, y: f.y, s: f.s, rz: 0, ry: 0.35 }; };

  /* ---------- models ---------- */
  // Everything is downloaded side by side, then each bottle is parsed, its textures sent to the GPU and its shaders compiled while nothing is
  // on screen. `onReady` fires when the last one is warm, so the first time a bottle is drawn nothing has to be prepared.
  const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
  async function warm(s: Slot) {
    const g = s.group, was = g.visible;
    g.visible = true; g.scale.setScalar(0.001); g.position.set(0, 0, 0);
    g.traverse((x) => {
      const m = x as THREE.Mesh; if (!m.isMesh) return;
      for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as unknown as Record<string, unknown>[])
        for (const k in mat) { const v = mat[k] as THREE.Texture | undefined; if (v && v.isTexture) renderer.initTexture(v); }
    });
    await nextFrame();                                       // textures first, shaders in the next frame: never one big block
    try { await renderer.compileAsync(scene, camera); } catch { /* drawn on first use instead */ }
    renderer.render(scene, camera);
    g.visible = was;
  }
  const ENTER_GAP = 320;                                   // on first load the bottles come up one at a time, so only one or two are moving (and being first drawn) at once
  let go = false;                                          // the reveal: bottles may rise from now on
  function reveal() {
    if (go) return; go = true;
    if (state === 'gallery') slots.forEach((s) => { if (s.rise && s.loaded) rise(s, s.rise - 1, ENTER_GAP); });
  }
  o.items.forEach((it) => { prefetch(it).catch(() => {}); });                 // all downloads start together
  let chain: Promise<void> = Promise.resolve();                               // bottles are prepared one at a time, in the order they arrive
  const jobs = [...slots].sort((a, b) => Number(b.item.id === o.first) - Number(a.item.id === o.first)).map((s) =>
    loadModel(s.item).catch(() => null).then((l) => {
      if (!l || disposed) return;
      chain = chain.then(async () => {
        if (disposed) return;
        const model = l.object.clone(true); model.position.y = -l.height / 2; s.group.add(model);
        await warm(s); await nextFrame();
        s.loaded = l;
        if (go && state === 'gallery' && s.rise) rise(s, 0, ENTER_GAP);   // a late bottle rises on its own
      }).catch(() => { /* this bottle stays out; the rest carry on */ });
    }));
  Promise.all(jobs).then(() => chain).then(() => {
    if (disposed) return;
    ready = true; o.onReady(); dirty = true;
  });

  /* ---------- public actions ---------- */
  /** take over from the picture version without any movement: same positions, same state */
  function adopt(focusId: string | null, ids: string[]) {
    list = ids.map((id) => byId.get(id)).filter((s): s is Slot => !!s); layout();
    slots.forEach((s) => { s.anim = null; s.mode = 'off'; s.group.visible = false; s.rise = 0; });
    const f = focusId ? byId.get(focusId) : undefined;
    if (f && f.loaded) {
      state = 'focus'; focusSlot = f; f.mode = 'focus'; f.pose = { ...focusTo(f) }; f.group.visible = true;
    } else {
      state = 'gallery'; focusSlot = null;
      list.forEach((s) => { if (!s.loaded) return; s.mode = 'home'; s.pose = homePose(s); s.fw = 1; s.group.visible = true; });
    }
    dirty = true; lastT = now(); if (!active) { active = true; renderer.setAnimationLoop(frame); }
  }

  function setList(ids: string[]) {
    const next = ids.map((id) => byId.get(id)).filter((s): s is Slot => !!s);
    list = next; homes();
    if (state !== 'gallery') return;
    slots.forEach((s) => {
      const k = next.indexOf(s);
      if (k >= 0) { if (s.mode === 'off') rise(s, k); else begin(s, homePose(s), 700, easeOut, 'home'); }
      else fall(s, rnd(0, 140));
    });
  }
  /** run `fn` once the bottle's model has arrived (a tap can come before the last one has loaded) */
  function whenLoaded(s: Slot, fn: () => void, tries = 200) {
    if (disposed) return;
    if (s.loaded) fn(); else if (tries > 0) setTimeout(() => whenLoaded(s, fn, tries - 1), 60);
  }
  function select(id: string) {
    const s = byId.get(id); if (!s || state === 'focus') return;
    if (!s.loaded) { whenLoaded(s, () => select(id)); return; }
    const unseen = s.mode === 'off' && !s.anim;          // arriving from a shared link: it rises into place instead of starting in a corner
    slots.forEach((x) => { x.rise = 0; });
    state = 'focus'; focusSlot = s; s.mode = 'focus'; s.dragX = 0;
    if (unseen) { const f0 = fpose(s); s.pose = { x: f0.x, y: H + f0.s, s: f0.s * 0.8, rz: 0.25, ry: s.pose.ry + 1.5 }; s.group.visible = true; }
    s.pose.ry = wrap(s.pose.ry);
    begin(s, focusTo(s), 850, easeOut, 'focus');
    slots.forEach((x) => { if (x !== s && x.mode !== 'off') fall(x, rnd(0, 230)); });
    const f = fpose(s); petals?.burst(f.x, f.y, 1.5);
  }
  function goto(id: string, dir: 1 | -1) {
    const ns = byId.get(id); if (!ns || state !== 'focus' || ns === focusSlot) return;
    const old = focusSlot; if (old) fall(old, 0);
    const f = fpose(ns);
    ns.mode = 'focus'; ns.dragX = 0; focusSlot = ns;
    ns.pose = { x: dir > 0 ? W + f.s * 0.9 : -f.s * 0.9, y: f.y - f.s * 0.04, s: f.s * 0.9, rz: dir > 0 ? -0.6 : 0.6, ry: dir > 0 ? 2.6 : -2.6 };
    ns.group.visible = false;
    whenLoaded(ns, () => { if (focusSlot === ns) begin(ns, focusTo(ns), 900, easeBack, 'focus', 120); });
    petals?.burst(dir > 0 ? W * 0.8 : W * 0.2, f.y, 0.9);
  }
  function close() {
    if (state !== 'focus') return;
    state = 'gallery'; const s = focusSlot; focusSlot = null; homes();
    list.forEach((x, k) => {
      if (x === s) { x.mode = 'home'; x.fw = 0; begin(x, homePose(x), 850, easeInOut, 'home'); }
      else rise(x, k);
    });
    petals?.burst(W / 2, H * 0.6, 1.1);
  }

  /* ---------- pointer ---------- */
  const view = o.host;
  const root = (view.closest('#stage') as HTMLElement | null) ?? view;
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function pick(cx: number, cy: number): Slot | null {
    const r = o.canvas.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
    const cands = slots.filter((s) => s.loaded && s.group.visible && s.mode !== 'off' && (state === 'gallery' || s === focusSlot));
    const hits = ray.intersectObjects(cands.map((s) => s.hit), false);
    return hits.length ? cands.find((s) => s.hit === hits[0].object) ?? null : null;
  }
  const inView = (t: EventTarget | null) => t === view || (t instanceof Node && view.contains(t));
  const isControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, textarea, label, .tabs, .f-body, .f-nav, .gnote');
  let drag: { id: number; x0: number; y0: number; x: number; t0: number; moved: boolean; slot: Slot | null } | null = null;

  root.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    if (isControl(e.target)) return;
    drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, t0: now(), moved: false, slot: inView(e.target) ? pick(e.clientX, e.clientY) : null };
  });
  root.addEventListener('pointermove', (e) => {
    if (state === 'gallery' && e.pointerType === 'mouse' && !drag && inView(e.target)) {
      const s = pick(e.clientX, e.clientY); const id = s ? s.item.id : null;
      if (id !== hoverId) { hoverId = id; view.classList.toggle('point', !!id); o.onHover(id); dirty = true; }
    }
    if (state === 'focus' && focusSlot && e.pointerType === 'mouse' && !drag) {          // the bottle leans toward the pointer
      const r = o.canvas.getBoundingClientRect(); const nx = ((e.clientX - r.left) - focusSlot.pose.x) / (W * 0.5), ny = ((e.clientY - r.top) - focusSlot.pose.y) / (H * 0.5);
      focusSlot.tiltY = clamp(nx, -1, 1) * 0.32; focusSlot.tiltX = clamp(ny, -1, 1) * 0.12; dirty = true;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) > 9) { drag.moved = true; if (state === 'focus' && Math.abs(dx) > Math.abs(dy)) { try { root.setPointerCapture(e.pointerId); } catch { /* ignore */ } view.classList.add('grabbing'); } }
    if (drag.moved && state === 'focus' && focusSlot && Math.abs(dx) > Math.abs(dy) * 0.8) { focusSlot.dragX = dx * 0.9; dirty = true; }
  });
  const end = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return;
    const d = drag; drag = null; view.classList.remove('grabbing');
    const dx = e.clientX - d.x0, dy = e.clientY - d.y0, dt = Math.max(1, now() - d.t0);
    if (!d.moved) {
      if (state === 'gallery' && d.slot) o.onSelect(d.slot.item.id);
      else if (state === 'focus' && d.slot === focusSlot && focusSlot) focusSlot.kick += 7;          // a tap sets the bottle spinning
      return;
    }
    if (state === 'focus' && focusSlot) {
      const fast = Math.abs(dx) / dt > 0.45 && Math.abs(dx) > 36;
      if ((Math.abs(dx) > 70 || fast) && Math.abs(dx) > Math.abs(dy)) { focusSlot.dragX = 0; o.onSwipe(dx < 0 ? 1 : -1); } else focusSlot.dragX = 0;   // too short: springs back
    }
    dirty = true;
  };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  root.addEventListener('pointerleave', () => { if (!drag && hoverId) { hoverId = null; view.classList.remove('point'); o.onHover(null); dirty = true; } });

  let wheelAcc = 0, wheelAt = 0, cool = 0;
  root.addEventListener('wheel', (e) => {
    if (state !== 'focus') return;
    const dx = e.deltaX * (e.deltaMode === 1 ? 16 : 1), dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
    if (Math.abs(dx) < 1 || Math.abs(dx) < Math.abs(dy) * 1.1) return;
    if (document.documentElement.classList.contains('dlg')) return;
    e.preventDefault();
    const t = now(); if (t < cool) return;
    if (t - wheelAt > 380) wheelAcc = 0;
    wheelAt = t; wheelAcc += dx;
    if (Math.abs(wheelAcc) > 80) { o.onSwipe(wheelAcc > 0 ? 1 : -1); wheelAcc = 0; cool = t + 650; }
  }, { passive: false });

  /* ---------- frame ---------- */
  let slow = 0, frames = 0;
  const tags: TagPos[] = slots.map((s) => ({ id: s.item.id, x: 0, y: 0, on: false, hover: false }));
  let lastMoving = true, lastDraw = 0;
  function frame() {
    if (disposed || !active) return;
    const t = now();
    // floating in the gallery with nothing happening: 30 frames a second is plenty and halves the work (full speed for anything moving or hovered)
    if (!lastMoving && !o.still && state === 'gallery' && hoverId === null && t - lastDraw < 28) return;
    const dt = Math.min(0.05, (t - lastT) / 1000); lastT = t; time += dt;
    if (!o.still && go && lastMoving && ++frames > 40) { slow = lerp(slow, dt, 0.06); if (slow > 0.03 && pr > 1) { pr = Math.max(1, pr - 0.25); renderer.setPixelRatio(pr); layout(); slow = 0.02; } }
    rim.color.lerp(rimTarget, 1 - Math.exp(-3 * dt));
    let moving = false;
    slots.forEach((s, k) => {
      if (s.mode === 'off' && !s.anim) { s.group.visible = false; return; }
      const a = s.anim;
      if (a) {
        moving = true;
        const p = clamp((t - a.t0) / a.dur);
        const e = t < a.t0 ? 0 : a.ease(p);
        s.pose = { x: lerp(a.from.x, a.to.x, e), y: lerp(a.from.y, a.to.y, e), s: lerp(a.from.s, a.to.s, e), rz: lerp(a.from.rz, a.to.rz, e), ry: lerp(a.from.ry, a.to.ry, e) };
        if (p >= 1) { s.pose = { ...a.to }; s.anim = null; if (a.end === 'off') { s.mode = 'off'; s.group.visible = false; } else s.mode = a.end; if (a.end === 'home') s.fw = 0; }
      } else if (s.mode === 'home') {
        s.fw = Math.min(1, s.fw + dt * 0.9);
        const w = o.still ? 0 : s.fw;
        s.pose.x = s.home.x + Math.sin(time * 0.45 + s.phase) * s.home.s * 0.07 * w;
        s.pose.y = s.home.y + Math.sin(time * 0.7 + s.phase2) * s.home.s * 0.06 * w;
        s.pose.s = s.home.s * wf(s); s.pose.rz = Math.sin(time * 0.4 + s.phase) * 0.05 * w;
        if (!o.still) s.pose.ry += s.spin * dt;
      } else if (s.mode === 'focus') {
        const f = fpose(s);
        s.pose.x = f.x; s.pose.y = f.y + (o.still ? 0 : Math.sin(time * 1.1) * f.s * 0.009); s.pose.s = f.s; s.pose.rz = 0;
        if (!o.still) { s.pose.ry += (0.28 + s.kick) * dt; s.kick = damp(s.kick, 0, 1.7, dt); }
      }
      // pointer effects (hover grow, lean, finger-follow)
      s.hoverT = hoverId === s.item.id && state === 'gallery' ? 1 : 0; s.hover = damp(s.hover, s.hoverT, 10, dt);
      if (s.mode !== 'focus') { s.tiltX = damp(s.tiltX, 0, 6, dt); s.tiltY = damp(s.tiltY, 0, 6, dt); }
      const dragTarget = s.mode === 'focus' ? s.dragX : 0;
      const shownX = s.pose.x + (s.mode === 'focus' && !a ? dragCur(s, dragTarget, dt) : 0);
      const sc = Math.max(1, s.pose.s * (1 + s.hover * 0.09));
      s.group.position.set(shownX - W / 2, H / 2 - s.pose.y, (s.mode === 'focus' ? 60 : ((k % 3) - 1) * 30));
      s.group.scale.setScalar(sc);
      s.group.rotation.set(s.tiltX, s.pose.ry + s.tiltY + (s.mode === 'focus' ? s.dragX * 0.004 : 0), s.pose.rz + (s.mode === 'focus' ? s.dragX * 0.0007 : 0), 'YXZ');
      (s.glow.material as THREE.SpriteMaterial).opacity = (s.mode === 'focus' ? 0.62 : 0.34 + s.hover * 0.3);
      if (s.mode === 'focus' && !a) moving = true;
    });
    petals?.update(dt, o.still);
    if (o.onFrame) {
      slots.forEach((s, k) => { const g = tags[k]; g.x = s.pose.x; g.y = s.pose.y + s.pose.s * (0.56 + s.hover * 0.05); g.on = s.mode === 'home' && !s.anim && s.fw > 0.6 && state === 'gallery'; g.hover = s.hover > 0.5; });
      o.onFrame(tags);
    }
    lastMoving = moving; lastDraw = t;
    if (o.still && !dirty && !moving) return;
    dirty = !!(petals || moving);
    renderer.render(scene, camera);
  }
  const drags = new WeakMap<Slot, number>();
  function dragCur(s: Slot, target: number, dt: number) { const c = damp(drags.get(s) ?? 0, target, target === 0 ? 9 : 40, dt); drags.set(s, c); return c; }

  const ro = new ResizeObserver(() => layout());
  ro.observe(o.host);
  root.querySelectorAll('[data-zone-g], [data-zone-f], .hero-copy, .dock').forEach((el) => ro.observe(el));
  o.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); o.onLost(); });
  layout(); if (active) renderer.setAnimationLoop(frame);

  return {
    reveal, adopt, setList, select, goto, close,
    hover(id) { hoverId = id; dirty = true; },
    setMood(m) { rimTarget.set(m.glow); dirty = true; },
    setActive(on) { if (on === active) return; active = on; if (on) { lastT = now(); renderer.setAnimationLoop(frame); dirty = true; } else renderer.setAnimationLoop(null); },
    resize: layout,
    dispose() { disposed = true; renderer.setAnimationLoop(null); ro.disconnect(); petals?.dispose(); glowTex.dispose(); renderer.dispose(); },
  };
}
