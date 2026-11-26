// Page chrome: smooth in-page links (no "#section" left in the address), the header turning solid, reveal-on-scroll.
import { reduced } from './data';

export function initNav() {
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const behavior = (): ScrollBehavior => (reduced() ? 'auto' : 'smooth');
  const go = (hash: string) => { const t = hash.length > 1 ? document.getElementById(decodeURIComponent(hash.slice(1))) : null; if (!t) return false; t.scrollIntoView({ behavior: behavior(), block: 'start' }); return true; };
  document.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href^="#"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    if (go(a.getAttribute('href')!)) { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); }
  });
  if (location.hash) { const h = location.hash; history.replaceState(null, '', location.pathname + location.search); requestAnimationFrame(() => go(h)); }

  const top = document.getElementById('top');
  let queued = false;
  const onScroll = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; top?.classList.toggle('solid', scrollY > 24); }); };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  const els = [...document.querySelectorAll<HTMLElement>('.rv')];
  if (!('IntersectionObserver' in window) || document.documentElement.classList.contains('still-mode')) { els.forEach((e) => e.classList.add('in')); return; }
  const io = new IntersectionObserver((entries) => { for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } }, { rootMargin: '0px 0px -8% 0px' });
  els.forEach((e) => io.observe(e));
}
