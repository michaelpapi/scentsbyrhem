# ScentsByRhem: build notes

Astro 7 static site, Netlify. 3D with three.js (code-split, loaded after first paint). `npm run dev`, `npm test`, `npm run build` (validates config first).

## What the owner edits (no code)
- `src/data/products.json`: categories, sizes, the nine fragrances (name, notes, prices per size, badge, mood colour, model).
- `src/data/site.json`: business name, WhatsApp number, palette, checkout and custom-order options, leads (Google Sheet) url/token.
- `src/data/faq.json`, `src/data/credits.json` (3D model credits; shown in the footer; required by the CC-BY licences).
- `npm run validate` checks all of it (contrast, categories, missing models, size prices, WhatsApp format).

## How the pieces work
- **Hero, two states** (`browse.ts`, `gl/shelf.ts`, `#stage[data-state]`): *gallery* shows every bottle floating and slowly turning in its own space, names under them, and a "Sweet fragrances" note where the product name used to be (text lives in `site.json` → `hero`; it changes with the category tab). Tap a bottle (or Tab to the hidden pick buttons and press Enter): the others fall off the screen, the chosen one glides to the front and its theme, name (unveiled line by line), notes, sizes, price, **Add to bag** and **Look closer** (the 3D product sheet) are written in. Swipe left/right, trackpad sideways scroll, arrow keys, the arrows or dots: the current bottle drops and the next is pulled in from the side. **X** (or Esc) sends everything back up from below to float again. In focus the bottle leans toward the pointer and a tap sets it spinning.
- **Zones and layout** (`gl/layout.ts`, tested): the page has two measured elements, `[data-zone-g]` (gallery) and `[data-zone-f]` (focus). `layoutHomes` picks the column count that makes bottles biggest while keeping clear space between them; scene positions are in CSS pixels so the page layout alone decides where bottles go (phones: between headline and tabs; ≥56rem: own area right of the text column). Wide bottles are scaled down in focus so they never leave the screen. Rose petals drift and burst on select/close. Draws only while on screen, with no sheet open and the tab visible; lowers pixel ratio on slow phones.
- **Posters fallback** (`posters.ts`): with no WebGL, data saver or `?still`, the same gallery is made of floating pictures with the same fall / glide / side-in / jump-back transitions (CSS transforms). Reduced-motion users get the same states without movement.
- **Open transition** (`transition.ts`): from **Look closer** (or a catalogue card) a bloom of the fragrance's mood colour grows from the tap (WAAPI, transform and opacity) and the sheet opens under it.
- **Share links** (`share.ts`, `pages/p/[id].astro`, `scripts/og.py`): every fragrance has its own address, `https://scentsbyrhem.netlify.app/p/<id>/` (e.g. `/p/nuit-baroque/`), a real page in the build with its own title, description, canonical address, product schema and a 1200x630 share picture (`public/og/<id>.jpg`), so WhatsApp, iMessage, Instagram DMs and X show the bottle, name and line. Opening the link goes to the hero with that bottle already in front (no start-up scene); swiping to another bottle updates the address bar and tab title, and X returns it to `/`. **Share** (in the focus view and in the product sheet): on phones it opens the native share sheet; on computers it copies the message. The message holds the product link and the shop link. The shop's address is `url` in `site.json` (validated); the picture links use it, while the Share button uses whatever address the page is on, so a future custom domain only needs `url` changed in `site.json` and `scripts/og.py` re-run (it prints the address on each picture). After changing a fragrance's name, line, mood or poster, run `python3 scripts/og.py` to redo its picture. Unknown addresses show a small branded 404 page.
- **Product sheet** (`product.ts`, `gl/viewer.ts`): notes, sizes, drag to turn, pinch or +/- to zoom, Reset.
- **Checkout** (`cart.ts`, `pending.ts`): bag saved on the phone; name + pick up/delivery (+ address); Send opens WhatsApp with a ready message and reference `SBR-ORD-yymmdd-XXXX`. The order stays "pending" for 12 hours. When the customer comes back, "Did your order go through?" appears and cannot be dismissed with Esc. Yes: logged, bag cleared, thank you. No: asks what happened, logs a problem, keeps or clears the bag.
- **Custom order door** (`door.ts`): two concentric arches sharing one floor line. Full-width windows: tapping the door only pops it a little (the plain "Request a custom order" button beside it does the asking). Narrow windows: the prompt "Tap the door to request a custom order" sits under the door (never crossed by a line) and a tap pops the door and opens the custom-order form directly. The header "Custom order" button is always there.
- **Custom order** (`custom.ts`): replaces "Book an appointment". Request a perfume that is not in the collection (brand + fragrance), a signature blend, or a gift; size, budget, date needed (3 days notice to 120 days), pick up/delivery. Reference `SBR-CUS-...`.
- **Leads** (`leads.ts`, `docs/google-sheets-leads/`): Orders, Custom orders, Problems and Subscribers go to a Google Sheet; the owner is emailed; PDFs go to Drive; 8pm Lagos daily summary. With `leads.url` empty the site runs in preview mode and sends nothing.
- **Fallbacks**: no WebGL, data saver, 1 GB phones or `?still` show posters with the same controls. `prefers-reduced-motion` removes the intro, bloom and petals' motion. `?nointro` skips the start-up scene.

## How the hero loads (no lag)
The bottles pop up from below as the start-up screen clears; the lag came from preparing them *while* they were animating, so all the preparation now happens earlier, out of sight.
1. The nine GLB files download **at the same time** (`prefetch` in `gl/models.ts`; before, they came one after another behind a chain of script loads).
2. Each arrives, is parsed, has its textures sent to the GPU and its glass/metal shaders compiled, one bottle per frame (`warm` in `gl/shelf.ts`), so no bottle is ever prepared during an animation. Nothing is visible yet and the start-up screen stays up (at most `intro.maxMs`).
3. When the mist starts to clear (`lifted` in `intro.ts`) the bottles rise from below **one at a time** (`ENTER_GAP` = 320 ms in `gl/shelf.ts`, so only one or two are moving at once; closing a bottle still brings them back together). If a slow connection means a bottle is not warm by then, it rises on its own the moment it is.
4. Lighter frames: the gallery redraws at 30 fps when nothing is moving or hovered (full speed otherwise); the canvas has a pixel budget (about 2.1 million pixels, 1.4 million in lite mode) so big, sharp screens do not overload weaker graphics chips; the pixel-ratio auto-lowering only measures while bottles are moving.
5. Test the speed with `npm run build && npm run preview`, not `npm run dev`: the dev server serves unbundled, unminified three.js and is noticeably slower.
Pictures are used only when 3D is unavailable (no WebGL, data saver, `?still`, context lost), as before. Wide, flat bottles are drawn a little smaller (`wf` in `shelf.ts`) with their pictures enlarged (`--k`) so both versions match.

## Before it goes live (owner to confirm)
1. **WhatsApp number**: the brief said `23490348112418` (14 digits, not a valid Nigerian number). The site uses `2349034812418` (the number on the Lowkey Cutz site). Set the right one in `site.json`; the validator rejects anything that is not `234` + 10 digits.
2. **Prices, fragrance names, notes and descriptions are placeholders** (N17,000 to N65,000). FAQ answers on payment and delivery are guesses (marked `confirm`).
3. **Leads**: follow `docs/google-sheets-leads/SETUP.md`; set the token and owner email. Not tested against real Google services.
4. **Test on a real phone** and a real WhatsApp. This build was tested in headless Chrome with software GL.
5. The 3D bottles are community models (CC0 and CC-BY-4.0); credits are in the footer. They are stand-ins: the owner's real bottles can be swapped in (`npm run models` shows the optimisation script and its job list).
6. Models not used on purpose: a Chanel-branded bottle, a Sailor Moon item, and one with a CH monogram baked into its texture (trademarks).

## Regenerating posters
`public/posters/<id>.webp` (640x800, transparent) are rendered from the GLBs. After changing a model, `rot`, or `scale` in products.json, run `scripts/posters/posters.py` (needs Playwright, Pillow and a local server rooted at the folder containing the project and `scripts/posters/poster.html`; edit the paths at the top).

## Logo
`public/favicon.svg`, `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `og.png`; source in `scripts/make-logo.py` (bottle outline with a script R and a single spray dot).
