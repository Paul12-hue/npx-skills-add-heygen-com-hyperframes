"""Cozy Winter-Ambience, komplett selbst synthetisiert (keine Samples, keine fremden Melodien).

Schichten: leiser Winterwind, warmer Streicher-Pad, Celesta-/Spieluhr-Melodie (eigene Komposition,
zufällig-geführt aus den Akkordtönen), gelegentlich ferne Glocke. Alles zirkulär berechnet:
Ende geht nahtlos in den Anfang über (Hall und ausklingende Töne werden umgebrochen).

Usage: python3 ambient_audio.py out.wav LOOP_SECONDS [--seed 5]
"""
import argparse
import numpy as np
from scipy.io import wavfile

SR = 44100
ap = argparse.ArgumentParser()
ap.add_argument("out"); ap.add_argument("loop", type=float)
ap.add_argument("--seed", type=int, default=5)
a = ap.parse_args()
N = int(a.loop * SR)
rng = np.random.default_rng(a.seed)
L = np.zeros(N); R = np.zeros(N)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def add(sig, start, pan=0.0, gain=1.0):
    """Signal ab Sample `start` addieren, Überhang an den Anfang umbrechen (nahtlos)."""
    idx = (np.arange(len(sig)) + start) % N
    np.add.at(L, idx, sig * gain * np.sqrt(0.5 * (1 - pan)))
    np.add.at(R, idx, sig * gain * np.sqrt(0.5 * (1 + pan)))

def circ_filter(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    return np.fft.irfft(X, len(x))

t = np.arange(N) / SR
per = lambda cyc, ph=0: np.sin(2 * np.pi * cyc * t / a.loop + ph)

# ---------- Wind (zirkulär gefiltertes Rauschen, Böen periodisch) ----------
for ch, ph in ((L, 0.0), (R, 1.3)):
    w = circ_filter(rng.standard_normal(N), 120, 900)
    w /= np.abs(w).max()
    gust = 0.55 + 0.25 * per(3, ph) + 0.15 * per(7, ph * 2) + 0.05 * per(13)
    ch += w * gust * 0.10
    hiss = circ_filter(rng.standard_normal(N), 2500, 7000)
    ch += hiss / np.abs(hiss).max() * (0.012 + 0.008 * per(5, ph))

# ---------- Harmonie: langsamer 3/4-Takt in F-Dur ----------
BPM = 66
beat = 60 / BPM
bar = 3 * beat
chords = [  # MIDI-Töne
    [53, 57, 60, 65],  # F
    [50, 57, 62, 65],  # Dm
    [46, 53, 58, 62],  # Bb
    [48, 55, 60, 64],  # C
    [53, 57, 60, 69],  # F
    [45, 52, 57, 60],  # Am
    [46, 50, 58, 65],  # Bb
    [48, 52, 58, 64],  # C7
]
bars_total = int(a.loop // bar)
chord_len = 2  # Takte pro Akkord

# Streicher-Pad: verstimmte Sägezähne, weich gefiltert, langsamer Einsatz/Ausklang
def pad_note(m, dur):
    n = int(dur * SR); tt = np.arange(n) / SR
    s = sum(np.sin(2 * np.pi * hz(m) * (1 + d) * tt + p) for d, p in ((-0.003, 0), (0.0, 1), (0.0035, 2)))
    s += 0.25 * sum(np.sin(2 * np.pi * 2 * hz(m) * (1 + d) * tt) for d in (-0.002, 0.002))
    env = np.minimum(1, tt / 1.8) * np.minimum(1, (dur - tt) / 2.2).clip(0)
    vib = 1 + 0.002 * np.sin(2 * np.pi * 4.8 * tt)
    return s * env * vib

for b in range(0, bars_total, chord_len):
    ch = chords[(b // chord_len) % len(chords)]
    start = int(b * bar * SR)
    for i, m in enumerate(ch):
        add(pad_note(m, chord_len * bar + 2.0), start, pan=(i - 1.5) * 0.3, gain=0.022)

# Celesta / Spieluhr: Sinus + glockige Obertöne, schnelles Abklingen
def celesta(m, vel):
    dur = 3.5; n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m)
    s = np.sin(2 * np.pi * f * tt) + 0.35 * np.sin(2 * np.pi * 4 * f * tt) * np.exp(-tt * 6) + 0.12 * np.sin(2 * np.pi * 2.76 * f * tt) * np.exp(-tt * 9)
    env = np.exp(-tt * 1.4) * np.minimum(1, tt / 0.004)
    return s * env * vel

# Melodie: pro Takt 1–3 Töne aus Akkord + Durchgangston, schrittweise geführt, mit Pausen-Takten
scale = [65, 67, 69, 70, 72, 74, 76, 77, 79, 81]  # F-Dur, obere Lage
cur = 72
for b in range(bars_total):
    ch = chords[(b // chord_len) % len(chords)]
    if b % 8 in (6, 7) and rng.random() < 0.7:   # Atempausen
        continue
    tones = [m for m in scale if (m % 12) in {c % 12 for c in ch}]
    rhythm = [[0], [0, 2], [0, 1, 2], [0, 1.5]][rng.integers(0, 4)]
    for k, pos in enumerate(rhythm):
        cand = tones if k == 0 else scale
        cur = min(cand, key=lambda m: abs(m - cur) + rng.uniform(0, 4))
        start = int((b * bar + pos * beat + rng.uniform(-0.015, 0.015)) * SR)
        add(celesta(cur, rng.uniform(0.6, 0.9)), start, pan=rng.uniform(-0.3, 0.3), gain=0.05)
        if rng.random() < 0.35:  # leises Echo eine Oktave höher
            add(celesta(cur + 12, 0.4), start + int(beat * 0.5 * SR), pan=0.4, gain=0.025)

# Ferne Glocke (2x pro Loop)
def bell(m):
    dur = 7; n = int(dur * SR); tt = np.arange(n) / SR; f = hz(m)
    parts = [(0.5, 1.0, 0.6), (1, 0.8, 0.9), (1.19, 0.4, 1.4), (1.5, 0.35, 1.2), (2.0, 0.3, 1.8), (2.74, 0.15, 2.5)]
    return sum(amp * np.sin(2 * np.pi * f * r * tt) * np.exp(-tt * d) for r, amp, d in parts) * np.minimum(1, tt / 0.01)
for frac in (0.18, 0.68):
    add(circ_filter(bell(69), 80, 3000), int(frac * N), pan=-0.5, gain=0.018)

# ---------- Zirkulärer Hall (FFT-Faltung über die ganze Loop-Länge) ----------
irn = int(3.2 * SR); ti = np.arange(irn) / SR
for ch_i, ch in enumerate((L, R)):
    ir = np.random.default_rng(99 + ch_i).standard_normal(irn) * np.exp(-ti * 2.1)
    ir[0] = 0
    irf = np.zeros(N); irf[:irn] = ir / np.sqrt((ir ** 2).sum())
    wet = np.fft.irfft(np.fft.rfft(ch) * np.fft.rfft(irf), N)
    ch[:] = ch * 0.75 + wet * 0.45

out = np.stack([L, R], 1)
out = out / np.abs(out).max() * 0.6   # ruhiges Niveau, viel Headroom
wavfile.write(a.out, SR, (out * 32767).astype(np.int16))
print("fertig:", a.out, f"{a.loop:.1f}s")
