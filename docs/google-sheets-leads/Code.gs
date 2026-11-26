/**
 * ScentsByRhem leads: Google Apps Script web app, bound to a Google Sheet.
 * The website posts orders, custom orders, problem reports and sign-ups here (see SETUP.md).
 * Tabs are created automatically: Orders, Custom orders, Problems, Subscribers.
 */
var CONFIG = {
  TOKEN: 'change-me-before-deploying',      // must equal leads.token in src/data/site.json
  OWNER_EMAIL: '',                          // the owner's email: new orders, custom orders and the daily summary go here
  BUSINESS: 'ScentsByRhem',
  TIMEZONE: 'Africa/Lagos',
  SUMMARY_HOUR: 20,                         // daily summary at 8pm Lagos time
  PDF_FOLDER: 'ScentsByRhem documents'      // Drive folder for order PDFs
};

var TABS = {
  order: ['Received', 'Ref', 'Name', 'Receive', 'Address', 'Items', 'Total (NGN)', 'Note', 'PDF'],
  custom: ['Received', 'Ref', 'Name', 'Request', 'Brand / fragrance', 'Size', 'Budget', 'Needed by', 'Receive', 'Address', 'Details', 'PDF'],
  issue: ['Received', 'Ref', 'About', 'What happened', 'Note', 'Contact', 'Summary'],
  subscribe: ['Received', 'Contact']
};
var TAB_NAMES = { order: 'Orders', custom: 'Custom orders', issue: 'Problems', subscribe: 'Subscribers' };

/** a cell that starts with = + - @ would run as a formula in Sheets: make it plain text */
function safe_(v) {
  var s = String(v === undefined || v === null ? '' : v).slice(0, 1500);
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function sheet_(type) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), name = TAB_NAMES[type], sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(TABS[type]);
    sh.getRange(1, 1, 1, TABS[type].length).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad json' }); }
  if (!body || body.token !== CONFIG.TOKEN) return json_({ ok: false, error: 'forbidden' });
  var type = body.type;
  if (!TAB_NAMES[type]) return json_({ ok: false, error: 'unknown type' });

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var now = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd HH:mm');
    var s = safe_, row, pdf = '';
    if (type === 'order') {
      pdf = makePdf_('Order ' + s(body.ref), orderHtml_(body));
      row = [now, s(body.ref), s(body.name), s(body.fulfil), s(body.address), s(body.items), Number(body.total) || 0, s(body.note), pdf];
    } else if (type === 'custom') {
      pdf = makePdf_('Custom order ' + s(body.ref), customHtml_(body));
      row = [now, s(body.ref), s(body.name), s(body.request), s(body.brand), s(body.size), s(body.budget), s(body.needBy), s(body.fulfil), s(body.address), s(body.details), pdf];
    } else if (type === 'issue') {
      row = [now, s(body.ref), s(body.about), s(body.reason), s(body.note), s(body.contact), s(body.summary)];
    } else {
      row = [now, s(body.contact)];
    }
    sheet_(type).appendRow(row);
    if (CONFIG.OWNER_EMAIL && type !== 'subscribe') notify_(type, body, pdf);
  } finally { lock.releaseLock(); }
  return json_({ ok: true });
}

function doGet() { return json_({ ok: true, service: CONFIG.BUSINESS + ' leads' }); }

/* ---------- documents ---------- */
function esc_(v) { return String(v === undefined || v === null ? '' : v).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function page_(title, inner) {
  return '<html><body style="font-family:Georgia,serif;color:#3B0A1B;padding:28px"><h1 style="color:#7A1633;font-weight:normal">' + esc_(CONFIG.BUSINESS) + '</h1><h2>' + esc_(title) + '</h2>' + inner + '</body></html>';
}
function rows_(pairs) { return '<table cellpadding="6" style="border-collapse:collapse">' + pairs.map(function (p) { return '<tr><td style="color:#7A1633"><b>' + esc_(p[0]) + '</b></td><td>' + esc_(p[1]) + '</td></tr>'; }).join('') + '</table>'; }
function orderHtml_(b) {
  return page_('Order ' + b.ref, rows_([['Customer', b.name], ['Receive', b.fulfil], ['Address', b.address], ['Items', b.items], ['Total', 'NGN ' + b.total], ['Note', b.note]]));
}
function customHtml_(b) {
  return page_('Custom order ' + b.ref, rows_([['Customer', b.name], ['Request', b.request], ['Brand / fragrance', b.brand], ['Size', b.size], ['Budget', b.budget], ['Needed by', b.needBy], ['Receive', b.fulfil], ['Address', b.address], ['Details', b.details]]));
}
function makePdf_(title, html) {
  try {
    var it = DriveApp.getFoldersByName(CONFIG.PDF_FOLDER), folder = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.PDF_FOLDER);
    var blob = HtmlService.createHtmlOutput(html).getBlob().getAs('application/pdf').setName(title + '.pdf');
    return folder.createFile(blob).getUrl();
  } catch (err) { return ''; }
}

function notify_(type, b, pdf) {
  var subject = (type === 'order' ? 'New order ' : type === 'custom' ? 'New custom order ' : 'Order problem ') + (b.ref || '');
  var text = (b.message || b.summary || '') + (pdf ? '\n\nPDF: ' + pdf : '') + (type === 'issue' ? '\n\nWhat happened: ' + b.reason + (b.note ? ' (' + b.note + ')' : '') + '\nContact: ' + (b.contact || 'none given') : '');
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, CONFIG.BUSINESS + ': ' + subject, text);
}

/* ---------- daily summary ---------- */
function dailySummary() {
  if (!CONFIG.OWNER_EMAIL) return;
  var ss = SpreadsheetApp.getActiveSpreadsheet(), today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd'), out = [];
  ['order', 'custom', 'issue', 'subscribe'].forEach(function (t) {
    var sh = ss.getSheetByName(TAB_NAMES[t]); if (!sh) return;
    var rows = sh.getDataRange().getValues().slice(1).filter(function (r) { return String(r[0]).indexOf(today) === 0; });
    var total = t === 'order' ? rows.reduce(function (a, r) { return a + (Number(r[6]) || 0); }, 0) : 0;
    out.push(TAB_NAMES[t] + ': ' + rows.length + (t === 'order' && rows.length ? ' (NGN ' + total + ')' : ''));
  });
  MailApp.sendEmail(CONFIG.OWNER_EMAIL, CONFIG.BUSINESS + ' summary for ' + today, out.join('\n'));
}
function installTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dailySummary') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dailySummary').timeBased().atHour(CONFIG.SUMMARY_HOUR).everyDays(1).inTimezone(CONFIG.TIMEZONE).create();
}
/** run once from the editor to approve permissions and check the email works */
function testEmail() { MailApp.sendEmail(CONFIG.OWNER_EMAIL, CONFIG.BUSINESS + ' test', 'If you can read this, order emails will reach you.'); }
/** run once from the editor: creates the four tabs now (so you can see them) and schedules the 8pm daily summary */
function setup() {
  Object.keys(TAB_NAMES).forEach(function (t) { sheet_(t); });
  installTrigger();
  SpreadsheetApp.getActiveSpreadsheet().toast('Tabs created. Daily summary scheduled for ' + CONFIG.SUMMARY_HOUR + ':00.', CONFIG.BUSINESS, 8);
}
