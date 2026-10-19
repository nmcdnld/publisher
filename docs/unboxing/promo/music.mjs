// Synthesizes the promo's soundtrack: a swung ii-V-I-VI groove at 120 BPM
// (one bar = 2 s), so every scene cut in promo.html lands on a bar line.
// Usage: node music.mjs out.wav
import { writeFileSync } from "node:fs";

const SR = 44100;
const DURATION = 34;
const BEAT = 0.5;
const BAR = 4 * BEAT;
const SWING = (2 / 3) * BEAT;
const N = Math.ceil(DURATION * SR);

const L = new Float32Array(N);
const R = new Float32Array(N);
const sendL = new Float32Array(N);
const sendR = new Float32Array(N);

let seed = 7;
const noise = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2147483648 - 1;
};
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function add(start, len, pan, send, fn) {
  const s0 = Math.floor(start * SR);
  const n = Math.floor(len * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n && s0 + i < N; i++) {
    if (s0 + i < 0) continue;
    const v = fn(i / SR);
    L[s0 + i] += v * gl;
    R[s0 + i] += v * gr;
    if (send) {
      sendL[s0 + i] += v * gl * send;
      sendR[s0 + i] += v * gr * send;
    }
  }
}

function rhodes(t0, midi, dur, vel = 1) {
  const f = hz(midi);
  add(t0, dur + 1.6, -0.25 + (midi % 5) * 0.08, 0.35, (t) => {
    const env =
      Math.min(1, t / 0.004) *
      Math.exp(-t / 1.4) *
      (t > dur ? Math.exp(-(t - dur) / 0.25) : 1);
    const idx = 1.6 * Math.exp(-t / 0.18);
    const trem = 1 + 0.12 * Math.sin(2 * Math.PI * 4.5 * t);
    const v =
      Math.sin(2 * Math.PI * f * t + idx * Math.sin(2 * Math.PI * f * t)) +
      0.18 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / 0.3);
    return 0.075 * vel * env * trem * v;
  });
}

function vibe(t0, midi, vel = 1) {
  const f = hz(midi);
  add(t0, 2.6, 0.35, 0.6, (t) => {
    const env = Math.min(1, t / 0.002) * Math.exp(-t / 0.9);
    const trem = 1 + 0.25 * Math.sin(2 * Math.PI * 5.5 * t);
    const v =
      Math.sin(2 * Math.PI * f * t) +
      0.25 * Math.sin(2 * Math.PI * 4 * f * t) * Math.exp(-t / 0.08);
    return 0.09 * vel * env * trem * v;
  });
}

function bass(t0, midi, dur = BEAT * 0.95, vel = 1) {
  const f = hz(midi);
  add(t0, dur + 0.15, 0, 0.05, (t) => {
    const env =
      Math.min(1, t / 0.006) *
      (0.55 + 0.45 * Math.exp(-t / 0.09)) *
      Math.exp(-t / 0.9) *
      (t > dur ? Math.exp(-(t - dur) / 0.04) : 1);
    const v =
      Math.sin(2 * Math.PI * f * t) +
      0.45 * Math.sin(2 * Math.PI * 2 * f * t) * Math.exp(-t / 0.2) +
      0.15 * Math.sin(2 * Math.PI * 3 * f * t) * Math.exp(-t / 0.08);
    return 0.28 * vel * env * v;
  });
}

function ride(t0, vel = 1) {
  let prev = 0;
  add(t0, 1.0, 0.4, 0.12, (t) => {
    const n = noise();
    const hp = n - prev;
    prev = n;
    const ping =
      Math.sin(2 * Math.PI * 3150 * t) * 0.5 +
      Math.sin(2 * Math.PI * 4820 * t) * 0.35 +
      Math.sin(2 * Math.PI * 6930 * t) * 0.25;
    const env = Math.exp(-t / 0.35);
    return vel * env * (0.03 * hp + 0.014 * ping * Math.exp(-t / 0.12));
  });
}

function chick(t0, vel = 1) {
  let prev = 0;
  add(t0, 0.08, 0.2, 0, (t) => {
    const n = noise();
    const hp = n - prev;
    prev = n;
    return vel * 0.05 * hp * Math.exp(-t / 0.018);
  });
}

function kick(t0, vel = 1) {
  add(t0, 0.4, 0, 0, (t) => {
    const f = 48 + 70 * Math.exp(-t / 0.03);
    return vel * 0.32 * Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.16);
  });
}

function snare(t0, vel = 1) {
  let lp = 0;
  let prev = 0;
  add(t0, 0.25, -0.1, 0.25, (t) => {
    lp += 0.35 * (noise() - lp);
    const bp = lp - prev;
    prev = lp;
    const body = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.03);
    return vel * (0.16 * bp + 0.05 * body) * Math.exp(-t / 0.08);
  });
}

function crash(t0, vel = 1) {
  let prev = 0;
  add(t0, 3.2, -0.2, 0.3, (t) => {
    const n = noise();
    const hp = n - prev;
    prev = n;
    return vel * 0.05 * hp * Math.exp(-t / 1.1) * Math.min(1, t / 0.003);
  });
}

const CHORDS = {
  Dm9: { root: 38, third: 41, fifth: 45, voicing: [53, 57, 60, 64] },
  G13: { root: 43, third: 47, fifth: 50, voicing: [53, 57, 59, 64] },
  Cmaj9: { root: 36, third: 40, fifth: 43, voicing: [52, 55, 59, 62] },
  A7alt: { root: 45, third: 49, fifth: 52, voicing: [55, 61, 65, 72] },
};
const CYCLE = ["Dm9", "G13", "Cmaj9", "A7alt"];
const chordAt = (bar) => {
  if (bar === 14) return "Dm9";
  if (bar === 15) return "G13";
  return CYCLE[bar % 4];
};

for (let bar = 0; bar < 16; bar++) {
  const t = bar * BAR;
  const c = CHORDS[chordAt(bar)];
  const next = bar === 15 ? { root: 36 } : CHORDS[chordAt(bar + 1)];
  const drums = bar >= 2 && bar !== 14;

  if (bar === 14) {
    // Stop-time: three band stabs under the outro's "Find it. Ask it. Get back to it."
    [1, 2, 3].forEach((b, i) => {
      const at = t + b * BEAT;
      c.voicing.forEach((m) => rhodes(at, m, 0.18, 1.1));
      bass(at, c.root + (i === 2 ? 7 : 0), 0.2, 1.1);
      kick(at, 0.8);
      snare(at, 0.5);
      vibe(at, [69, 72, 76][i], 1);
    });
    continue;
  }

  const walk = [c.root, c.third, c.fifth, next.root + 1];
  walk.forEach((m, i) => bass(t + i * BEAT, m, BEAT * 0.92, i === 0 ? 1.05 : 0.9));

  const comp = bar % 2 === 0 ? [[0, 1.3], [1 + 2 / 3, 0.3]] : [[1, 0.35], [2 + 2 / 3, 1.0]];
  comp.forEach(([b, d], i) =>
    c.voicing.forEach((m) => rhodes(t + b * BEAT, m, d * BEAT, i === 0 ? 1 : 0.8)),
  );

  if (bar < 2) {
    // Intro pickup on the vibes, before the drums enter.
    if (bar === 1) [74, 72, 69, 67].forEach((m, i) => vibe(t + 2 * BEAT + i * (BEAT / 2), m, 0.7));
    continue;
  }

  if (drums) {
    for (let b = 0; b < 4; b++) {
      ride(t + b * BEAT, b % 2 ? 1 : 0.75);
      if (b % 2) {
        ride(t + b * BEAT + SWING, 0.55);
        chick(t + b * BEAT);
      }
      if (b % 2 === 0) kick(t + b * BEAT, 0.45);
    }
    if (bar === 2) crash(t, 0.8);
    const fill = bar === 4 || bar === 9 || bar === 13;
    if (fill) {
      for (let k = 0; k < 6; k++) snare(t + 2 * BEAT + (k * BEAT) / 3, 0.45 + k * 0.1);
    } else {
      snare(t + 1 * BEAT + SWING, 0.18);
      snare(t + 3 * BEAT + SWING, 0.22);
    }
    if (bar === 5 || bar === 10) crash(t, 0.55);
  }
}

// Final resolution at 32 s: C6/9 with a crash and a vibes sparkle.
const END = 16 * BAR;
[52, 57, 62, 67, 74].forEach((m) => rhodes(END, m, 1.6, 1.15));
bass(END, 36, 1.8, 1.2);
bass(END, 48, 1.8, 0.6);
kick(END, 1);
crash(END, 1.1);
[79, 83, 86].forEach((m, i) => vibe(END + i * 0.09, m, 0.8));

// A small Schroeder reverb on the send bus.
function reverb(input) {
  const out = new Float32Array(N);
  const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
  for (let n = 0; n < N; n++) {
    let s = 0;
    for (const c of combs) {
      const y = c.buf[c.i];
      c.buf[c.i] = input[n] + y * 0.8;
      c.i = (c.i + 1) % c.d;
      s += y;
    }
    out[n] = s * 0.25;
  }
  for (const d of [225, 556]) {
    const buf = new Float32Array(d);
    let i = 0;
    for (let n = 0; n < N; n++) {
      const b = buf[i];
      const y = -out[n] + b;
      buf[i] = out[n] + b * 0.5;
      i = (i + 1) % d;
      out[n] = y;
    }
  }
  return out;
}
const wetL = reverb(sendL);
const wetR = reverb(sendR);

let peak = 0;
for (let n = 0; n < N; n++) {
  L[n] = Math.tanh(1.2 * (L[n] + 0.5 * wetL[n]));
  R[n] = Math.tanh(1.2 * (R[n] + 0.5 * wetR[n]));
  peak = Math.max(peak, Math.abs(L[n]), Math.abs(R[n]));
}
const gain = 0.89 / peak;
const fadeFrom = 33 * SR;

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVEfmt ", 8);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);
for (let n = 0; n < N; n++) {
  const fade = n > fadeFrom ? Math.max(0, 1 - (n - fadeFrom) / (N - fadeFrom)) : 1;
  buf.writeInt16LE(Math.round(L[n] * gain * fade * 32767), 44 + n * 4);
  buf.writeInt16LE(Math.round(R[n] * gain * fade * 32767), 46 + n * 4);
}
writeFileSync(process.argv[2] ?? "music.wav", buf);
console.log("wrote", process.argv[2] ?? "music.wav", `${DURATION}s`);
