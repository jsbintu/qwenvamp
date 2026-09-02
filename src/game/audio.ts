/* Tiny procedural synth for game feedback. All calls are safe no-ops on failure. */

let ctx: AudioContext | null = null;
let muted = false;
let master: GainNode | null = null;

function ac(): AudioContext | null {
  try {
    if (!ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.32;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMuted(m: boolean) {
  muted = m;
}
export function isMuted() {
  return muted;
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.5, slideTo?: number, delay = 0) {
  if (muted) return;
  const c = ac();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + delay;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  } catch { /* ignore */ }
}

function noiseBurst(dur: number, vol = 0.4, freq = 900, delay = 0) {
  if (muted) return;
  const c = ac();
  if (!c || !master) return;
  try {
    const t0 = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t0);
  } catch { /* ignore */ }
}

export const sfx = {
  shoot() { tone(620, 0.08, 'square', 0.14, 240); },
  bones() { tone(300, 0.07, 'triangle', 0.18, 520); },
  zap() { tone(1150, 0.1, 'sawtooth', 0.12, 180); noiseBurst(0.06, 0.07, 3200); },
  explode() { noiseBurst(0.28, 0.45, 700); tone(140, 0.25, 'sine', 0.45, 50); },
  hit() { tone(220, 0.05, 'square', 0.09, 160); },
  crit() { tone(880, 0.09, 'square', 0.15, 320); },
  hurt() { tone(180, 0.18, 'sawtooth', 0.28, 70); },
  pickup() { tone(760, 0.06, 'sine', 0.11, 1080); },
  gold() { tone(1320, 0.07, 'triangle', 0.13, 1760); },
  heal() { tone(520, 0.16, 'sine', 0.18, 780); },
  rankup() { tone(660, 0.1, 'square', 0.16, 990); tone(990, 0.12, 'square', 0.14, 1320, 0.08); },
  levelup() { [440, 554, 659, 880].forEach((f, i) => tone(f, 0.16, 'square', 0.2, undefined, i * 0.08)); },
  fuse() {
    [220, 330, 440, 660, 880, 1174, 1568].forEach((f, i) => tone(f, 0.22, 'sawtooth', 0.16, undefined, i * 0.06));
    noiseBurst(0.6, 0.22, 2600, 0.25);
    tone(60, 0.8, 'sine', 0.4, 30, 0.2);
  },
  chest() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.22, undefined, i * 0.09)); },
  boss() { tone(90, 0.7, 'sawtooth', 0.38, 55); tone(67, 0.9, 'square', 0.28, 40, 0.15); noiseBurst(0.6, 0.28, 500, 0.1); },
  phase() { tone(120, 0.4, 'sawtooth', 0.3, 240); noiseBurst(0.3, 0.2, 1400); },
  telegraph() { tone(940, 0.07, 'square', 0.08, 700); },
  goblin() { [1500, 1700, 1500, 1900].forEach((f, i) => tone(f, 0.06, 'square', 0.1, undefined, i * 0.06)); },
  death() { [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.2, undefined, i * 0.16)); },
  victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.3, 'triangle', 0.22, undefined, i * 0.12)); },
  click() { tone(500, 0.04, 'square', 0.11, 700); },
};
