"""Renaissance background music on the Folia ground (Iberian, 16th century, public domain harmony).

Own arrangement: plucked lute/vihuela (Karplus-Strong), bowed viol, frame drum, simple room reverb.
32 bars of 3/4 at 80 bpm = 72 s: four passes of the 8-bar Folia (Dm A Dm C F C Dm A).

Usage: python3 folia.py out.wav
"""
import sys
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve

SR = 44100
BEAT = 0.75            # quarter note at 80 bpm
BAR = 3 * BEAT         # 2.25 s
TOTAL = 72.0
rng = np.random.default_rng(1519)

NOTE = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}


def hz(name):
    n, octv = name[:-1], int(name[-1])
    midi = 12 * (octv + 1) + NOTE[n]
    return 440.0 * 2 ** ((midi - 69) / 12)


def lowpass(x, fc, order=2):
    b, a = butter(order, fc / (SR / 2), "low")
    return lfilter(b, a, x)


def bandpass(x, lo, hi, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], "band")
    return lfilter(b, a, x)


# ---------- instruments ----------
def lute(freq, dur, vel=0.6, bright=0.5):
    """Karplus-Strong pluck (vectorised with lfilter) with a little body resonance."""
    n = int((dur + 1.8) * SR)
    p = max(2, int(round(SR / freq - 0.5)))  # loop delay p + 0.5 samples
    decay = 0.996 - 0.0004 * (freq / 440)
    burst = np.zeros(n)
    burst[:p] = lowpass(rng.uniform(-1, 1, p), 1500 + 5000 * bright)
    a = np.zeros(p + 2)
    a[0] = 1.0
    a[p] -= 0.5 * decay
    a[p + 1] -= 0.5 * decay
    out = lfilter([1.0], a, burst)
    env = np.ones(n)
    rel = int(0.08 * SR)
    stop = int((dur + 1.2) * SR)
    if stop < n:
        env[stop:stop + rel] = np.linspace(1, 0, min(rel, n - stop))
        env[stop + rel:] = 0
    body = bandpass(out, 90, 3800)
    return vel * (0.75 * out + 0.6 * body) * env


def viol(freq, dur, vel=0.4):
    """Bowed viol: band-limited saw with vibrato, slow attack, gentle release."""
    rel = 0.35
    n = int((dur + rel) * SR)
    t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.2 * t) * np.clip(t / 0.4, 0, 1)
    phase = 2 * np.pi * np.cumsum(freq * vib) / SR
    x = np.zeros(n)
    for k in range(1, 14):
        if freq * k > 9000:
            break
        x += np.sin(k * phase) / k * (0.85 ** k)
    x += 0.02 * lowpass(rng.uniform(-1, 1, n), 3000)  # bow noise
    att = np.clip(t / 0.14, 0, 1)
    swell = 0.85 + 0.15 * np.sin(np.pi * np.clip(t / max(dur, 0.01), 0, 1))
    tail = np.clip((dur + rel - t) / rel, 0, 1)
    x = lowpass(x, 2600) * att * swell * tail
    return vel * x


def drum(vel=0.5):
    n = int(0.9 * SR)
    t = np.arange(n) / SR
    f = 95 * np.exp(-t * 6) + 55
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7)
    skin = lowpass(rng.uniform(-1, 1, n), 1800) * np.exp(-t * 35) * 0.35
    return vel * (body + skin)


# ---------- score ----------
CHORDS = ["Dm", "A", "Dm", "C", "F", "C", "Dm", "A"]
TONES = {  # bass, then chord tones (lute voicing)
    "Dm": ("D2", ["D3", "A3", "D4", "F4", "A4"]),
    "A": ("A1", ["A2", "E3", "A3", "C#4", "E4"]),
    "C": ("C2", ["C3", "G3", "C4", "E4", "G4"]),
    "F": ("F2", ["F2", "C3", "F3", "A3", "C4"]),
}
# melody per pass: list of 8 bars, each bar a list of (note, beats)
MEL_A = [
    [("D5", 1), ("D5", 1.5), ("C#5", 0.5)],
    [("C#5", 1), ("E5", 1.5), ("D5", 0.5)],
    [("D5", 1), ("A4", 1.5), ("Bb4", 0.5)],
    [("C5", 1), ("G4", 1.5), ("A4", 0.5)],
    [("A4", 1), ("F4", 1.5), ("G4", 0.5)],
    [("G4", 1), ("E4", 1.5), ("F4", 0.5)],
    [("F4", 1), ("A4", 1.5), ("G4", 0.5)],
    [("E4", 3)],
]
MEL_B = [  # homecoming, higher and fuller
    [("A5", 1), ("A5", 1.5), ("G5", 0.5)],
    [("E5", 1), ("A5", 1.5), ("G5", 0.5)],
    [("F5", 1), ("D5", 1.5), ("E5", 0.5)],
    [("G5", 1), ("E5", 1.5), ("C5", 0.5)],
    [("F5", 1), ("C5", 1.5), ("D5", 0.5)],
    [("E5", 1), ("C5", 1.5), ("D5", 0.5)],
    [("D5", 1), ("F5", 1.5), ("E5", 0.5)],
    [("C#5", 3)],
]

L = np.zeros(int((TOTAL + 4) * SR))
R = np.zeros_like(L)


def place(sig, t0, pan=0.0, gain=1.0):
    i = int(t0 * SR)
    j = min(len(L), i + len(sig))
    if j <= i:
        return
    s = sig[: j - i] * gain
    L[i:j] += s * np.sqrt(0.5 * (1 - pan))
    R[i:j] += s * np.sqrt(0.5 * (1 + pan))


for bar in range(32):
    pass_ = bar // 8
    ch = CHORDS[bar % 8]
    if bar == 31:
        ch = "Dm"  # end at home
    t0 = bar * BAR
    bass, tones = TONES[ch]
    # pass dynamics: 0 departure, 1 winter/strait, 2 Pacific (sparse), 3 homecoming (full)
    lute_v = [0.32, 0.36, 0.26, 0.42][pass_]
    # bass note on beat 1
    place(lute(hz(bass), BAR, vel=lute_v * 1.1, bright=0.25), t0, pan=-0.2)
    if pass_ in (0, 1):
        # arpeggio in eighths: 1-3-5-4-3-2 pattern over chord tones
        patt = [1, 2, 3, 4, 3, 2]
        for k, ti in enumerate(patt):
            place(lute(hz(tones[ti]), BEAT * 0.5, vel=lute_v * (0.8 if k else 0.95), bright=0.45), t0 + k * BEAT / 2 + 0.006 * k, pan=-0.35)
    elif pass_ == 2:
        # sparse: one soft chord tone on beat 2, the ocean is empty
        place(lute(hz(tones[3]), BEAT * 2, vel=lute_v * 0.8, bright=0.3), t0 + BEAT, pan=-0.35)
    else:
        # strummed chord in the sarabande rhythm (beat 1, beat 2 accented)
        for st, v in ((0.0, 0.9), (BEAT, 1.0), (BEAT * 2.5, 0.6)):
            for k, n in enumerate(tones):
                place(lute(hz(n), BEAT, vel=lute_v * v * 0.7, bright=0.5), t0 + st + k * 0.012, pan=-0.3 + k * 0.05)
    # viol: drone in pass 1 and 2, melody in pass 1 (A) and 3 (B)
    if pass_ == 1:
        tt = t0
        for note, beats in MEL_A[bar % 8]:
            place(viol(hz(note), beats * BEAT * 0.97, vel=0.26), tt, pan=0.35)
            tt += beats * BEAT
    if pass_ == 2:
        place(viol(hz(bass) * 2, BAR * 0.98, vel=0.16), t0, pan=0.3)
        if bar % 8 in (3, 5, 7):
            tt = t0
            for note, beats in MEL_A[bar % 8]:
                place(viol(hz(note), beats * BEAT * 0.97, vel=0.13), tt, pan=0.35)
                tt += beats * BEAT
    if pass_ == 3:
        mel = MEL_B[bar % 8] if bar != 31 else [("D5", 3)]
        tt = t0
        for note, beats in mel:
            place(viol(hz(note), beats * BEAT * 0.97, vel=0.3), tt, pan=0.35)
            tt += beats * BEAT
        place(viol(hz(bass) * 2, BAR * 0.98, vel=0.12), t0, pan=0.1)
    # frame drum
    if pass_ == 1:
        place(drum(0.35), t0, pan=0.0)
        place(drum(0.22), t0 + BEAT, pan=0.0)
    if pass_ == 3 and bar != 31:
        place(drum(0.45), t0, pan=0.0)
        place(drum(0.32), t0 + BEAT, pan=0.0)
        place(drum(0.2), t0 + BEAT * 2.5, pan=0.0)
    if bar == 31:
        place(drum(0.5), t0, pan=0.0)

# final chord rings: add a long Dm chord on the last downbeat
for k, n in enumerate(TONES["Dm"][1]):
    place(lute(hz(n), 3.0, vel=0.35, bright=0.4), 31 * BAR + k * 0.02, pan=-0.2 + 0.08 * k)

# ---------- room ----------
ir_len = int(2.4 * SR)
tt = np.arange(ir_len) / SR
ir = rng.normal(0, 1, ir_len) * np.exp(-tt * 2.6)
ir = lowpass(ir, 5000)
ir /= np.sqrt(np.sum(ir ** 2))
wet = 0.22
Lw = fftconvolve(L, ir)[: len(L)]
Rw = fftconvolve(R, ir[::-1].copy() * 0 + ir)[: len(R)]
Lm = (1 - wet) * L + wet * Lw
Rm = (1 - wet) * R + wet * Rw

n = int(TOTAL * SR)
hb, ha = butter(2, 45 / (SR / 2), "high")
mix = np.stack([lfilter(hb, ha, Lm[:n]), lfilter(hb, ha, Rm[:n])], axis=1)
# fade in 0.3 s, fade out over the last 4 s
fi = int(0.3 * SR)
mix[:fi] *= np.linspace(0, 1, fi)[:, None]
fo = int(4.0 * SR)
mix[-fo:] *= np.linspace(1, 0, fo)[:, None] ** 1.5
# loudness: aim ~ -16 LUFS-ish via RMS, peak -1 dBFS
rms = np.sqrt(np.mean(mix ** 2))
mix *= 10 ** (-17 / 20) / max(rms, 1e-9)
peak = np.max(np.abs(mix))
if peak > 10 ** (-1 / 20):
    mix *= 10 ** (-1 / 20) / peak

from scipy.io import wavfile

wavfile.write(sys.argv[1], SR, (mix * 32767).astype(np.int16))
print("written", sys.argv[1], "rms dB", 20 * np.log10(np.sqrt(np.mean(mix ** 2))), "peak dB", 20 * np.log10(np.max(np.abs(mix))))
