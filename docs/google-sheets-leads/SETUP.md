# Google Sheets leads setup (about 10 minutes, done once)

Orders, custom orders, "something went wrong" reports and sign-ups are saved to a Google Sheet. The owner also gets an email and a PDF for each order. Nothing here is needed for the site to run: with `leads.url` empty the site works in preview mode and sends nothing.

1. Create a new Google Sheet (name it "ScentsByRhem leads"). Open **Extensions > Apps Script**.
2. Delete the sample code and paste in `Code.gs` from this folder.
3. At the top, set `TOKEN` (a long random phrase) and `OWNER_EMAIL`.
4. Run `testEmail` once from the editor and approve the permissions (Sheets, Drive, Mail). Check the email arrives.
5. Run `setup` once. It creates the four tabs (Orders, Custom orders, Problems, Subscribers) and schedules the 8pm Lagos daily summary. Check the alarm-clock icon (Triggers) in the left bar for `dailySummary`. (Without `setup`, the tabs only appear when the first order arrives, and `installTrigger` alone shows nothing on screen.)
6. **Deploy > New deployment > Web app.** Execute as: Me. Who has access: Anyone. Copy the `/exec` URL.
7. In `src/data/site.json` set:
   ```json
   "leads": { "url": "<the /exec URL>", "token": "<the same TOKEN>", "logOrders": true }
   ```
8. Rebuild and deploy. Place a test order and check the row appears.

Notes
- The token only keeps random posts out; it is visible in the page source. Do not reuse it elsewhere.
- Editing `Code.gs` later needs **Deploy > Manage deployments > Edit > New version**.
- A PDF cannot be attached inside WhatsApp from a website. The PDF is saved in Drive (link in the Sheet) and emailed to the owner.
- Untested against real Google services in this build: do steps 4 to 8 before going live.
- Test the Code.gs logic offline with `node test/leads.test.mjs`.
