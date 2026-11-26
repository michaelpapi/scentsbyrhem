// Custom order: ask for a perfume that is not in the collection, or a blend made around the person. Replaces "Book an appointment".
import { D, wa, wireSheet, openSheet } from './data';
import { makeRef, customMessage, dateWindow, validate } from '../lib/messages';
import { setPending } from './pending';

export function initCustom() {
  const dlg = document.getElementById('custom-dialog') as HTMLDialogElement | null;
  if (!dlg) return;
  wireSheet(dlg);
  const form = dlg.querySelector<HTMLFormElement>('#custom-form')!, send = dlg.querySelector<HTMLAnchorElement>('[data-send]')!;
  const addr = dlg.querySelector<HTMLElement>('[data-addr]')!, brandLabel = dlg.querySelector<HTMLElement>('[data-brand-label]')!;
  const f = (n: string) => form.elements.namedItem(n) as HTMLInputElement;
  const radio = (n: string) => form.querySelector<HTMLInputElement>(`input[name=${n}]:checked`)?.value ?? '';
  let ref = '';
  const kindLabel = () => D.custom.kinds.find((k) => k.id === radio('kind'))?.label ?? '';

  const win = dateWindow(new Date(), D.custom.leadDays, D.custom.maxDays);
  f('date').min = win.min; f('date').max = win.max;

  const dateText = () => { const v = f('date').value; if (!v) return ''; const d = new Date(`${v}T12:00:00`); return d.toLocaleDateString(D.locale, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); };
  const input = () => ({
    business: D.business.name, ref, kindLabel: kindLabel(), brand: f('brand').value, details: (form.elements.namedItem('details') as HTMLTextAreaElement).value,
    size: radio('size'), budget: (form.elements.namedItem('budget') as HTMLSelectElement).value, needBy: dateText(), name: f('name').value,
    fulfil: radio('fulfil') as 'pickup' | 'delivery', address: (form.elements.namedItem('address') as HTMLTextAreaElement).value,
  });
  const update = () => {
    const kind = radio('kind');
    brandLabel.textContent = kind === 'other-brand' ? 'Brand and fragrance' : kind === 'gift' ? 'What is it for? (optional)' : 'Scents you already love (optional)';
    addr.hidden = radio('fulfil') !== 'delivery';
    send.href = wa(customMessage(input()));
  };
  const showErr = (errs: Record<string, string>) => {
    form.querySelectorAll<HTMLElement>('[data-err]').forEach((e) => { const m = errs[e.dataset.err!] ?? ''; e.textContent = m; (e.closest('.field') as HTMLElement | null)?.setAttribute('data-bad', String(!!m)); });
    const first = Object.keys(errs)[0]; if (first) (form.elements.namedItem(first) as HTMLElement).focus();
  };
  form.addEventListener('input', update); form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());

  send.addEventListener('click', (e) => {
    const i = input();
    const errs = validate({ name: i.name, fulfil: i.fulfil, address: i.address, brand: i.brand, needBrand: radio('kind') === 'other-brand', date: f('date').value, min: win.min, max: win.max });
    showErr(errs);
    if (Object.keys(errs).length) { e.preventDefault(); return; }
    update();
    setPending({
      kind: 'custom', ref, at: Date.now(), summary: `${i.kindLabel}${i.brand.trim() ? `: ${i.brand.trim()}` : ''}`,
      lead: { type: 'custom', ref, name: i.name.trim(), request: i.kindLabel, brand: i.brand.trim(), details: i.details.trim(), size: i.size, budget: i.budget, needBy: f('date').value, fulfil: i.fulfil, address: i.fulfil === 'delivery' ? i.address.trim() : '', message: customMessage(i) },
    });
  });

  const open = () => { ref = makeRef(D.checkout.refPrefix, 'CUS', new Date()); update(); openSheet(dlg); };
  document.addEventListener('click', (e) => { if ((e.target as Element).closest('[data-open-custom]')) { e.preventDefault(); open(); } });
  document.addEventListener('open-custom', open);
}
