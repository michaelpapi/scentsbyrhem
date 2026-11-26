// Sends a lead (order, custom order, problem, subscriber) to the owner's Google Sheet through the Apps Script web app.
// With no leads.url in site.json this is "preview mode": nothing leaves the phone, and the payload is kept in localStorage for testing.
import { D } from './data';

export type Lead = { type: 'order' | 'custom' | 'issue' | 'subscribe'; [k: string]: unknown };
const PREVIEW_KEY = 'sbr.leads.preview';

export async function post(lead: Lead): Promise<'sent' | 'preview' | 'failed'> {
  const body = { token: D.leads.token, at: new Date().toISOString(), site: D.business.name, ...lead };
  if (!D.leads.url) {
    try { const all = JSON.parse(localStorage.getItem(PREVIEW_KEY) || '[]'); all.push(body); localStorage.setItem(PREVIEW_KEY, JSON.stringify(all.slice(-20))); } catch { /* storage blocked */ }
    console.info('[leads preview]', body);
    return 'preview';
  }
  try {
    // text/plain keeps this a "simple" request, so the browser sends it without a CORS pre-flight (Apps Script does not answer one)
    await fetch(D.leads.url, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), keepalive: true });
    return 'sent';
  } catch { return 'failed'; }
}
