"""Share pictures: one 1200x630 PNG per fragrance in public/og/<id>.jpg (what WhatsApp, iMessage, X and Facebook show for a product link).
Run from the project folder after changing a product, a mood or a poster:  python3 scripts/og.py   (needs Playwright + Chrome)"""
import json, os, pathlib, html
from playwright.sync_api import sync_playwright
root = pathlib.Path(__file__).resolve().parent.parent
site = json.load(open(root / 'src/data/site.json')); cat = json.load(open(root / 'src/data/products.json'))
F = root / 'node_modules/@fontsource'
disp = (F / 'cormorant-garamond/files/cormorant-garamond-latin-600-italic.woff2').as_uri()
disp3 = (F / 'cormorant-garamond/files/cormorant-garamond-latin-300-normal.woff2').as_uri()
ui = (F / 'jost/files/jost-latin-500-normal.woff2').as_uri()
labels = {c['id']: c['label'] for c in cat['categories']}
host = site['url'].replace('https://', '')
out = root / 'public/og'; out.mkdir(exist_ok=True)
tpl = '''<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:D;font-weight:600;font-style:italic;src:url(%(disp)s)}
@font-face{font-family:D3;font-weight:300;src:url(%(disp3)s)}
@font-face{font-family:U;font-weight:500;src:url(%(ui)s)}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;overflow:hidden;position:relative;background:linear-gradient(150deg,%(a)s,%(b)s);color:#FBE9EE;font-family:U}
.glow{position:absolute;right:60px;top:-40px;width:760px;height:760px;background:radial-gradient(closest-side,%(glow)s,transparent);opacity:.55}
img{position:absolute;right:70px;top:30px;height:570px;width:auto;filter:drop-shadow(0 30px 34px rgba(10,2,6,.5))}
.t{position:absolute;left:72px;top:70px;right:520px}
.k{font:500 22px U;letter-spacing:.3em;text-transform:uppercase;color:#F4C6D2}
h1{font:italic 600 %(fs)spx/.98 D;margin-top:34px;color:#FBE9EE}
p{font:300 34px/1.3 D3;margin-top:26px;color:#F4C6D2;max-width:560px}
.f{position:absolute;left:72px;bottom:52px;font:500 20px U;letter-spacing:.24em;text-transform:uppercase;color:#FBE9EE;opacity:.85}
.f b{display:inline-block;width:46px;height:1px;background:#F4C6D2;vertical-align:middle;margin-right:18px}
</style><div class=glow></div><img src="%(poster)s"><div class=t><div class=k>Scents by Rhem &middot; %(cat)s</div><h1>%(name)s</h1><p>%(line)s</p></div><div class=f><b></b>%(host)s</div>'''
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome'); pg = b.new_page(viewport={'width': 1200, 'height': 630})
    for it in cat['items']:
        m = site['moods'][it['mood']]; n = len(it['name'])
        d = dict(disp=disp, disp3=disp3, ui=ui, a=m['a'], b=m['b'], glow=m['glow'], fs=104 if n <= 12 else 86, poster=(root / f"public/posters/{it['id']}.webp").as_uri(),
                 cat=html.escape(labels[it['category']]), name=html.escape(it['name']), line=html.escape(it['line']), host=html.escape(host))
        tmp = root / '.og-tmp.html'; tmp.write_text(tpl % d, encoding='utf-8')
        pg.goto(tmp.as_uri()); pg.wait_for_timeout(400); pg.evaluate('document.fonts.ready'); pg.wait_for_timeout(200)
        pg.screenshot(path=str(out / f"{it['id']}.jpg"), type="jpeg", quality=86); print('og', it['id'])
    tmp.unlink(); b.close()
