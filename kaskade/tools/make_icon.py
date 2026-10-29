"""Renders the KASKADE app icon (1024x1024, opaque) with Pillow. Run: python3 tools/make_icon.py"""
import math
import sys
from PIL import Image, ImageDraw, ImageFilter

S = 4096  # supersampled canvas
OUT = sys.argv[1] if len(sys.argv) > 1 else "KaskadeApp/Assets.xcassets/AppIcon.appiconset/AppIcon.png"

def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

img = Image.new("RGB", (S, S))
px = img.load()
top, bottom = (27, 37, 80), (7, 11, 23)
for y in range(S):
    c = lerp(top, bottom, y / S)
    for x in range(0, S):
        px[x, y] = c

# Soft glows
glow = Image.new("RGB", (S, S), (0, 0, 0))
g = ImageDraw.Draw(glow)
g.ellipse((-600, -700, 2600, 2300), fill=(60, 80, 170))
g.ellipse((1900, 2100, 4700, 4900), fill=(90, 50, 140))
glow = glow.filter(ImageFilter.GaussianBlur(500))
img = Image.blend(img, Image.composite(glow, img, glow.convert("L")), 0.55)

def stone(draw_img, cx, cy, r, light, base, deep):
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # shadow
    sh = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(sh).ellipse((cx - r, cy - r + r * 0.12, cx + r, cy + r + r * 0.12), fill=(0, 0, 0, 150))
    sh = sh.filter(ImageFilter.GaussianBlur(r * 0.12))
    draw_img.alpha_composite(sh)
    # radial gradient body
    steps = 90
    for i in range(steps):
        t = i / (steps - 1)
        rr = r * (1 - t * 0.98)
        ox, oy = cx - r * 0.3 * t, cy - r * 0.32 * t
        col = lerp(deep, base, min(1, t * 1.6)) if t < 0.62 else lerp(base, light, (t - 0.62) / 0.38)
        d.ellipse((ox - rr, oy - rr, ox + rr, oy + rr), fill=col + (255,))
    draw_img.alpha_composite(layer)
    # highlight
    hl = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    ImageDraw.Draw(hl).ellipse((cx - r * 0.55, cy - r * 0.78, cx + r * 0.25, cy - r * 0.32), fill=(255, 255, 255, 150))
    hl = hl.filter(ImageFilter.GaussianBlur(r * 0.06))
    draw_img.alpha_composite(hl)

canvas = img.convert("RGBA")
sun = ((255, 226, 168), (255, 167, 51), (194, 65, 12))
moon = ((211, 243, 255), (92, 200, 255), (51, 70, 201))
neutral = ((167, 173, 194), (93, 99, 128), (44, 48, 73))
R = 325
# A falling cascade: a diagonal line of four sun stones, moon stones beside.
positions = [
    (1060, 3050, sun), (1770, 2380, sun), (2480, 1710, sun), (3190, 1040, sun),
    (1770, 3050, moon), (2480, 3050, moon), (2480, 2380, moon), (3190, 3050, neutral), (3190, 2380, moon), (3190, 1710, sun),
]
for (x, y, pal) in positions:
    stone(canvas, x, y, R, *pal)

# Crystal floating top-left
cr = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(cr)
cx, cy, w, h = 1150, 1300, 620, 1000
pts = [(cx, cy - h / 2), (cx + w / 2, cy - h / 2 + h * 0.38), (cx, cy + h / 2), (cx - w / 2, cy - h / 2 + h * 0.38)]
glow2 = Image.new("RGBA", (S, S), (0, 0, 0, 0))
ImageDraw.Draw(glow2).polygon(pts, fill=(127, 245, 225, 200))
glow2 = glow2.filter(ImageFilter.GaussianBlur(160))
canvas.alpha_composite(glow2)
d.polygon(pts, fill=(127, 245, 225, 255))
d.polygon([pts[0], pts[1], (cx, cy - h / 2 + h * 0.38)], fill=(220, 255, 248, 255))
d.polygon([pts[3], (cx, cy - h / 2 + h * 0.38), pts[2]], fill=(47, 196, 178, 255))
canvas.alpha_composite(cr)

icon = canvas.convert("RGB").resize((1024, 1024), Image.LANCZOS)
icon.save(OUT, "PNG")
print("wrote", OUT)
