"""Generate the original ambient organ beds used under Cathedral Whispers Reels.

Everything here is synthesized from sine waves (additive "organ flue pipe" voices, slow chord
changes, a synthetic cathedral reverb), so the audio is entirely original: no samples, no
recordings, nothing that a rights-matching system could claim.

Usage: python3 audio/make_beds.py   (writes audio/*.m4a; needs numpy, scipy, ffmpeg)
"""
import subprocess, os
import numpy as np
from scipy.signal import fftconvolve, butter, sosfilt

SR = 48000
DUR = 96.0
HERE = os.path.dirname(os.path.abspath(__file__))
rng = np.random.default_rng(7)

def midi(n):
    return 440.0 * 2 ** ((n - 69) / 12)

def voice(freq, t, detune=0.0):
    """Soft flue-pipe tone: a few harmonics, slight chiff-free attack handled by the envelope."""
    amps = [1.0, 0.42, 0.22, 0.12, 0.06, 0.03]
    out = np.zeros_like(t)
    for h, a in enumerate(amps, start=1):
        f = freq * h * (1 + detune)
        if f > 6000:
            break
        out += a * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    return out

def bed(chords, chord_len=16.0, xfade=5.0, bass=True):
    n = int(SR * DUR)
    t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    k = 0
    start = 0.0
    while start < DUR:
        notes = chords[k % len(chords)]
        a0, a1 = start - xfade / 2, start + chord_len + xfade / 2
        env = np.zeros(n)
        i0, i1 = max(0, int(a0 * SR)), min(n, int(a1 * SR))
        if i1 > i0:
            seg = t[i0:i1]
            up = np.clip((seg - a0) / xfade, 0, 1)
            down = np.clip((a1 - seg) / xfade, 0, 1)
            env[i0:i1] = (0.5 - 0.5 * np.cos(np.pi * up)) * (0.5 - 0.5 * np.cos(np.pi * down))
            for j, m in enumerate(notes):
                g = 0.55 if j == 0 else 0.32
                # slow independent swell per note so the chord breathes
                sw = 0.85 + 0.15 * np.sin(2 * np.pi * (0.05 + 0.013 * j) * seg + j)
                L[i0:i1] += g * sw * env[i0:i1] * voice(midi(m), seg, -0.0007)
                R[i0:i1] += g * sw * env[i0:i1] * voice(midi(m), seg, +0.0007)
            if bass:
                b = 0.45 * env[i0:i1] * voice(midi(notes[0] - 12), seg)
                L[i0:i1] += b; R[i0:i1] += b
        start += chord_len
        k += 1
    # soften: gentle low-pass
    sos = butter(2, 2400, btype='low', fs=SR, output='sos')
    L = sosfilt(sos, L); R = sosfilt(sos, R)
    # synthetic cathedral reverb: 5 s decaying, darkening noise, decorrelated per channel
    ir_len = int(SR * 5.0)
    ti = np.arange(ir_len) / SR
    decay = np.exp(-ti * 6.9 / 5.0)
    def ir():
        x = rng.standard_normal(ir_len) * decay
        x = sosfilt(butter(1, 3000, btype='low', fs=SR, output='sos'), x)
        x[: int(SR * 0.025)] *= np.linspace(0, 1, int(SR * 0.025))  # pre-delay softness
        return x / np.sqrt(np.sum(x ** 2))
    wetL = fftconvolve(L, ir())[:n]; wetR = fftconvolve(R, ir())[:n]
    L = 0.45 * L + 0.9 * wetL; R = 0.45 * R + 0.9 * wetR
    # fade the bed itself in/out (each Reel also fades at its own length)
    fade = np.ones(n)
    fi = int(SR * 3); fo = int(SR * 4)
    fade[:fi] = np.linspace(0, 1, fi) ** 2
    fade[-fo:] = np.linspace(1, 0, fo) ** 2
    L *= fade; R *= fade
    st = np.stack([L, R], axis=1)
    rms = np.sqrt(np.mean(st[int(SR*5):int(SR*90)] ** 2))
    st *= 10 ** (-20 / 20) / rms           # about -20 dBFS RMS: quiet, under the reading
    peak = np.max(np.abs(st))
    if peak > 0.7:
        st *= 0.7 / peak
    return st

BEDS = {
    # name: chords as MIDI notes (root first), all slow and consonant
    'dawn':    [[62, 66, 69, 74], [67, 71, 74, 79], [59, 62, 66, 71], [57, 61, 64, 69]],   # D  G  Bm  A
    'vespers': [[65, 69, 72, 77], [58, 65, 70, 74], [62, 65, 69, 74], [60, 64, 67, 72]],   # F  Bb  Dm  C
    'stillness': [[57, 60, 64, 69], [53, 60, 65, 69], [60, 64, 67, 72], [55, 62, 67, 71]], # Am F  C  G
}

for name, chords in BEDS.items():
    st = bed(chords)
    raw = os.path.join(HERE, f'{name}.f32')
    st.astype('<f4').tofile(raw)
    out = os.path.join(HERE, f'{name}.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', raw,
                    '-c:a', 'aac', '-b:a', '160k', out], check=True)
    os.remove(raw)
    print('wrote', out)
