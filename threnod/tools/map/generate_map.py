"""Generates the illustrated world map of the Vesperlands as an HTML/SVG page.

Usage:  python3 generate_map.py <out.html>
Render: node render_map.js <out.html> <out.png>
"""
import math
import random
import sys

W, H = 1600, 1200
rng = random.Random(412)  # year 412 After Silence


def noise1d(seed, octaves=4):
    """Cheap smooth periodic noise on [0, 2pi)."""
    r = random.Random(seed)
    terms = [(r.uniform(0, 6.28), 2 + i * 3 + r.randint(0, 2), 1 / (i + 1.4)) for i in range(octaves)]
    return lambda a: sum(amp * math.sin(freq * a + ph) for ph, freq, amp in terms)


# ---------------------------------------------------------------- landmass
n = noise1d(7, 6)
land_pts = []
for i in range(360):
    a = i / 360 * math.tau
    rx, ry = 650, 470
    k = 1 + 0.07 * n(a)
    # pull the west coast in a little (Ribcoast bay)
    if math.cos(a) < -0.6:
        k -= 0.05 * (math.cos(a) + 0.6) * -2
    land_pts.append((800 + rx * k * math.cos(a), 600 + ry * k * math.sin(a)))
land_d = "M" + " L".join(f"{x:.1f},{y:.1f}" for x, y in land_pts) + " Z"


def inside_land(x, y, margin=0.0):
    a = math.atan2(y - 600, x - 800) % math.tau
    i = int(a / math.tau * 360) % 360
    lx, ly = land_pts[i]
    return math.hypot(x - 800, y - 600) < math.hypot(lx - 800, ly - 600) - margin


# ---------------------------------------------------------------- glyphs
def mountain(x, y, s, snow=True):
    h = s * rng.uniform(0.9, 1.3)
    p = (f'<path d="M{x-s:.1f},{y:.1f} L{x:.1f},{y-h:.1f} L{x+s:.1f},{y:.1f}" class="mtn"/>'
         f'<path d="M{x:.1f},{y-h:.1f} L{x+s:.1f},{y:.1f} L{x+s*0.15:.1f},{y:.1f} Z" class="mtn-shade"/>')
    if snow:
        p += (f'<path d="M{x-s*0.33:.1f},{y-h*0.67:.1f} L{x:.1f},{y-h:.1f} L{x+s*0.33:.1f},{y-h*0.67:.1f} '
              f'L{x+s*0.1:.1f},{y-h*0.58:.1f} L{x-s*0.08:.1f},{y-h*0.7:.1f} Z" class="snow"/>')
    return p


def tree(x, y, s, dark=False):
    cls = "tree-dark" if dark else "tree"
    return (f'<line x1="{x:.1f}" y1="{y:.1f}" x2="{x:.1f}" y2="{y+s*0.5:.1f}" class="trunk"/>'
            f'<path d="M{x-s*0.5:.1f},{y+s*0.2:.1f} L{x:.1f},{y-s:.1f} L{x+s*0.5:.1f},{y+s*0.2:.1f} Z" class="{cls}"/>')


def scatter(cx, cy, rx, ry, count, fn, min_dist=14, avoid=()):
    pts = []
    tries = 0
    while len(pts) < count and tries < count * 40:
        tries += 1
        a, r = rng.uniform(0, math.tau), math.sqrt(rng.random())
        x, y = cx + r * rx * math.cos(a), cy + r * ry * math.sin(a)
        if not inside_land(x, y, 30):
            continue
        if any(math.hypot(x - ax, y - ay) < ar for ax, ay, ar in avoid):
            continue
        if all(math.hypot(x - px, y - py) > min_dist for px, py in pts):
            pts.append((x, y))
    pts.sort(key=lambda p: p[1])
    return "".join(fn(x, y) for x, y in pts)


avoid_labels = [(800, 575, 120), (1180, 880, 90), (790, 905, 80), (700, 300, 60)]
mountains = scatter(790, 270, 380, 130, 120, lambda x, y: mountain(x, y, rng.uniform(16, 26)), 22,
                    [(700, 300, 55)])
forest = scatter(1190, 560, 200, 230, 260, lambda x, y: tree(x, y, rng.uniform(10, 15), rng.random() < 0.55), 13,
                 [(1190, 545, 70)])
vale_trees = scatter(800, 560, 170, 110, 40, lambda x, y: tree(x, y, rng.uniform(8, 11)), 16,
                     [(785, 585, 85), (870, 540, 30), (720, 505, 25)])
hills = scatter(560, 760, 170, 120, 30, lambda x, y: f'<path d="M{x-12:.1f},{y:.1f} Q{x:.1f},{y-12:.1f} {x+12:.1f},{y:.1f}" class="hill"/>', 24)

# ---------------------------------------------------------------- ribs of Velmara
ribs = ""
for i, y in enumerate(range(390, 860, 62)):
    x0 = 205 + 18 * math.sin(i * 1.3)
    ribs += (f'<path d="M{x0-60:.1f},{y+30:.1f} Q{x0+20:.1f},{y-40:.1f} {x0+95:.1f},{y+5:.1f}" class="rib"/>')

# ---------------------------------------------------------------- icons
def bell(x, y):
    return (f'<g class="bell" transform="translate({x},{y})">'
            '<path d="M-6,4 Q-6,-8 0,-9 Q6,-8 6,4 Z"/><circle cx="0" cy="6" r="1.8"/></g>')


def lighthouse(x, y):
    return (f'<g class="icon" transform="translate({x},{y})"><path d="M-4,8 L-2.5,-8 L2.5,-8 L4,8 Z"/>'
            '<circle cx="0" cy="-11" r="3" class="glow"/></g>')


def village(x, y):
    return (f'<g class="icon" transform="translate({x},{y})">'
            '<path d="M-12,6 V-2 L-7,-7 L-2,-2 V6 Z M1,6 V-4 L6,-10 L11,-4 V6 Z"/>'
            '<circle cx="-7" cy="1" r="1.3" class="glow"/><circle cx="6" cy="0" r="1.3" class="glow"/></g>')


def cathedral(x, y):
    return (f'<g class="icon" transform="translate({x},{y})">'
            '<path d="M-26,14 V-4 L-20,-12 L-14,-4 V14 Z M-14,14 V-6 H14 V14 Z M14,14 V-4 L20,-12 L26,-4 V14 Z"/>'
            '<path d="M-5,-6 L0,-44 L5,-6 Z"/><circle cx="0" cy="-2" r="4" class="void"/></g>')


def cemetery(x, y):
    return (f'<g class="icon" transform="translate({x},{y})">'
            '<path d="M-1,-9 H1 V-5 H5 V-3 H1 V6 H-1 V-3 H-5 V-5 H-1 Z"/>'
            '<path d="M-12,6 V0 Q-9,-4 -6,0 V6 Z M6,6 V1 Q9,-3 12,1 V6 Z"/></g>')


def cave(x, y):
    return (f'<g class="icon" transform="translate({x},{y})"><path d="M-12,7 Q-12,-10 0,-10 Q12,-10 12,7 Z"/>'
            '<path d="M-6,7 Q-6,-3 0,-3 Q6,-3 6,7 Z" class="void"/></g>')


def lanterns(x, y):
    s = ""
    for i in range(14):
        a = i * 2.39
        r = 6 + 3.3 * i ** 0.75
        s += f'<circle cx="{x + r*math.cos(a):.1f}" cy="{y + r*0.7*math.sin(a):.1f}" r="{rng.uniform(1.6,3):.1f}" class="lantern"/>'
    return s


def temple(x, y):
    return (f'<g class="icon" transform="translate({x},{y})"><path d="M-10,6 H10 V4 H-10 Z M-8,4 V-4 H-6 V4 Z M-1,4 V-4 H1 V4 Z M6,4 V-4 H8 V4 Z M-11,-4 L0,-10 L11,-4 Z"/></g>')


def fortress(x, y):
    return (f'<g class="icon" transform="translate({x},{y})"><path d="M-10,8 V-6 H-7 V-3 H-4 V-6 H-1 V-3 H2 V-6 H5 V-3 H8 V-6 H10 V8 Z"/>'
            '<path d="M-2,8 V3 Q0,0 2,3 V8 Z" class="void"/></g>')


icons = "".join([
    village(870, 538), cemetery(718, 505), cave(905, 640),
    cathedral(790, 905), lanterns(1180, 880),
    lighthouse(258, 470), lighthouse(232, 690), lighthouse(300, 842),
    fortress(560, 230), fortress(940, 200), fortress(1060, 330),
    temple(1120, 470), temple(1270, 650), temple(1090, 720),
    cave(700, 318),
    bell(640, 600), bell(1010, 560), bell(470, 420), bell(640, 840), bell(1180, 380), bell(930, 760),
])

# ---------------------------------------------------------------- water
lake = '<path d="M705,585 Q720,548 790,550 Q860,553 862,588 Q858,622 790,625 Q715,624 705,585 Z" class="lake"/>'
rivers = (
    '<path d="M708,592 Q600,610 520,580 Q420,545 330,600 Q290,625 250,610" class="river"/>'  # vale → coast
    '<path d="M1010,330 Q1060,500 1120,620 Q1150,700 1140,780 Q1150,840 1180,875" class="river lethe"/>'  # Lethe-Wyn
)

roads = (
    '<path d="M870,540 Q960,520 1010,560 Q1080,600 1150,560" class="road"/>'
    '<path d="M790,625 Q795,740 790,880" class="road"/>'
    '<path d="M718,505 Q700,420 700,330" class="road"/>'
    '<path d="M705,585 Q560,560 470,430" class="road"/>'
    '<path d="M640,600 Q480,700 300,690" class="road"/>'
    '<path d="M930,640 Q1040,780 1150,870" class="road faint"/>'
)

# transitions between regions
def transition(x, y, text, anchor="start", dx=10):
    return (f'<g transform="translate({x},{y})"><path d="M0,-7 L7,0 L0,7 L-7,0 Z" class="pass"/>'
            f'<text x="{dx if anchor=="start" else -dx}" y="4" class="small" text-anchor="{anchor}">{text}</text></g>')


transitions = "".join([
    transition(700, 395, "Bell-Road Pass", "start"),
    transition(990, 545, "Thornbridge", "start", 10),
    transition(470, 575, "Mere Ferry", "end"),
    transition(790, 760, "The Sunless Road", "start"),
    transition(1040, 790, "?", "start"),
])

# ---------------------------------------------------------------- labels
def region_label(x, y, name, sub, size=30, rot=0):
    return (f'<g transform="translate({x},{y}) rotate({rot})">'
            f'<text class="region" font-size="{size}" text-anchor="middle">{name}</text>'
            f'<text class="sub" y="{size*0.75:.0f}" text-anchor="middle">{sub}</text></g>')


labels = "".join([
    region_label(800, 470, "Hollowmere Vale", "where the candles keep the names", 30),
    region_label(790, 140, "The Oathspire", "the knights still keep their watch", 32),
    region_label(700, 365, "Kesh Deep", "— beneath the stone —", 20),
    region_label(1200, 520, "The Thornchoir", "the forest that hums", 32, -4),
    region_label(250, 330, "The Ribcoast", "Velmara's bones", 28, -8),
    region_label(790, 975, "Noonspire", "the city without sound", 30),
    region_label(1200, 950, "Lanternfall", "drink, and forget", 24),
    region_label(1420, 170, "The Greywaste", "here the world ends", 26, 12),
])

places = "".join(f'<text x="{x}" y="{y}" class="place" text-anchor="{a}">{t}</text>' for x, y, t, a in [
    (888, 530, "Candlewick", "start"),
    (705, 500, "Saint Ebba's", "end"),
    (790, 594, "Hollowmere", "middle"),
    (920, 646, "Old Silver Mine", "start"),
    (548, 252, "Ser Varo's Keep", "middle"),
    (275, 465, "Last Light", "start"),
    (825, 912, "Cathedral of Noon", "start"),
])

# ---------------------------------------------------------------- compose
legend = (
    '<g transform="translate(1190,1030)" class="legend">'
    '<rect x="-14" y="-28" width="300" height="140" class="legend-box"/>'
    '<text class="sub" x="0" y="-6" style="font-style:normal;letter-spacing:2px">LEGEND</text>'
    f'{bell(8, 18)}<text x="24" y="22" class="small">Forgotten bell tower (fast travel)</text>'
    '<path d="M2,44 L8,37 L14,44 L8,51 Z" class="pass"/><text x="24" y="48" class="small">Passage between regions</text>'
    '<path d="M0,70 H18" class="road"/><text x="24" y="74" class="small">Old road</text>'
    '<rect x="0" y="88" width="18" height="10" fill="url(#hush)"/><text x="24" y="97" class="small">The Hush (forgotten land)</text>'
    '</g>'
)

compass = (
    '<g transform="translate(160,1030)" class="compass">'
    '<circle r="56" class="c-ring"/><circle r="44" class="c-ring thin"/>'
    '<path d="M0,-70 L9,0 L0,70 L-9,0 Z" class="c-star"/><path d="M-70,0 L0,-9 L70,0 L0,9 Z" class="c-star"/>'
    '<path d="M0,-70 L9,0 L0,0 Z M70,0 L0,9 L0,0 Z M0,70 L-9,0 L0,0 Z M-70,0 L0,-9 L0,0 Z" class="c-dark"/>'
    '<text y="-78" text-anchor="middle" class="sub" style="font-style:normal">N</text></g>'
)

title = (
    '<g transform="translate(800,1110)">'
    '<text class="title" text-anchor="middle">THE VESPERLANDS</text>'
    '<text class="sub" y="34" text-anchor="middle">as they are remembered in the year 412 After Silence</text></g>'
)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">
<defs>
  <filter id="paper"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="4"/>
    <feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.25  0 0 0 0 0.15  0 0 0 0.22 0"/>
    <feComposite in2="SourceGraphic" operator="in"/></filter>
  <filter id="rough"><feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="3" seed="9" result="t"/>
    <feDisplacementMap in="SourceGraphic" in2="t" scale="34"/></filter>
  <filter id="mist"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="4" seed="21" result="t"/>
    <feColorMatrix in="t" values="0 0 0 0 0.55  0 0 0 0 0.54  0 0 0 0 0.56  0 0 0 1.6 -0.55"/></filter>
  <radialGradient id="vign" cx="50%" cy="50%" r="72%">
    <stop offset="55%" stop-color="#000" stop-opacity="0"/><stop offset="100%" stop-color="#2a1708" stop-opacity="0.55"/></radialGradient>
  <radialGradient id="hushEdge" cx="800" cy="600" r="760" gradientUnits="userSpaceOnUse" gradientTransform="translate(800 600) scale(1 0.78) translate(-800 -600)">
    <stop offset="62%" stop-color="#8a8790" stop-opacity="0"/><stop offset="86%" stop-color="#8a8790" stop-opacity="0.78"/>
    <stop offset="100%" stop-color="#77747d" stop-opacity="0.95"/></radialGradient>
  <pattern id="hush" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
    <rect width="8" height="8" fill="#9a979f"/><line x1="0" y1="0" x2="0" y2="8" stroke="#6e6b74" stroke-width="2"/></pattern>
  <pattern id="waves" width="40" height="18" patternUnits="userSpaceOnUse">
    <path d="M0,10 Q10,4 20,10 T40,10" fill="none" stroke="#4c5f66" stroke-width="1" opacity="0.5"/></pattern>
  <linearGradient id="seaFade" x1="0" x2="1" y1="0" y2="0">
    <stop offset="0" stop-color="#7f948f" stop-opacity="0.95"/><stop offset="0.75" stop-color="#8fa29c" stop-opacity="0.85"/>
    <stop offset="1" stop-color="#8fa29c" stop-opacity="0"/></linearGradient>
  <linearGradient id="seaMaskGrad" x1="0" x2="0" y1="0" y2="1">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.22" stop-color="#fff" stop-opacity="1"/>
    <stop offset="0.8" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="seaMask"><rect width="{W}" height="{H}" fill="url(#seaMaskGrad)"/><path d="{land_d}" fill="#000" filter="url(#rough)"/></mask>
  <clipPath id="landclip"><path d="{land_d}"/></clipPath>
</defs>
<style>
  .region, .sub, .place, .small, .title {{ paint-order: stroke; stroke: #e6d6b2; stroke-width: 4px; stroke-linejoin: round; }}
  .legend .small, .legend .sub {{ stroke: none; }}
  .region {{ font-family: 'IM Fell English SC', serif; fill: #3a1f12; letter-spacing: 1px; }}
  .sub {{ font-family: 'IM Fell English', serif; font-style: italic; font-size: 16px; fill: #5a3b25; }}
  .place {{ font-family: 'IM Fell English', serif; font-size: 15px; fill: #2c1a0e; }}
  .small {{ font-family: 'IM Fell English', serif; font-size: 14px; fill: #3b2516; }}
  .title {{ font-family: 'IM Fell English SC', serif; font-size: 52px; fill: #3a1f12; letter-spacing: 8px; }}
  .mtn {{ fill: #c9b48c; stroke: #3d2a1a; stroke-width: 1.4; stroke-linejoin: round; }}
  .mtn-shade {{ fill: #8e7556; opacity: 0.75; }}
  .snow {{ fill: #f3ecdc; }}
  .tree {{ fill: #5d6b3a; stroke: #2b2a17; stroke-width: 1; }}
  .tree-dark {{ fill: #3a4426; stroke: #1d1f10; stroke-width: 1; }}
  .trunk {{ stroke: #3b2a17; stroke-width: 1.5; }}
  .hill {{ fill: none; stroke: #6a5236; stroke-width: 1.6; }}
  .rib {{ fill: none; stroke: #f4eee0; stroke-width: 9; stroke-linecap: round; opacity: 0.95; }}
  .icon path, .icon {{ fill: #3a2414; }}
  .glow {{ fill: #e8a83c; }}
  .void {{ fill: #d9c7a1; }}
  .bell path, .bell circle {{ fill: #8a5a1c; stroke: #3a2414; stroke-width: 1; }}
  .lantern {{ fill: #f0b54a; stroke: #7a4a14; stroke-width: 0.8; }}
  .lake {{ fill: #6f8a8a; stroke: #2f4446; stroke-width: 1.5; }}
  .river {{ fill: none; stroke: #5f7b7e; stroke-width: 3; stroke-linecap: round; }}
  .lethe {{ stroke: #8f7fb0; stroke-dasharray: 1 0; }}
  .road {{ fill: none; stroke: #6a3f22; stroke-width: 1.6; stroke-dasharray: 6 5; }}
  .faint {{ opacity: 0.45; }}
  .pass {{ fill: #9a3b22; stroke: #3a1f12; stroke-width: 1; }}
  .legend-box {{ fill: #eadcbc; stroke: #5a3b25; stroke-width: 1.2; opacity: 0.9; }}
  .c-ring {{ fill: none; stroke: #5a3b25; stroke-width: 1.5; }} .thin {{ stroke-width: 0.8; }}
  .c-star {{ fill: #eadcbc; stroke: #3a1f12; stroke-width: 1; }} .c-dark {{ fill: #6a3f22; }}
</style>
<rect width="{W}" height="{H}" fill="#e3d2ad"/>
<rect width="{W}" height="{H}" filter="url(#paper)" fill="#fff"/>
<!-- land -->
<g filter="url(#rough)">
  <path d="{land_d}" fill="#d9c49a" stroke="#4a3220" stroke-width="2.4"/>
</g>
<g clip-path="url(#landclip)">
  <path d="{land_d}" fill="none" stroke="#a88a5e" stroke-width="22" opacity="0.25" filter="url(#rough)"/>
</g>
{hills}
{rivers}
{lake}
{roads}
{mountains}
<path d="M640,318 Q700,270 760,318 Q700,350 640,318 Z" fill="none" stroke="#3a2414" stroke-dasharray="3 4" stroke-width="1.4"/>
{forest}
{vale_trees}
<!-- mist hiding Lanternfall -->
<ellipse cx="1180" cy="880" rx="120" ry="70" fill="#efe6d2" opacity="0.55" filter="url(#rough)"/>
{icons}
{transitions}
<!-- the Hush eats the world from the edges -->
<rect width="{W}" height="{H}" fill="url(#hushEdge)"/>
<rect width="{W}" height="{H}" filter="url(#mist)" opacity="0.55" mask="url(#edgeMask)"/>
<g mask="url(#seaMask)"><rect x="0" y="0" width="460" height="{H}" fill="url(#seaFade)"/>
<rect x="0" y="0" width="380" height="{H}" fill="url(#waves)"/></g>
{ribs}
<path d="M1250,60 Q1380,200 1560,260 L1600,0 Z" fill="url(#hush)" opacity="0.55" filter="url(#rough)"/>
<path d="M0,1200 Q120,1080 60,960 Q20,900 0,880 Z" fill="url(#hush)" opacity="0.4" filter="url(#rough)"/>
{labels}
{places}
{legend}
{compass}
{title}
<rect width="{W}" height="{H}" fill="url(#vign)"/>
<rect x="18" y="18" width="{W-36}" height="{H-36}" fill="none" stroke="#4a2c18" stroke-width="3"/>
<rect x="28" y="28" width="{W-56}" height="{H-56}" fill="none" stroke="#4a2c18" stroke-width="1"/>
</svg>'''

html = f'''<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&display=block" rel="stylesheet">
<style>html,body{{margin:0;background:#1b120b}} svg{{display:block;width:100%;height:auto}}</style>
</head><body>{svg}</body></html>'''

out = sys.argv[1] if len(sys.argv) > 1 else "vesperlands_map.html"
with open(out, "w", encoding="utf-8") as f:
    f.write(html)
print("wrote", out)
