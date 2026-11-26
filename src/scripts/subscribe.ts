// "Join the list" in the footer: a WhatsApp number or an email. Goes to the owner's sheet; nothing is sent in preview mode.
import { post } from './leads';

export function initSubscribe() {
  const form = document.getElementById('sub-form') as HTMLFormElement | null;
  if (!form) return;
  const note = form.querySelector<HTMLElement>('[data-sub-note]')!, input = form.elements.namedItem('contact') as HTMLInputElement;
  const base = note.textContent;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = input.value.trim();
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), phone = /^\+?[\d\s-]{10,15}$/.test(v);
    if (!email && !phone) { note.textContent = 'Please enter a WhatsApp number or an email address.'; input.focus(); return; }
    note.textContent = 'Joining…';
    const r = await post({ type: 'subscribe', contact: v });
    note.textContent = r === 'failed' ? 'That did not go through. Please try again.' : 'You are on the list. Thank you!';
    if (r !== 'failed') { input.value = ''; setTimeout(() => { note.textContent = base; }, 6000); }
  });
}
