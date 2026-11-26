// The "something opened" transition: a bloom of the fragrance's own colour grows out of the tap, the sheet opens under it,
// then the bloom melts away. transform + opacity only, so it stays on the compositor.
import type { Mood } from './data';
import { reduced } from './data';

const OUT = 'cubic-bezier(.23, 1, .32, 1)';

export async function bloom(x: number, y: number, m: Mood, whenCovered: () => void) {
  if (reduced()) { whenCovered(); return; }
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) * 1.05;
  const el = document.createElement('div');
  el.className = 'bloom';
  el.style.width = el.style.height = `${r * 2}px`;
  el.style.setProperty('--a', m.a); el.style.setProperty('--b', m.b); el.style.setProperty('--glow', m.glow);
  const at = `translate(${x - r}px, ${y - r}px)`;
  document.body.append(el);
  const grow = el.animate([{ transform: `${at} scale(0.03)`, opacity: 0.95 }, { transform: `${at} scale(1)`, opacity: 1 }], { duration: 560, easing: OUT, fill: 'forwards' });
  setTimeout(whenCovered, 400);
  try { await grow.finished; } catch { /* cancelled */ }
  const out = el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
  try { await out.finished; } catch { /* cancelled */ }
  el.remove();
}
