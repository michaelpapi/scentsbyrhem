// Start-up scene. It waits for the first bottle to be ready (so the reveal never shows an empty stage), but never longer than intro.maxMs.
declare global { interface Window { __intro?: { min: number; max: number; t0: number } } }

let release: () => void = () => {};
const scene = new Promise<void>((r) => { release = r; });
export const sceneReady = () => release();
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, Math.max(0, ms)));

export async function runIntro() {
  const cfg = window.__intro, root = document.documentElement, el = document.getElementById('intro');
  if (!cfg || !el) return;
  const spent = () => Date.now() - cfg.t0;
  await Promise.race([Promise.all([scene, wait(cfg.min - spent())]), wait(cfg.max - spent())]);
  el.classList.add('out');
  setTimeout(() => root.classList.add('ready'), 420);   // the hero starts to rise while the mist is still clearing
  setTimeout(() => { root.classList.remove('intro-on'); el.classList.remove('out'); }, 1100);
}
