// Runs Code.gs against mock Google services: token check, tab creation, formula-injection guard, email, summary.
import fs from 'node:fs'; import vm from 'node:vm'; import assert from 'node:assert/strict';
const code = fs.readFileSync(new URL('../docs/google-sheets-leads/Code.gs', import.meta.url), 'utf8');

function world() {
  const tabs = {}, mails = [], files = [], triggers = [];
  const sheet = (n) => (tabs[n] ??= { rows: [], appendRow(r) { this.rows.push(r); }, getRange: () => ({ setFontWeight() {} }), setFrozenRows() {}, getDataRange() { return { getValues: () => this.rows }; } });
  const ctx = {
    console, Date, JSON, Number, String, Object, Array,
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: (n) => tabs[n] ?? null, insertSheet: (n) => sheet(n) }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: (t) => ({ t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: (d, tz, f) => { const p = (n) => String(n).padStart(2, '0'); const s = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; return f.includes('HH') ? `${s} ${p(d.getHours())}:${p(d.getMinutes())}` : s; } },
    MailApp: { sendEmail: (to, subject, text) => mails.push({ to, subject, text }) },
    DriveApp: { getFoldersByName: () => ({ hasNext: () => false }), createFolder: () => ({ createFile: (b) => (files.push(b.name), { getUrl: () => 'https://drive/x/' + files.length }) }) },
    HtmlService: { createHtmlOutput: () => ({ getBlob: () => ({ getAs: () => ({ setName(n) { return { name: n }; } }) }) }) },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: (fn) => ({ timeBased() { return this; }, atHour() { return this; }, everyDays() { return this; }, inTimezone() { return this; }, create() { triggers.push(fn); } }) },
  };
  vm.createContext(ctx); vm.runInContext(code, ctx);
  vm.runInContext("CONFIG.OWNER_EMAIL='owner@example.com'; CONFIG.TOKEN='tok';", ctx);
  const post = (o) => JSON.parse(ctx.doPost({ postData: { contents: typeof o === 'string' ? o : JSON.stringify(o) } }).t);
  return { ctx, tabs, mails, files, triggers, post };
}

const w = world();
assert.deepEqual(w.post('not json'), { ok: false, error: 'bad json' });
assert.equal(w.post({ token: 'nope', type: 'order' }).error, 'forbidden');
assert.equal(w.post({ token: 'tok', type: 'weird' }).error, 'unknown type');
assert.equal(Object.keys(w.tabs).length, 0, 'rejected posts create nothing');

assert.equal(w.post({ token: 'tok', type: 'order', ref: 'SBR-ORD-1', name: '=HYPERLINK("http://x")', fulfil: 'delivery', address: '1 Road', items: 'A 50ml x1', total: 28000, message: 'hello' }).ok, true);
const o = w.tabs['Orders'].rows;
assert.equal(o.length, 2, 'header + one row');
assert.equal(o[1][2], `'=HYPERLINK("http://x")`, 'formula neutralised');
assert.equal(o[1][6], 28000);
assert.match(o[1][8], /^https:\/\/drive/, 'pdf link saved');
assert.equal(w.mails.length, 1); assert.match(w.mails[0].subject, /New order SBR-ORD-1/);

assert.equal(w.post({ token: 'tok', type: 'custom', ref: 'SBR-CUS-1', name: 'Ada', request: 'Other brand', brand: 'Baccarat', size: '50 ml', budget: 'x', needBy: '2026-12-20', fulfil: 'pickup' }).ok, true);
assert.equal(w.tabs['Custom orders'].rows[1][4], 'Baccarat');
assert.equal(w.post({ token: 'tok', type: 'issue', ref: 'SBR-ORD-2', about: 'order', reason: 'no-send', contact: '0803' }).ok, true);
assert.match(w.mails.at(-1).subject, /Order problem/);
const before = w.mails.length;
assert.equal(w.post({ token: 'tok', type: 'subscribe', contact: 'a@b.co' }).ok, true);
assert.equal(w.mails.length, before, 'subscribers do not email the owner');
assert.equal(w.tabs['Subscribers'].rows.length, 2);

w.ctx.dailySummary();
assert.match(w.mails.at(-1).text, /Orders: 1 \(NGN 28000\)/);
w.ctx.installTrigger(); assert.deepEqual(w.triggers, ['dailySummary']);

// no owner email configured: still saves, never throws
const w2 = world(); w2.ctx.CONFIG.OWNER_EMAIL = '';
assert.equal(w2.post({ token: 'tok', type: 'order', ref: 'R', name: 'n', total: 1 }).ok, true);
assert.equal(w2.mails.length, 0);
console.log('leads tests ok');
