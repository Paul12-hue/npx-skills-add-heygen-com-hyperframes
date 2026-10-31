"""Dark medieval ambient bed for the dark-fantasy series. Fully synthesised (own work, no samples).

Layers: low drone, wordless "ah" choir pad (formant-filtered detuned saws), cold wind,
distant church bell, low drum hits on scene cuts, thunder on lightning. Simple convolution reverb.

Usage: python3 dark_ambient.py out.wav DURATION --cuts 5.8,11,16.2 --bells 0.3,11.2 --thunder 17.1 [--seed 7]
Chord progression (D minor, one chord per scene): Dm - Bb - Gm - A (repeats if more scenes).
"""
import argparse
import numpy as np
from scipy.signal import butter, lfilter, sosfilt, fftconvolve

SR = 44100
ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("duration", type=float)
ap.add_argument("--cuts", default="")
ap.add_argument("--bells", default="")
ap.add_argument("--thunder", default="")
ap.add_argument("--seed", type=int, default=7)
a = ap.parse_args()
T = a.duration
N = int(T * SR)
t = np.arange(N) / SR
rng = np.random.default_rng(a.seed)
fl = lambda s: [float(x) for x in s.split(",") if x.strip()]
cuts, bells, thunders = fl(a.cuts), fl(a.bells), fl(a.thunder)


def hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "band", fs=SR, output="sos"), x)


def lp(x, fc, order=2):
    return sosfilt(butter(order, fc, "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, "high", fs=SR, output="sos"), x)


def saw(f, ph=0.0):
    return 2 * ((f * t + ph) % 1.0) - 1


def env_segment(t0, t1, att=1.2, rel=1.6):
    e = np.clip((t - t0) / att, 0, 1) * np.clip((t1 + rel - t) / rel, 0, 1)
    return e * e * (3 - 2 * e)


# scene boundaries
bounds = [0.0] + cuts + [T]
CHORDS = [[50, 53, 57, 62], [46, 50, 53, 58], [43, 50, 55, 58], [45, 49, 52, 57]]  # Dm Bb Gm A (MIDI)

mix = np.zeros(N)

# 1) drone: D1 + A1, slow breathing
drone = (saw(hz(26)) * 0.6 + saw(hz(33), 0.3) * 0.4 + saw(hz(26) * 1.003, 0.5) * 0.5)
drone = lp(drone, 140, 4) * (0.75 + 0.25 * np.sin(2 * np.pi * t / 7.0))
mix += drone * 0.55 * np.clip(t / 2.0, 0, 1)

# 2) choir pad, one chord per scene, formant "ah"
choir = np.zeros(N)
for i in range(len(bounds) - 1):
    ch = CHORDS[i % len(CHORDS)]
    e = env_segment(bounds[i] - 0.2, bounds[i + 1], att=1.0, rel=1.4)
    seg = np.zeros(N)
    for m in ch:
        f = hz(m)
        vib = 1 + 0.004 * np.sin(2 * np.pi * (4.8 + rng.random()) * t + rng.random() * 6)
        for d in (-0.006, 0.0, 0.007):
            seg += saw(f * (1 + d) * vib, rng.random())
    form = bp(seg, 600, 820) * 1.0 + bp(seg, 1080, 1320) * 0.55 + bp(seg, 2450, 2750) * 0.18
    choir += form * e
mix += lp(choir, 3200) * 0.10

# 3) wind: noise, slowly sweeping band
wn = rng.standard_normal(N)
wind = np.zeros(N)
for lo, hi, rate, ph in [(250, 700, 0.11, 0.0), (500, 1400, 0.07, 2.0), (900, 2600, 0.05, 4.0)]:
    wind += bp(wn, lo, hi) * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t + ph)) ** 2
mix += wind * 0.10

# 4) distant bell (inharmonic partials)
for b in bells:
    i0 = int(b * SR)
    tt = t[i0:] - b
    f0 = hz(50)
    bell = np.zeros_like(tt)
    for r, amp, dec in [(0.5, 0.6, 3.5), (1.0, 1.0, 2.6), (1.19, 0.5, 2.0), (1.5, 0.4, 1.6), (2.0, 0.35, 1.2), (2.74, 0.25, 0.8), (3.76, 0.15, 0.5)]:
        bell += amp * np.sin(2 * np.pi * f0 * r * tt + r) * np.exp(-tt / dec)
    mix[i0:] += lp(bell, 2200) * 0.09

# 5) low drum hits on cuts
for c in cuts:
    i0 = int(max(0, c - 0.05) * SR)
    tt = t[i0:] - (c - 0.05)
    f = 48 * np.exp(-tt * 3) + 32
    ph = 2 * np.pi * np.cumsum(f) / SR
    hit = np.sin(ph) * np.exp(-tt / 0.9) + lp(rng.standard_normal(len(tt)), 300) * np.exp(-tt / 0.08) * 0.4
    mix[i0:] += hit * 0.55

# 6) thunder
for th in thunders:
    i0 = int(th * SR)
    tt = t[i0:] - th
    n = rng.standard_normal(len(tt))
    crack = hp(n, 1500) * np.exp(-tt / 0.12) * 0.5
    rum = lp(n, 160, 4) * (np.clip(tt / 0.15, 0, 1) * np.exp(-tt / 2.2)) * (1 + 0.6 * np.sin(2 * np.pi * 3.1 * tt))
    mix[i0:] += crack * 0.35 + rum * 4.5

# reverb
irn = int(3.2 * SR)
ir = rng.standard_normal(irn) * np.exp(-np.arange(irn) / SR / 0.9)
ir = lp(ir, 5000)
ir /= np.sqrt(np.sum(ir ** 2))
wet = fftconvolve(mix, ir)[:N]
out = mix * 0.7 + wet * 0.45

out = hp(out, 35, 2)
# fades
out *= np.clip(t / 0.4, 0, 1) * np.clip((T - t) / 1.2, 0, 1)
# loudness: rough normalise to ~-16 LUFS via RMS, then peak limit
rms = np.sqrt(np.mean(out ** 2))
out *= 10 ** (-17 / 20) / (rms + 1e-9)
pk = np.max(np.abs(out))
if pk > 0.89:
    out = np.tanh(out / 0.89 * 1.2) / np.tanh(1.2) * 0.89
st = np.stack([out, lfilter([1], [1], np.roll(out, int(0.011 * SR)) * 0.92 + out * 0.08)], axis=1)
from scipy.io import wavfile
wavfile.write(a.out, SR, (st * 32767).astype(np.int16))
print("wrote", a.out, T, "s")
