"""Build the ScentsByRhem logo from the site's own fonts (glyph outlines -> SVG paths, so no font is needed to show it).
Outputs: src/components/logo-paths.json (used by Logo.astro), public/favicon.svg, public/favicon.svg and scripts/_og.svg; then `node scripts/rasterise-logo.mjs` writes the PNGs.
usage: python3 -I scripts/make-logo.py && node scripts/rasterise-logo.mjs"""
import json, os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
F = os.path.join(ROOT, 'node_modules/@fontsource')
fonts = {
    'it': TTFont(f'{F}/cormorant-garamond/files/cormorant-garamond-latin-300-italic.woff'),
    'it4': TTFont(f'{F}/cormorant-garamond/files/cormorant-garamond-latin-400-italic.woff'),
    'cap': TTFont(f'{F}/jost/files/jost-latin-400-normal.woff'),
}

def text_path(font, text, size, x=0, y=0, track=0.0):
    """-> (svg path d, width). y is the baseline. track is extra letter spacing in em."""
    gs = font.getGlyphSet(); cmap = font.getBestCmap(); upm = font['head'].unitsPerEm
    k = size / upm; cx = x; d = []
    for ch in text:
        gn = cmap.get(ord(ch))
        if gn is None: continue
        pen = SVGPathPen(gs, ntos=lambda v: f'{v:.2f}'.rstrip('0').rstrip('.'))
        # flip y: font units go up, svg goes down
        gs[gn].draw(TransformPen(pen, (k, 0, 0, -k, cx, y)))
        d.append(pen.getCommands())
        cx += gs[gn].width * k + track * size
    return ' '.join(d), cx - x - track * size

# ---- the mark: a perfume bottle drawn as one thin outline, the italic R inside, one spray dot ----
# viewBox 0 0 100 120. neck+cap above a body with soft shoulders.
bottle = ('M50 19.5 a6.5 6.5 0 1 1 0 13 a6.5 6.5 0 1 1 0 -13 Z '   # round stopper
          'M45 31.5 V44 '                                # neck left
          'M55 31.5 V44 '                                # neck right
          'M45 44 C45 49 24 50 24 64 V100 Q24 108 32 108 H68 Q76 108 76 100 V64 C76 50 55 49 55 44')
r_d, r_w = text_path(fonts['it4'], 'R', 52, 0, 0)
r_x = 50 - r_w / 2 - 1
r_d, r_w = text_path(fonts['it4'], 'R', 52, r_x, 93)
mark = {'bottle': bottle, 'r': r_d, 'dot': {'cx': 71, 'cy': 21, 'r': 2.3}}

# ---- the wordmark: "SCENTS BY" small tracked caps above "Rhem" in light italic ----
cap_d, cap_w = text_path(fonts['cap'], 'SCENTS BY', 9.5, 0, 0, 0.42)
rhem_d, rhem_w = text_path(fonts['it'], 'Rhem', 40, 0, 0, 0.02)
word = {'caps': cap_d, 'capsW': round(cap_w, 2), 'rhem': rhem_d, 'rhemW': round(rhem_w, 2)}

with open(os.path.join(ROOT, 'src/components/logo-paths.json'), 'w') as f:
    json.dump({'mark': mark, 'word': word}, f, separators=(',', ':'))

# ---- static files ----
BURG, DEEP, PINK, BLUSH = '#7A1633', '#2A0A14', '#F4C6D2', '#FBE9EE'
def mark_svg(stroke, fill_r, dot, sw=1.7):
    return (f'<path d="{bottle}" fill="none" stroke="{stroke}" stroke-width="{sw}" stroke-linejoin="round" stroke-linecap="round"/>'
            f'<path d="{r_d}" fill="{fill_r}"/>'
            f'<circle cx="71" cy="21" r="2.3" fill="{dot}"/>')

os.makedirs(os.path.join(ROOT, 'public'), exist_ok=True)
fav = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="26" fill="{DEEP}"/>'
       f'<g transform="translate(10 4)">{mark_svg(PINK, PINK, PINK)}</g></svg>')
open(os.path.join(ROOT, 'public/favicon.svg'), 'w').write(fav)

# og card 1200x630: deep wine, big mark + wordmark + line
og_word_caps = text_path(fonts['cap'], 'SCENTS BY', 22, 0, 0, 0.42)
og_rhem = text_path(fonts['it'], 'Rhem', 120, 0, 0, 0.02)
tag_d, tag_w = text_path(fonts['it'], 'Wear your signature.', 40, 0, 0)
og = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><radialGradient id="g" cx="0.3" cy="0.4" r="0.9">'
      f'<stop offset="0" stop-color="#5A1228"/><stop offset="1" stop-color="{DEEP}"/></radialGradient></defs>'
      f'<rect width="1200" height="630" fill="url(#g)"/>'
      f'<g transform="translate(150 105) scale(3.6)">{mark_svg(PINK, PINK, PINK, 0.9)}</g>'
      f'<g transform="translate(560 270)"><path d="{og_word_caps[0]}" fill="{PINK}"/></g>'
      f'<g transform="translate(556 390)"><path d="{og_rhem[0]}" fill="{BLUSH}"/></g>'
      f'<g transform="translate(560 470)"><path d="{tag_d}" fill="{PINK}" opacity=".85"/></g></svg>')
open(os.path.join(ROOT, 'scripts/_og.svg'), 'w').write(og)
