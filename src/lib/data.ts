// Build-time data (Astro frontmatter). The browser gets a trimmed copy as JSON in #site-data.
import site from '../data/site.json';
import catalogue from '../data/products.json';
import faq from '../data/faq.json';
import credits from '../data/credits.json';

export { site, catalogue, faq, credits };
export const categories = catalogue.categories;
export const sizes = catalogue.sizes;
export const items = catalogue.items;

const nf = new Intl.NumberFormat(site.locale, { style: 'currency', currency: site.currency, maximumFractionDigits: 0 });
export const money = (n: number) => nf.format(n);
export const minPrice = (it: { prices: Record<string, number> }) => Math.min(...Object.values(it.prices));
export const waLink = (text?: string) => `https://wa.me/${site.contact.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
export const catLabel = (id: string) => categories.find((c) => c.id === id)?.label ?? '';
export const noteLine = (it: (typeof items)[number]) => [it.notes.top[0], it.notes.heart[0], it.notes.base[0]].join(' · ');

/** CSS custom properties for the palette, set on <html> */
export const cssVars = Object.entries(site.palette).map(([k, v]) => `--${k}:${v}`).join(';');

/** what the browser scripts need, and nothing more */
export const clientData = {
  business: site.business, locale: site.locale, currency: site.currency, whatsapp: site.contact.whatsapp,
  moods: site.moods, checkout: site.checkout, custom: site.custom, leads: site.leads, intro: site.intro,
  categories, sizes, defaultSize: catalogue.defaultSize, items,
};
