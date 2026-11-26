// Sharing a fragrance: the link goes to that bottle (/p/<id>/), and the message also carries the shop link.
// Phones open the share sheet (WhatsApp, Instagram, SMS...). Computers copy the message instead.
import { D, byId } from './data';

export const productPath = (id: string) => `/p/${id}/`;
export const productUrl = (id: string) => `${location.origin}${productPath(id)}`;
export const shopUrl = () => `${location.origin}/`;
export const shareText = (id: string) => {
  const it = byId.get(id)!;
  return `${it.name} by ${D.business.display}\n${it.line}\n${productUrl(id)}\n\nSee the whole collection: ${shopUrl()}`;
};

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* insecure page or old browser: fall through */ }
  const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
  document.body.append(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove(); return ok;
}

export type ShareResult = 'shared' | 'copied' | 'cancelled' | 'failed';
export async function shareProduct(id: string): Promise<ShareResult> {
  const it = byId.get(id); if (!it) return 'failed';
  const text = shareText(id);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: `${it.name} | ${D.business.display}`, text }); return 'shared'; }
    catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled'; }
  }
  return (await copy(text)) ? 'copied' : 'failed';
}

/** a Share button: `.lbl` inside it shows the result for a moment */
export function wireShare(btn: HTMLElement, getId: () => string | null, live?: HTMLElement) {
  const lbl = btn.querySelector<HTMLElement>('.lbl') ?? btn, base = lbl.textContent || 'Share';
  let timer = 0;
  btn.addEventListener('click', async () => {
    const id = getId(); if (!id) return;
    const r = await shareProduct(id);
    if (r === 'cancelled') return;
    const msg = r === 'copied' ? 'Link copied ✓' : r === 'shared' ? 'Shared ✓' : 'Copy the link from the address bar';
    lbl.textContent = msg; btn.dataset.done = r === 'failed' ? 'false' : 'true'; if (live) live.textContent = msg;
    clearTimeout(timer); timer = window.setTimeout(() => { lbl.textContent = base; btn.dataset.done = 'false'; if (live) live.textContent = ''; }, 2000);
  });
}
