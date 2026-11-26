"""Nahtloser Ambient-Loop aus einem gemalten Standbild (Winter-Veranda).

Effekte (alle periodisch über LOOP Sekunden -> Ende passt exakt an den Anfang):
- Line boil: 3 leicht verzerrte Varianten des Bildes, gewechselt "on twos" (12 Wechsel/s bei 24 fps)
- Laterne flackert (warmer Lichthof), Fenster und Buntglastür pulsieren sanft (Kerzenlicht)
- Schneefall in 3 Tiefenebenen, Positionen "on twos" (handanimiertes Ruckeln)
- Filmkorn (rotierend), leichtes Helligkeitsflackern, Vignette, minimaler Kamera-Atem

Usage: python3 render_loop.py bild.png out.mp4 [--loop 60] [--seconds 60] [--fps 24]
"""
import argparse, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import gaussian_filter, map_coordinates

ap = argparse.ArgumentParser()
ap.add_argument("img"); ap.add_argument("out")
ap.add_argument("--loop", type=float, default=60.0)
ap.add_argument("--seconds", type=float, default=None)
ap.add_argument("--fps", type=int, default=24)
a = ap.parse_args()
W, H, FPS, LOOP = 1920, 1080, a.fps, a.loop
NF = int(round(LOOP * FPS))
NOUT = int(round((a.seconds or LOOP) * FPS))
rng = np.random.default_rng(3)

# ---------- Basisbild (etwas größer für Kamera-Atem) ----------
M = 1.03
BW, BH = int(W * M), int(H * M)
src = Image.open(a.img).convert("RGB").resize((BW, BH), Image.LANCZOS)
base = np.asarray(src).astype(np.float32) / 255.0
sx, sy = BW / 1672.0, BH / 941.0  # Koordinaten aus dem Originalbild umrechnen

# ---------- Line boil: 3 Varianten ----------
def smooth_noise(shape, sigma, amp, seed):
    r = np.random.default_rng(seed).standard_normal(shape)
    n = gaussian_filter(r, sigma)
    return n / (np.abs(n).max() + 1e-6) * amp

yy, xx = np.mgrid[0:BH, 0:BW].astype(np.float32)
boils = []
for k in range(3):
    dx = smooth_noise((BH, BW), 9, 1.3, 10 + k)
    dy = smooth_noise((BH, BW), 9, 1.3, 20 + k)
    v = np.stack([map_coordinates(base[..., c], [yy + dy, xx + dx], order=1, mode="nearest") for c in range(3)], -1)
    boils.append(v)
print("boil fertig")

# ---------- Licht-Masken ----------
def radial(cx, cy, r, power=2.0):
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    return np.clip(1 - d, 0, 1) ** power

def rect_soft(x0, y0, x1, y1, blur):
    m = np.zeros((BH, BW), np.float32)
    m[int(y0):int(y1), int(x0):int(x1)] = 1
    return gaussian_filter(m, blur)

lamp = radial(408 * sx, 238 * sy, 330 * sx, 1.8)
lamp_core = radial(408 * sx, 238 * sy, 70 * sx, 1.5)
window = rect_soft(735 * sx, 255 * sy, 958 * sx, 585 * sy, 18) * 0.8 + radial(845 * sx, 420 * sy, 380 * sx, 2.2) * 0.5
door = rect_soft(1255 * sx, 230 * sy, 1462 * sx, 585 * sy, 14)
warm = np.array([1.0, 0.72, 0.38], np.float32)

# Vignette
vx = (xx[: H, : W] / W - 0.5); vy = (yy[: H, : W] / H - 0.5)
vign = (1 - 0.55 * np.clip((vx ** 2 + vy ** 2) * 1.9, 0, 1) ** 1.3)[..., None]

# Filmkorn: 6 rotierende Frames
grains = [gaussian_filter(rng.standard_normal((H, W)).astype(np.float32), 0.7)[..., None] * 0.035 for _ in range(6)]

def periodic(t, terms):
    """Summe aus Sinus mit ganzzahligen Zyklen pro Loop -> nahtlos."""
    return sum(amp * np.sin(2 * np.pi * (cyc * t / LOOP) + ph) for cyc, amp, ph in terms)

# ---------- Schnee ----------
layers = []  # (anzahl, größe, umläufe pro loop, alpha, blur)
for count, size, laps, alpha, blur in [(260, 2.2, 3, 0.55, 0.6), (150, 3.6, 5, 0.75, 0.9), (45, 7.0, 8, 0.85, 2.2)]:
    layers.append(dict(
        x0=rng.uniform(0, W, count), y0=rng.uniform(0, H + 60, count),
        sway_amp=rng.uniform(8, 40, count), sway_cyc=rng.integers(4, 12, count), sway_ph=rng.uniform(0, 6.28, count),
        size=size * rng.uniform(0.7, 1.3, count), laps=laps, alpha=alpha, blur=blur,
        shape=rng.uniform(0.7, 1.0, count), rot=rng.uniform(0, 3.14, count)))

def snow_layer(t, L):
    im = Image.new("L", (W, H), 0)
    d = ImageDraw.Draw(im)
    y = (L["y0"] + t / LOOP * L["laps"] * (H + 60)) % (H + 60) - 30
    x = (L["x0"] + L["sway_amp"] * np.sin(2 * np.pi * L["sway_cyc"] * t / LOOP + L["sway_ph"])) % W
    for xi, yi, s, sh in zip(x, y, L["size"], L["shape"]):
        d.ellipse([xi - s, yi - s * sh, xi + s, yi + s * sh], fill=int(255 * L["alpha"]))
    if L["blur"]:
        im = im.filter(ImageFilter.GaussianBlur(L["blur"]))
    return np.asarray(im).astype(np.float32)[..., None] / 255.0

snow_col = np.array([0.93, 0.95, 1.0], np.float32)

# ---------- Render ----------
ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS),
                       "-i", "-", "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", a.out],
                      stdin=subprocess.PIPE)
for f in range(NOUT):
    fl = f % NF
    t2 = (fl // 2) * 2 / FPS            # "on twos"
    img = boils[(fl // 2) % 3].copy()

    # Licht
    lf = 1 + periodic(t2, [(37, 0.06, 0.3), (91, 0.04, 1.1), (173, 0.03, 2.0)])          # Laterne
    wf = 1 + periodic(t2, [(23, 0.05, 0.7), (59, 0.035, 1.9), (131, 0.025, 0.2)])         # Kerzen im Fenster
    df = 1 + periodic(t2, [(17, 0.04, 2.4), (47, 0.03, 0.5)])                             # Buntglastür
    img = img * (1 + (window * (wf - 1) * 2.2 + door * (df - 1) * 2.0)[..., None])
    img = img + (lamp * 0.16 * lf + lamp_core * 0.18 * lf)[..., None] * warm

    # Kamera-Atem (2 Zyklen pro Loop, sehr klein)
    ox = int((BW - W) / 2 + periodic(t2, [(1, (BW - W) / 2 * 0.8, 0)]))
    oy = int((BH - H) / 2 + periodic(t2, [(2, (BH - H) / 2 * 0.6, 1.0)]))
    img = img[oy:oy + H, ox:ox + W]

    # Schnee
    for L in layers:
        m = snow_layer(t2, L)
        img = img * (1 - m) + snow_col * m

    # Film: Flackern, Korn, Vignette
    img = img * (1 + periodic(t2, [(240, 0.008, 0), (157, 0.006, 1)]))
    img = (img + grains[(fl // 2) % 6]) * vign
    ff.stdin.write((np.clip(img, 0, 1) * 255).astype(np.uint8).tobytes())
    if f % 120 == 0:
        print("frame", f, "/", NOUT, flush=True)
ff.stdin.close(); ff.wait()
print("fertig:", a.out)
