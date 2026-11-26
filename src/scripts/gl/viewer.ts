// The live 3D view inside the fragrance sheet: drag to turn, +/- (or pinch/wheel) to zoom, Reset, slow turn when idle.
// One renderer for the whole session. It only draws while the sheet is open.
import * as THREE from 'three';
import type { Item } from '../data';
import { loadModel, setModelMode } from './models';
import { makeEnv } from './env';
import { clamp, damp } from '../ease';
import type { GLMode } from './glmode';

export type Viewer = { show(it: Item): Promise<void>; setActive(on: boolean): void; reset(): void; zoom(dir: 1 | -1): void; resize(): void; dispose(): void };

export function createViewer(canvas: HTMLCanvasElement, host: HTMLElement, mode: Exclude<GLMode, 'off'>, still: boolean, onLost: () => void): Viewer {
  const lite = mode === 'lite';
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, alpha: true, powerPreference: 'high-performance' });
  setModelMode(mode);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.25 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.environment = makeEnv(renderer); scene.environmentIntensity = 1;
  const key = new THREE.DirectionalLight(0xffeef2, 2.2); key.position.set(2.4, 3.2, 3.2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xf4c6d2, 3); rim.position.set(-3, 2, -3); scene.add(rim);
  scene.add(new THREE.AmbientLight(0xffd9e2, 0.3));
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 40);

  const pivot = new THREE.Group(); scene.add(pivot);
  let current: THREE.Object3D | null = null;
  let height = 1, width = 0.6;
  let yaw = 0, pitch = 0.08, zoomT = 1, zoom = 1, yawV = 0;
  let active = false, dirty = true, lastInput = 0, token = 0;
  let lastT = performance.now();
  const delta = () => { const n = performance.now(), d = (n - lastT) / 1000; lastT = n; return d; };

  function fit() {
    const w = Math.max(1, host.clientWidth), h = Math.max(1, host.clientHeight);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    const tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const need = Math.max((height * 1.5) / (2 * tan), (Math.max(width, 0.5) * 1.7) / (2 * tan * camera.aspect));
    camera.userData.base = need;
    camera.updateProjectionMatrix(); dirty = true;
  }
  const place = () => {
    const base = (camera.userData.base as number) || 4;
    const aim = height * 0.38;           // aim a little below the middle so the bottle sits above the zoom controls
    camera.position.set(0, aim + 0.25 * zoom, base / zoom);
    camera.lookAt(0, aim, 0);
  };

  let drag: { id: number; x: number; y: number } | null = null;
  const pts = new Map<number, number>(); let pinch0 = 0, zoom0 = 1;
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, e.clientX);
    if (pts.size === 1) drag = { id: e.pointerId, x: e.clientX, y: e.clientY };
    lastInput = performance.now(); canvas.classList.add('grabbing');
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, e.clientX);
    if (pts.size === 2) {                                   // two fingers: pinch to zoom
      const [a, b] = [...pts.values()]; const d = Math.abs(a - b);
      if (!pinch0) { pinch0 = d; zoom0 = zoomT; } else zoomT = clamp(zoom0 * (d / pinch0), 0.8, 2.2);
      dirty = true; return;
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
    yaw += dx * 0.012; yawV = dx * 0.012 * 60; pitch = clamp(pitch + dy * 0.004, -0.25, 0.5);
    lastInput = performance.now(); dirty = true;
  });
  const up = (e: PointerEvent) => { pts.delete(e.pointerId); if (pts.size < 2) pinch0 = 0; if (!pts.size) { drag = null; canvas.classList.remove('grabbing'); } lastInput = performance.now(); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomT = clamp(zoomT * (e.deltaY < 0 ? 1.1 : 0.9), 0.8, 2.2); dirty = true; }, { passive: false });
  canvas.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === '+' || k === '=') zoomT = clamp(zoomT * 1.2, 0.8, 2.2);
    else if (k === '-' || k === '_') zoomT = clamp(zoomT / 1.2, 0.8, 2.2);
    else if (k === 'ArrowLeft') yaw -= 0.25; else if (k === 'ArrowRight') yaw += 0.25;
    else if (k === '0') api.reset(); else return;
    e.preventDefault(); lastInput = performance.now(); dirty = true;
  });
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); onLost(); });
  new ResizeObserver(fit).observe(host);

  function frame() {
    if (!active) return;
    const dt = Math.min(0.05, delta());
    const idle = performance.now() - lastInput > 2200;
    if (!drag) { yaw += yawV * dt; yawV = damp(yawV, 0, 3.5, dt); if (!still && idle) yaw += 0.5 * dt; }
    zoom = damp(zoom, zoomT, 9, dt);
    pivot.rotation.set(pitch, yaw, 0, 'YXZ');
    place();
    if (still && !dirty && Math.abs(zoom - zoomT) < 0.002) return;
    dirty = false;
    renderer.render(scene, camera);
  }

  const api: Viewer = {
    async show(it) {
      const mine = ++token;
      const l = await loadModel(it);
      if (mine !== token) return;
      if (current) pivot.remove(current);
      current = l.object.clone(true);
      pivot.add(current);
      height = l.height; width = l.width;
      api.reset(); fit();
    },
    setActive(on) {
      if (on === active) return;
      active = on;
      if (on) { fit(); delta(); renderer.setAnimationLoop(frame); dirty = true; } else renderer.setAnimationLoop(null);
    },
    reset() { yaw = 0; yawV = 0; pitch = 0.08; zoomT = 1; lastInput = performance.now(); dirty = true; },
    zoom(dir) { zoomT = clamp(zoomT * (dir > 0 ? 1.2 : 1 / 1.2), 0.8, 2.2); lastInput = performance.now(); dirty = true; },
    resize: fit,
    dispose() { renderer.setAnimationLoop(null); renderer.dispose(); },
  };
  return api;
}
