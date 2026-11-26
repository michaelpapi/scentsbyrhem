// After WhatsApp. Pressing Send keeps the order (or custom order) "pending" on the phone for 12 hours and opens WhatsApp.
// When the person comes back, a dialog asks "Did your order go through?". Yes: log it, clear the bag, thank them.
// No: ask what happened, log it as a problem, then keep or clear the bag. Esc cannot skip it.
import { D, lockSheet, openSheet, wireSheet, closeAll } from './data';
import { post, type Lead } from './leads';

export type Pending = { kind: 'order' | 'custom'; ref: string; at: number; lead: Lead; summary: string };
const KEY = D.checkout.pendingKey;
const hours = D.checkout.pendingHours;

export function setPending(p: Pending) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode: the dialog just will not appear */ } left = false; }
export function getPending(): Pending | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null') as Pending | null;
    if (!p || !p.ref || Date.now() - p.at > hours * 3_600_000) { if (p) localStorage.removeItem(KEY); return null; }
    return p;
  } catch { return null; }
}
export function clearPending() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }

type Hooks = { clearBag: () => void; afterThanks: () => void };
let hooks: Hooks = { clearBag() {}, afterThanks() {} };
let left = false; // the person has gone away (to WhatsApp) since pressing Send

export function initPending(h: Hooks) {
  hooks = h;
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
  const cf = $<HTMLDialogElement>('confirm-dialog'), is = $<HTMLDialogElement>('issue-dialog'), th = $<HTMLDialogElement>('thanks-dialog');
  if (!cf || !is || !th) return;
  [cf, is].forEach(lockSheet); wireSheet(th);

  const ask = () => {
    const p = getPending();
    if (!p || cf.open || is.open) return;
    closeAll();
    cf.querySelector<HTMLElement>('[data-ref]')!.textContent = p.ref;
    cf.querySelector<HTMLElement>('[data-cf-title]')!.textContent = p.kind === 'order' ? 'Did your order go through?' : 'Did your request go through?';
    cf.querySelector<HTMLElement>('[data-cf-text]')!.textContent = 'You were taken to WhatsApp. Did the message send?';
    openSheet(cf);
  };

  cf.querySelector('[data-yes]')!.addEventListener('click', async () => {
    const p = getPending(); cf.close();
    if (!p) return;
    if (p.kind === 'order' ? D.leads.logOrders : true) post({ ...p.lead, ref: p.ref });
    clearPending();
    if (p.kind === 'order') hooks.clearBag();
    th.querySelector<HTMLElement>('[data-ref]')!.textContent = p.ref;
    th.querySelector<HTMLElement>('[data-th-title]')!.textContent = 'Thank you!';
    th.querySelector<HTMLElement>('[data-th-text]')!.textContent = p.kind === 'order' ? 'We have your order and will reply on WhatsApp soon.' : 'We have your request and will reply on WhatsApp with availability and price.';
    openSheet(th);
    window.scrollTo({ top: 0 });
  });
  th.querySelector('[data-done]')!.addEventListener('click', () => { th.close(); hooks.afterThanks(); });

  cf.querySelector('[data-no]')!.addEventListener('click', () => { cf.close(); openSheet(is); });
  cf.querySelector('[data-cancel]')!.addEventListener('click', () => { cf.close(); clearPending(); hooks.clearBag(); });

  const sendIssue = (clear: boolean) => {
    const p = getPending();
    const f = document.getElementById('issue-form') as HTMLFormElement;
    const v = new FormData(f);
    post({ type: 'issue', ref: p?.ref ?? '', about: p?.kind ?? '', reason: String(v.get('reason') ?? ''), note: String(v.get('note') ?? '').slice(0, 200), contact: String(v.get('contact') ?? '').slice(0, 80), summary: p?.summary ?? '' });
    is.close(); clearPending(); f.reset();
    if (clear) hooks.clearBag();
  };
  is.querySelector('[data-keep]')!.addEventListener('click', () => sendIssue(false));
  is.querySelector('[data-clear-send]')!.addEventListener('click', () => sendIssue(true));

  // the moments a person comes back: tab visible again, window focused, back/forward cache, or a plain reload
  document.addEventListener('visibilitychange', () => { if (document.hidden) { if (getPending()) left = true; } else if (left) ask(); });
  window.addEventListener('focus', () => { if (left) ask(); });
  window.addEventListener('pageshow', (e) => { if (e.persisted && getPending()) ask(); });
  if (getPending()) addEventListener('load', () => setTimeout(ask, 600), { once: true });
}
