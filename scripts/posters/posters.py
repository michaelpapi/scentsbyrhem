"""Render a transparent 640x800 poster per fragrance. usage: python3 -I posters.py <outdir> [id ...]"""
import sys, os, json, io
from playwright.sync_api import sync_playwright
from PIL import Image
out = sys.argv[1]; os.makedirs(out, exist_ok=True)
data = json.load(open('/home/claude/work/scentsbyrhem/src/data/products.json'))
ids = sys.argv[2:] or [i['id'] for i in data['items']]
yaws = {i['id']: i.get('yaw', 0.4) for i in data['items']}
with sync_playwright() as p:
    b = p.chromium.launch(channel='chrome', args=['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'])
    pg = b.new_page(viewport={'width': 640, 'height': 800})
    pg.on('console', lambda m: print('  console:', m.text[:160]) if m.type == 'error' else None)
    for i in ids:
        pg.goto(f'http://127.0.0.1:8765/scentsbyrhem/scripts/posters/poster.html?id={i}&yaw={yaws[i]}')
        pg.wait_for_function('window.__ready === true', timeout=120000)
        err = pg.evaluate('window.__err || ""')
        png = pg.screenshot(omit_background=True)
        Image.open(io.BytesIO(png)).convert('RGBA').save(os.path.join(out, i + '.webp'), 'WEBP', quality=88, method=6)
        print('ERR ' + err if err else 'ok', i)
    b.close()
