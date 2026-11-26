// The contract for everything an owner edits. A bad value fails the build (npm run validate) with the exact path.
import { z } from 'astro/zod';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'must be a 6-digit hex colour like #7A1633');
const id = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'lower-case letters, digits and single dashes only');

export const siteSchema = z.object({
  slug: id,
  url: z.string().regex(/^https:\/\/[a-z0-9.-]+$/, 'the live address, like https://scentsbyrhem.netlify.app (https, no trailing slash, no path)'),
  business: z.object({
    name: z.string().min(2).max(40),
    display: z.string().min(2).max(40),
    tagline: z.string().min(3).max(80),
    description: z.string().min(40).max(200),
  }),
  hero: z.object({ kicker: z.string().min(3).max(32), title: z.string().min(6).max(60), text: z.string().min(10).max(120) }),
  locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/),
  currency: z.string().length(3),
  contact: z.object({
    whatsapp: z.string().regex(/^234\d{10}$/, 'Nigerian WhatsApp number: 234 followed by 10 digits, no +, no spaces (13 digits in total)'),
    phoneDisplay: z.string().min(8).max(24),
  }),
  palette: z.object({ deep: hex, wine: hex, burgundy: hex, rose: hex, pink: hex, blush: hex, ink: hex }),
  moods: z.record(id, z.object({ a: hex, b: hex, glow: hex })),
  checkout: z.object({
    refPrefix: z.string().regex(/^[A-Z]{2,5}$/),
    cartKey: z.string().min(3), pendingKey: z.string().min(3),
    pendingHours: z.number().int().min(1).max(72),
    maxPerLine: z.number().int().min(1).max(50),
    fulfilment: z.array(z.enum(['pickup', 'delivery'])).min(1),
  }),
  custom: z.object({
    leadDays: z.number().int().min(0).max(60),
    maxDays: z.number().int().min(7).max(365),
    kinds: z.array(z.object({ id, label: z.string().min(3).max(60) })).min(1).max(6),
    sizes: z.array(z.string().min(2)).min(1),
    budgets: z.array(z.string().min(2)).min(1),
  }),
  leads: z.object({
    url: z.union([z.literal(''), z.string().url().startsWith('https://script.google.com/')]),
    token: z.string().min(8),
    logOrders: z.boolean(),
  }),
  intro: z.object({ enabled: z.boolean(), minMs: z.number().int().min(0).max(6000), maxMs: z.number().int().min(1000).max(9000) }),
});

const notes = z.array(z.string().min(2).max(30)).min(1).max(4);
export const productsSchema = z.object({
  categories: z.array(z.object({ id, label: z.string().min(2).max(24), blurb: z.string().min(8).max(90) })).min(1).max(8),
  sizes: z.array(z.object({ ml: z.number().int().positive(), key: z.string().regex(/^\d+$/) })).min(1).max(4),
  defaultSize: z.string().regex(/^\d+$/),
  items: z.array(z.object({
    id, name: z.string().min(2).max(32), category: id, model: id, mood: id,
    badge: z.enum(['new', 'bestseller']).optional(),
    line: z.string().min(8).max(70),
    description: z.string().min(20).max(220),
    notes: z.object({ top: notes, heart: notes, base: notes }),
    prices: z.record(z.string().regex(/^\d+$/), z.number().int().min(500).max(5_000_000)),
    rot: z.tuple([z.number(), z.number(), z.number()]).optional(),
    scale: z.number().min(0.4).max(2).optional(),
  })).min(1).max(40),
});

export const faqSchema = z.array(z.object({ q: z.string().min(6).max(120), a: z.string().min(10).max(500), confirm: z.boolean().optional() })).min(1).max(12);
export const creditsSchema = z.array(z.object({
  model: id, title: z.string().min(2), author: z.string().min(2), authorUrl: z.string(), license: z.string().min(3), source: z.string().url(),
}));

export type Site = z.infer<typeof siteSchema>;
export type Products = z.infer<typeof productsSchema>;
export type Faq = z.infer<typeof faqSchema>;
export type Credits = z.infer<typeof creditsSchema>;
