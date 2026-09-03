import type { ClassId, SkinId } from './types';

/* =========================================================================
   Gloomfall sprite pipeline — painted frames baked at boot into offscreen
   atlases. Each entity owns a Sheet of animation clips (rows of frames);
   gameplay rendering is a cheap drawImage blit, so all the painterly
   shading cost is paid once.
   ========================================================================= */

export interface Clip { name: string; y: number; frames: number; fps: number; loop: boolean; }
export interface Sheet { fw: number; fh: number; canvas: HTMLCanvasElement; clips: Record<string, Clip>; }

const sheets = new Map<string, Sheet>();
export function getSheet(id: string) { return sheets.get(id); }

/* ------------------------------ animator -------------------------------- */

export class Animator {
  sheetId: string;
  clipName = 'idle';
  f = 0;
  t = 0;
  speed = 1;
  private clip: Clip | null = null;

  constructor(sheetId: string, clip = 'idle') {
    this.sheetId = sheetId;
    this.play(clip, true);
  }
  play(name: string, force = false) {
    if (!force && name === this.clipName) return;
    const s = sheets.get(this.sheetId);
    const c = s?.clips[name] ?? s?.clips['idle'];
    if (!c) return;
    this.clipName = c.name;
    this.clip = c;
    this.f = 0;
    this.t = 0;
  }
  update(dt: number) {
    if (!this.clip) return;
    this.t += dt * this.clip.fps * this.speed;
    while (this.t >= 1) {
      this.t -= 1;
      if (this.clip.loop) this.f = (this.f + 1) % this.clip.frames;
      else this.f = Math.min(this.clip.frames - 1, this.f + 1);
    }
  }
  get done() {
    return !!this.clip && !this.clip.loop && this.f >= this.clip.frames - 1 && this.t > 0.9;
  }
  draw(c: CanvasRenderingContext2D, x: number, y: number, scale = 1, flip = false, alpha = 1, foot = false) {
    const s = sheets.get(this.sheetId);
    if (!s || !this.clip) return;
    c.save();
    c.globalAlpha = Math.max(0, Math.min(1, alpha));
    c.translate(x, y);
    if (flip) c.scale(-1, 1);
    c.scale(scale, scale);
    const dy = foot ? -s.fh / 2 : -s.fh / 2;
    c.drawImage(s.canvas, this.f * s.fw, this.clip.y, s.fw, s.fh, -s.fw / 2, dy, s.fw, s.fh);
    c.restore();
  }
}

/* ---------------------------- paint helpers ------------------------------ */

const OUT = 'rgba(24,10,34,0.95)';

function rrPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + rr, y);
  c.arcTo(x + w, y, x + w, y + h, rr);
  c.arcTo(x + w, y + h, x, y + h, rr);
  c.arcTo(x, y + h, x, y, rr);
  c.arcTo(x, y, x + w, y, rr);
  c.closePath();
}

/* Painterly shaded sphere: key light top-left, core shadow, rim light. */
function sphere(
  c: CanvasRenderingContext2D, x: number, y: number, r: number,
  hi: string, mid: string, lo: string, sx = 1, sy = 1, outline = true,
) {
  c.save();
  c.translate(x, y);
  c.scale(sx, sy);
  const g = c.createRadialGradient(-r * 0.38, -r * 0.45, r * 0.08, 0, 0, r * 1.2);
  g.addColorStop(0, hi);
  g.addColorStop(0.55, mid);
  g.addColorStop(1, lo);
  c.fillStyle = g;
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.fill();
  /* core shadow crescent */
  c.save();
  c.beginPath();
  c.arc(0, 0, r, 0, Math.PI * 2);
  c.clip();
  c.fillStyle = 'rgba(12,4,22,0.32)';
  c.beginPath();
  c.arc(r * 0.34, r * 0.42, r * 0.95, 0, Math.PI * 2);
  c.fill();
  /* bounce light from below */
  c.fillStyle = 'rgba(120,70,160,0.10)';
  c.beginPath();
  c.arc(-r * 0.1, r * 0.7, r * 0.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
  if (outline) {
    c.strokeStyle = OUT;
    c.lineWidth = Math.max(2, r * 0.13);
    c.beginPath();
    c.arc(0, 0, r, 0, Math.PI * 2);
    c.stroke();
  }
  /* rim highlight */
  c.strokeStyle = 'rgba(255,225,180,0.28)';
  c.lineWidth = Math.max(1.5, r * 0.1);
  c.beginPath();
  c.arc(0, 0, r * 0.86, -2.5, -0.7);
  c.stroke();
  c.restore();
}

function capsule(
  c: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number,
  w: number, hi: string, lo: string, outline = true,
) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  c.save();
  c.translate(x1, y1);
  c.rotate(ang);
  const g = c.createLinearGradient(0, -w, 0, w);
  g.addColorStop(0, hi);
  g.addColorStop(1, lo);
  c.fillStyle = g;
  rrPath(c, 0, -w / 2, len, w, w / 2);
  c.fill();
  if (outline) {
    c.strokeStyle = OUT;
    c.lineWidth = Math.max(1.6, w * 0.22);
    c.stroke();
  }
  c.restore();
}

function glowDot(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  const g = c.createRadialGradient(x, y, 0, x, y, r * 2.6);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.3, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.save();
  c.globalCompositeOperation = 'lighter';
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r * 2.6, 0, Math.PI * 2);
  c.fill();
  c.restore();
}

function star4(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string) {
  c.fillStyle = color;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const rad = i % 2 === 0 ? r : r * 0.35;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
  c.fill();
}

/* ------------------------------ poses ------------------------------------ */

export interface Pose {
  sq: number; bob: number; legA: number; legB: number;
  armA: number; armB: number; lean: number; head: number; flap: number;
}
const TAU = Math.PI * 2;
const ease = (t: number) => t * t * (3 - 2 * t);

function poseIdle(f: number, n: number): Pose {
  const p = (f / n) * TAU;
  return {
    sq: 1 + Math.sin(p) * 0.05, bob: Math.sin(p) * 0.045,
    legA: Math.sin(p) * 0.08, legB: -Math.sin(p) * 0.08,
    armA: 0.18 + Math.sin(p + 1) * 0.1, armB: -0.18 - Math.sin(p) * 0.1,
    lean: 0, head: Math.sin(p) * 0.06, flap: p,
  };
}
function poseWalk(f: number, n: number, run = false): Pose {
  const p = (f / n) * TAU;
  const amp = run ? 1 : 0.72;
  return {
    sq: 1 + Math.sin(p * 2) * 0.04, bob: Math.abs(Math.sin(p)) * 0.09,
    legA: Math.sin(p) * amp, legB: -Math.sin(p) * amp,
    armA: -Math.sin(p) * 0.6 * amp + 0.15, armB: Math.sin(p) * 0.6 * amp - 0.15,
    lean: run ? 0.2 : 0.08, head: Math.sin(p * 2) * 0.04, flap: p * 2,
  };
}
function poseAttack(f: number, n: number): Pose {
  const t = f / Math.max(1, n - 1);
  let armA = 0.2, lean = 0, sq = 1;
  if (t < 0.4) {
    const k = ease(t / 0.4);
    armA = 0.2 - 2.6 * k; lean = -0.14 * k; sq = 1 - 0.07 * k;
  } else if (t < 0.65) {
    const k = ease((t - 0.4) / 0.25);
    armA = -2.4 + 3.6 * k; lean = -0.14 + 0.46 * k; sq = 1 - 0.07 + 0.16 * k;
  } else {
    const k = ease((t - 0.65) / 0.35);
    armA = 1.2 - 1.0 * k; lean = 0.32 - 0.32 * k; sq = 1.09 - 0.09 * k;
  }
  return { sq, bob: 0.02, legA: 0.25, legB: -0.2, armA, armB: -0.5, lean, head: lean * 0.5, flap: 0 };
}
function poseCast(f: number, n: number): Pose {
  const t = f / Math.max(1, n - 1);
  const k = ease(Math.min(1, t * 1.6));
  return {
    sq: 1 + Math.sin(t * TAU) * 0.04, bob: 0.03 * k,
    legA: 0.12, legB: -0.12,
    armA: -2.7 * k, armB: -2.2 * k,
    lean: -0.06 * k, head: -0.14 * k, flap: t * TAU,
  };
}
function poseHurt(f: number, n: number): Pose {
  const t = f / Math.max(1, n - 1);
  const k = 1 - t;
  return {
    sq: 0.94, bob: 0.05 * k, legA: 0.3 * k, legB: -0.1,
    armA: -1.3 * k, armB: -1.0 * k, lean: -0.32 * k, head: -0.28 * k, flap: 0,
  };
}
function poseDie(f: number, n: number): Pose {
  const t = ease(f / Math.max(1, n - 1));
  return {
    sq: 1 - 0.5 * t, bob: 0.42 * t, legA: 0.3 + 0.8 * t, legB: -0.3 - 0.6 * t,
    armA: 0.4 + 1.1 * t, armB: -0.4 - 1.0 * t, lean: -0.7 * t, head: 0.4 * t, flap: 0,
  };
}

/* --------------------------- generic demon ------------------------------- */

export interface Pal { hi: string; mid: string; lo: string; eye: string; horn?: string; cloth?: string; }
export interface Feat {
  r: number;
  pal: Pal;
  fat?: boolean;
  horns?: 'straight' | 'curl' | 'crown' | 'none';
  ears?: boolean;
  wings?: boolean;
  tail?: boolean;
  tusks?: boolean;
  robe?: boolean;
  hood?: boolean;
  spikes?: boolean;
  spider?: boolean;
  bow?: boolean;
  staff?: boolean;
  cleaver?: boolean;
  sack?: boolean;
  shield?: boolean;
  translucent?: number;
}

function demon(c: CanvasRenderingContext2D, P: Pose, F: Feat) {
  const R = F.r;
  if (F.translucent) c.globalAlpha *= F.translucent;
  c.rotate(P.lean);
  c.translate(0, P.bob * R);

  /* tail */
  if (F.tail) {
    c.strokeStyle = F.pal.lo;
    c.lineWidth = R * 0.16;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(-R * 0.5, R * 0.45);
    c.quadraticCurveTo(-R * 1.4, R * 0.7, -R * 1.3, -R * 0.1);
    c.stroke();
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.06;
    c.stroke();
  }
  /* wings */
  if (F.wings) {
    const fl = Math.sin(P.flap * 3) * 0.5;
    for (const s of [-1, 1]) {
      c.save();
      c.scale(s, 1);
      c.rotate(fl * s * 0.5 - 0.2);
      const g = c.createLinearGradient(0, -R, R * 1.6, 0);
      g.addColorStop(0, F.pal.mid);
      g.addColorStop(1, F.pal.lo);
      c.fillStyle = g;
      c.strokeStyle = OUT;
      c.lineWidth = R * 0.09;
      c.beginPath();
      c.moveTo(R * 0.2, -R * 0.3);
      c.quadraticCurveTo(R * 1.7, -R * 1.15, R * 1.85, -R * 0.05);
      c.quadraticCurveTo(R * 1.35, -R * 0.1, R * 1.15, R * 0.28);
      c.quadraticCurveTo(R * 0.8, R * 0.05, R * 0.45, R * 0.3);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
  }
  /* spider limbs */
  if (F.spider) {
    for (const s of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const y0 = -R * 0.1 + i * R * 0.3;
        const tipX = s * (R * 1.5 + i * R * 0.15);
        const tipY = y0 + R * 0.75;
        c.strokeStyle = F.pal.lo;
        c.lineWidth = R * 0.11;
        c.lineCap = 'round';
        c.beginPath();
        c.moveTo(s * R * 0.5, y0);
        c.quadraticCurveTo(s * R * 1.35, y0 - R * 0.35, tipX, tipY);
        c.stroke();
        c.strokeStyle = OUT;
        c.lineWidth = R * 0.04;
        c.stroke();
      }
    }
  }
  /* legs */
  const legTop = R * 0.55;
  for (const [side, ph] of [[-1, P.legA], [1, P.legB]] as [number, number][]) {
    const hx = side * R * 0.34;
    const fx = hx + Math.sin(ph) * R * 0.5;
    const fy = legTop + R * 0.55 - Math.abs(Math.sin(ph)) * R * 0.12;
    capsule(c, hx, legTop - R * 0.15, fx, fy, R * 0.3, F.pal.mid, F.pal.lo);
    /* foot */
    c.fillStyle = F.pal.lo;
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.08;
    c.beginPath();
    c.ellipse(fx + side * R * 0.05, fy + R * 0.05, R * 0.22, R * 0.13, 0, 0, TAU);
    c.fill();
    c.stroke();
  }
  /* torso */
  const rx = F.fat ? 1.22 : 1;
  sphere(c, 0, 0, R, F.pal.hi, F.pal.mid, F.pal.lo, rx, P.sq);
  /* robe */
  if (F.robe) {
    const rc = F.pal.cloth ?? '#4a2f6b';
    c.save();
    c.beginPath();
    c.moveTo(-R * 0.95 * rx, -R * 0.15);
    c.quadraticCurveTo(0, -R * 0.45, R * 0.95 * rx, -R * 0.15);
    c.lineTo(R * 1.05 * rx, R * 0.85);
    for (let i = 3; i >= -3; i--) {
      c.quadraticCurveTo(i * R * 0.3, R * (1.0 + (i % 2 ? 0.12 : -0.05)), (i - 0.5) * R * 0.3, R * 0.9);
    }
    c.lineTo(-R * 1.05 * rx, R * 0.85);
    c.closePath();
    const rg = c.createLinearGradient(0, -R * 0.3, 0, R);
    rg.addColorStop(0, rc);
    rg.addColorStop(1, '#1c0e2c');
    c.fillStyle = rg;
    c.fill();
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.09;
    c.stroke();
    c.restore();
  }
  /* back spikes */
  if (F.spikes) {
    c.fillStyle = F.pal.horn ?? F.pal.lo;
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.07;
    for (let i = 0; i < 4; i++) {
      const a = -Math.PI / 2 + (i - 1.5) * 0.42;
      const bx = Math.cos(a) * R * 0.9;
      const by = Math.sin(a) * R * 0.9 * P.sq;
      c.beginPath();
      c.moveTo(bx - R * 0.12, by);
      c.lineTo(bx + Math.cos(a) * R * 0.45, by + Math.sin(a) * R * 0.45);
      c.lineTo(bx + R * 0.12, by);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  /* arms + equipment */
  const arms: [number, number, boolean][] = [
    [-1, P.armB, false],
    [1, P.armA, true],
  ];
  for (const [side, ang, main] of arms) {
    const sx0 = side * R * 0.78 * rx;
    const sy0 = -R * 0.12;
    const hx = sx0 + Math.sin(ang) * R * 0.62 * side;
    const hy = sy0 + Math.cos(ang) * R * 0.62;
    capsule(c, sx0, sy0, hx, hy, R * 0.26, F.pal.hi, F.pal.lo);
    /* hand */
    c.fillStyle = F.pal.mid;
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.07;
    c.beginPath();
    c.arc(hx, hy, R * 0.15, 0, TAU);
    c.fill();
    c.stroke();
    if (main) {
      if (F.cleaver) {
        c.save();
        c.translate(hx, hy);
        c.rotate(ang * 0.6 + 0.5);
        c.fillStyle = '#8a6a4a';
        rrPath(c, -R * 0.06, -R * 0.1, R * 0.9, R * 0.14, R * 0.06);
        c.fill();
        c.strokeStyle = OUT; c.lineWidth = R * 0.06; c.stroke();
        const bg = c.createLinearGradient(0, -R * 0.6, 0, 0);
        bg.addColorStop(0, '#e8eef6');
        bg.addColorStop(1, '#8fa3b8');
        c.fillStyle = bg;
        c.beginPath();
        c.moveTo(R * 0.5, -R * 0.05);
        c.lineTo(R * 1.15, -R * 0.1);
        c.quadraticCurveTo(R * 1.25, -R * 0.55, R * 0.75, -R * 0.62);
        c.lineTo(R * 0.45, -R * 0.5);
        c.closePath();
        c.fill();
        c.stroke();
        c.restore();
      } else if (F.staff) {
        c.save();
        c.translate(hx, hy);
        c.rotate(0.12);
        c.fillStyle = '#6b4a2e';
        c.strokeStyle = OUT;
        c.lineWidth = R * 0.06;
        rrPath(c, -R * 0.06, -R * 1.5, R * 0.12, R * 2.1, R * 0.06);
        c.fill(); c.stroke();
        sphere(c, 0, -R * 1.55, R * 0.24, '#d8ffd0', '#69c94e', '#2a6b1e');
        glowDot(c, 0, -R * 1.55, R * 0.16, '#9be85e');
        c.restore();
      } else if (F.bow) {
        c.save();
        c.translate(hx + R * 0.2, hy);
        c.rotate(0.1);
        c.strokeStyle = '#8a6a3d';
        c.lineWidth = R * 0.1;
        c.beginPath();
        c.arc(0, 0, R * 0.75, -1.25, 1.25);
        c.stroke();
        c.strokeStyle = 'rgba(240,235,220,0.85)';
        c.lineWidth = R * 0.03;
        c.beginPath();
        c.moveTo(Math.cos(-1.25) * R * 0.75, Math.sin(-1.25) * R * 0.75);
        c.lineTo(Math.cos(1.25) * R * 0.75, Math.sin(1.25) * R * 0.75);
        c.stroke();
        c.restore();
      } else if (F.sack) {
        sphere(c, hx + R * 0.1, hy - R * 0.35, R * 0.5, '#e8b64d', '#b07a2e', '#6b4416');
        c.strokeStyle = '#6b4416';
        c.lineWidth = R * 0.07;
        c.beginPath();
        c.moveTo(hx - R * 0.2, hy - R * 0.72);
        c.lineTo(hx + R * 0.4, hy - R * 0.72);
        c.stroke();
      }
    } else if (F.shield) {
      c.save();
      c.translate(hx - R * 0.15, hy);
      const sg = c.createLinearGradient(-R * 0.5, 0, R * 0.4, 0);
      sg.addColorStop(0, '#aebfd2');
      sg.addColorStop(0.5, '#6b7d92');
      sg.addColorStop(1, '#3d4a59');
      c.fillStyle = sg;
      c.strokeStyle = OUT;
      c.lineWidth = R * 0.09;
      rrPath(c, -R * 0.5, -R * 0.8, R * 0.55, R * 1.6, R * 0.2);
      c.fill();
      c.stroke();
      c.fillStyle = '#8a5a2b';
      c.beginPath();
      c.arc(-R * 0.22, 0, R * 0.16, 0, TAU);
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = R * 0.05;
      c.stroke();
      c.restore();
    }
  }
  /* head */
  const hy = -R * 0.92 * P.sq;
  const hr = R * 0.62;
  sphere(c, 0, hy, hr, F.pal.hi, F.pal.mid, F.pal.lo, 1, 1 / Math.max(0.6, P.sq));
  /* horns */
  if (F.horns === 'straight' || F.horns === 'curl') {
    const hc = F.pal.horn ?? '#e8e0cc';
    for (const s of [-1, 1]) {
      c.fillStyle = hc;
      c.strokeStyle = OUT;
      c.lineWidth = R * 0.07;
      c.beginPath();
      if (F.horns === 'straight') {
        c.moveTo(s * hr * 0.55, hy - hr * 0.55);
        c.lineTo(s * hr * 0.95, hy - hr * 1.5);
        c.lineTo(s * hr * 0.15, hy - hr * 0.85);
      } else {
        c.moveTo(s * hr * 0.6, hy - hr * 0.4);
        c.quadraticCurveTo(s * hr * 1.5, hy - hr * 0.9, s * hr * 1.05, hy - hr * 1.65);
        c.quadraticCurveTo(s * hr * 1.0, hy - hr * 0.8, s * hr * 0.25, hy - hr * 0.6);
      }
      c.closePath();
      c.fill();
      c.stroke();
    }
  } else if (F.horns === 'crown') {
    const hc = F.pal.horn ?? '#e8e0cc';
    c.fillStyle = hc;
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.06;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i - 2) * 0.38;
      c.beginPath();
      c.moveTo(Math.cos(a - 0.14) * hr * 0.95, hy + Math.sin(a - 0.14) * hr * 0.95);
      c.lineTo(Math.cos(a) * hr * 1.7, hy + Math.sin(a) * hr * 1.7);
      c.lineTo(Math.cos(a + 0.14) * hr * 0.95, hy + Math.sin(a + 0.14) * hr * 0.95);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  if (F.ears) {
    for (const s of [-1, 1]) {
      c.fillStyle = F.pal.mid;
      c.strokeStyle = OUT;
      c.lineWidth = R * 0.06;
      c.beginPath();
      c.moveTo(s * hr * 0.75, hy - hr * 0.35);
      c.lineTo(s * hr * 1.6, hy - hr * 0.85);
      c.lineTo(s * hr * 0.95, hy + hr * 0.15);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
  /* hood */
  if (F.hood) {
    const rc = F.pal.cloth ?? '#3a2354';
    c.fillStyle = rc;
    c.strokeStyle = OUT;
    c.lineWidth = R * 0.09;
    c.beginPath();
    c.arc(0, hy - hr * 0.1, hr * 1.18, Math.PI * 0.95, Math.PI * 2.05);
    c.quadraticCurveTo(hr * 0.9, hy + hr * 0.75, 0, hy + hr * 0.55);
    c.quadraticCurveTo(-hr * 0.9, hy + hr * 0.75, -hr * 1.12, hy + hr * 0.15);
    c.closePath();
    c.fill();
    c.stroke();
    /* face shadow inside hood */
    c.fillStyle = 'rgba(10,4,18,0.85)';
    c.beginPath();
    c.arc(0, hy, hr * 0.82, 0, TAU);
    c.fill();
  }
  return { hy, hr };
}

function demonFace(
  c: CanvasRenderingContext2D, hy: number, hr: number, eye: string,
  opts: { tusks?: boolean; grim?: boolean; jaw?: number } = {},
) {
  glowDot(c, -hr * 0.34, hy - hr * 0.05, hr * 0.16, eye);
  glowDot(c, hr * 0.34, hy - hr * 0.05, hr * 0.16, eye);
  /* mouth */
  c.strokeStyle = 'rgba(12,4,22,0.9)';
  c.lineWidth = hr * 0.1;
  c.lineCap = 'round';
  c.beginPath();
  if (opts.jaw) {
    c.ellipse(0, hy + hr * 0.42, hr * 0.3, hr * 0.22 * opts.jaw, 0, 0, TAU);
    c.fillStyle = 'rgba(12,4,22,0.9)';
    c.fill();
  } else if (opts.grim) {
    c.moveTo(-hr * 0.3, hy + hr * 0.45);
    c.lineTo(hr * 0.3, hy + hr * 0.38);
    c.stroke();
  } else {
    c.arc(0, hy + hr * 0.28, hr * 0.28, 0.25, Math.PI - 0.25);
    c.stroke();
  }
  if (opts.tusks) {
    c.fillStyle = '#f4e8cf';
    c.strokeStyle = OUT;
    c.lineWidth = hr * 0.05;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * hr * 0.28, hy + hr * 0.42);
      c.lineTo(s * hr * 0.2, hy + hr * 0.72);
      c.lineTo(s * hr * 0.42, hy + hr * 0.45);
      c.closePath();
      c.fill();
      c.stroke();
    }
  }
}

/* --------------------------- sheet baking -------------------------------- */

type Painter = (c: CanvasRenderingContext2D, f: number, n: number) => void;
type ClipSpec = [name: string, frames: number, fps: number, loop: boolean, paint: Painter];

function bakeSheet(id: string, fw: number, fh: number, clips: ClipSpec[]) {
  const maxF = Math.max(...clips.map((c) => c[1]));
  const rows = clips.length;
  const cv = document.createElement('canvas');
  cv.width = fw * maxF;
  cv.height = fh * rows;
  const c = cv.getContext('2d')!;
  const rec: Record<string, Clip> = {};
  clips.forEach(([name, frames, fps, loop, paint], row) => {
    rec[name] = { name, y: row * fh, frames, fps, loop };
    for (let f = 0; f < frames; f++) {
      c.save();
      c.translate(f * fw + fw / 2, row * fh + fh / 2);
      paint(c, f, frames);
      c.restore();
    }
  });
  sheets.set(id, { fw, fh, canvas: cv, clips: rec });
}

/* ------------------------- enemy sheet factory ---------------------------- */

interface EnemyLook {
  feat: Feat;
  face?: (c: CanvasRenderingContext2D, hy: number, hr: number, f: number, n: number, pose: Pose) => void;
  overlay?: (c: CanvasRenderingContext2D, pose: Pose, f: number, n: number, clip: string) => void;
  custom?: (c: CanvasRenderingContext2D, pose: Pose, f: number, n: number) => void;
}

const ENEMY_LOOKS: Record<string, EnemyLook> = {
  risen: {
    feat: { r: 15, pal: { hi: '#a8d878', mid: '#7cb356', lo: '#3d6b28', eye: '#e8ff9b', cloth: '#5c4630' }, robe: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#e8ff9b', { grim: true }),
  },
  clatter: {
    feat: { r: 13, pal: { hi: '#fff8e8', mid: '#e8e0cc', lo: '#9b927a', eye: '#7fd4e8' }, horns: 'none' },
    face: (c, hy, hr) => {
      c.fillStyle = '#120a1c';
      c.beginPath();
      c.arc(-hr * 0.32, hy - hr * 0.05, hr * 0.2, 0, TAU);
      c.arc(hr * 0.32, hy - hr * 0.05, hr * 0.2, 0, TAU);
      c.fill();
      c.fillRect(-hr * 0.3, hy + hr * 0.32, hr * 0.6, hr * 0.16);
      c.strokeStyle = '#120a1c';
      c.lineWidth = hr * 0.05;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(i * hr * 0.12, hy + hr * 0.32);
        c.lineTo(i * hr * 0.12, hy + hr * 0.48);
        c.stroke();
      }
    },
  },
  imp: {
    feat: { r: 12, pal: { hi: '#ffc07a', mid: '#ff9d4d', lo: '#a04d1e', eye: '#fff2b0', horn: '#7a3a16' }, horns: 'curl', tail: true, tusks: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#fff2b0', { tusks: true }),
  },
  bat: {
    feat: { r: 10, pal: { hi: '#c0a0f0', mid: '#9b7bd8', lo: '#4d3480', eye: '#ff6b7d' }, wings: true, ears: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ff6b7d', { jaw: 1 }),
  },
  spitter: {
    feat: { r: 15, pal: { hi: '#d0f08a', mid: '#a4d94e', lo: '#4d7d24', eye: '#ffffff' }, fat: true, horns: 'none' },
    face: (c, hy, hr, f, n, P) => {
      demonFace(c, hy, hr, '#ffffff');
      const open = 0.2 + Math.max(0, Math.sin((f / n) * TAU)) * 0.5;
      c.fillStyle = '#3d5c14';
      c.strokeStyle = OUT;
      c.lineWidth = hr * 0.07;
      c.beginPath();
      c.arc(0, hy + hr * 0.5, hr * 0.34 * open + hr * 0.08, 0, TAU);
      c.fill();
      c.stroke();
      void P;
    },
    overlay: (c, P, f, n) => {
      /* pustules */
      c.fillStyle = '#6f9c2f';
      for (let i = 0; i < 4; i++) {
        const a = i * 1.9 + 0.5;
        c.beginPath();
        c.arc(Math.cos(a) * 8, Math.sin(a) * 6 + 2, 3.4, 0, TAU);
        c.fill();
      }
      void P; void f; void n;
    },
  },
  goatkin: {
    feat: { r: 16, pal: { hi: '#e8b070', mid: '#c9803f', lo: '#6b3d1a', eye: '#ffe14d', horn: '#f4e8cf' }, horns: 'straight', ears: true, tail: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffe14d', { grim: true, tusks: true }),
  },
  shieldkin: {
    feat: { r: 17, pal: { hi: '#b8c8d8', mid: '#8fa3b8', lo: '#4d5c6b', eye: '#ffd23d', cloth: '#3d4a3d' }, robe: true, shield: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffd23d', { grim: true }),
  },
  archer: {
    feat: { r: 14, pal: { hi: '#f0e8d0', mid: '#d8cfae', lo: '#8a7d5a', eye: '#ff9d4d', cloth: '#4a3d2e' }, robe: true, hood: true, bow: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ff9d4d'),
  },
  ghoul: {
    feat: { r: 14, pal: { hi: '#e8d0a0', mid: '#c9a86b', lo: '#6b5230', eye: '#ffd23d' }, horns: 'none' },
    face: (c, hy, hr) => {
      c.fillStyle = '#120a1c';
      c.beginPath();
      c.arc(-hr * 0.3, hy - hr * 0.08, hr * 0.16, 0, TAU);
      c.arc(hr * 0.3, hy - hr * 0.08, hr * 0.16, 0, TAU);
      c.fill();
      c.strokeStyle = '#120a1c';
      c.lineWidth = hr * 0.07;
      c.beginPath();
      for (let i = -2; i <= 2; i++) c.lineTo(i * hr * 0.16, hy + hr * 0.4 + (i % 2 ? hr * 0.12 : 0));
      c.stroke();
    },
  },
  wraith: {
    feat: { r: 14, pal: { hi: '#e0f6ff', mid: '#9fd8e8', lo: '#3d7d92', eye: '#7fd4e8', cloth: '#2a5c6b' }, robe: true, translucent: 0.85, horns: 'none' },
    face: (c, hy, hr) => {
      c.fillStyle = '#0f3d4d';
      c.beginPath();
      c.ellipse(-hr * 0.3, hy - hr * 0.05, hr * 0.14, hr * 0.24, 0, 0, TAU);
      c.ellipse(hr * 0.3, hy - hr * 0.05, hr * 0.14, hr * 0.24, 0, 0, TAU);
      c.fill();
      glowDot(c, -hr * 0.3, hy - hr * 0.05, hr * 0.08, '#7fd4e8');
      glowDot(c, hr * 0.3, hy - hr * 0.05, hr * 0.08, '#7fd4e8');
    },
  },
  hexer: {
    feat: { r: 15, pal: { hi: '#9b7bd8', mid: '#7d5bb0', lo: '#3d2460', eye: '#c07bff', cloth: '#5c3d8f', horn: '#c07bff' }, robe: true, hood: true, staff: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#c07bff'),
    overlay: (c, P, f, n, clip) => {
      if (clip === 'cast') {
        const t = f / Math.max(1, n - 1);
        glowDot(c, 0, -24 - t * 8, 6 + t * 6, '#c07bff');
      }
      void P;
    },
  },
  brute: {
    feat: { r: 26, pal: { hi: '#f08a70', mid: '#d95f4d', lo: '#7a2a20', eye: '#ffd23d', horn: '#8c3a2e' }, fat: true, horns: 'straight', tusks: true, spikes: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffd23d', { tusks: true, grim: true }),
  },
  goblin: {
    feat: { r: 13, pal: { hi: '#8ae08a', mid: '#4dbb5f', lo: '#1e6b30', eye: '#ffd23d' }, ears: true, sack: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffd23d', { jaw: 0.8 }),
  },
  butcher: {
    feat: { r: 40, pal: { hi: '#f0889a', mid: '#e05a6a', lo: '#7d1f33', eye: '#ffd23d', horn: '#8c2f3d', cloth: '#8a6a4a' }, fat: true, horns: 'curl', tusks: true, cleaver: true, robe: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffd23d', { tusks: true, jaw: 1 }),
  },
  andariel: {
    feat: { r: 42, pal: { hi: '#c0f090', mid: '#8fd94e', lo: '#3d7d24', eye: '#e8ffb0', horn: '#4d7d24' }, spider: true, horns: 'crown', tusks: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#e8ffb0', { tusks: true, jaw: 0.7 }),
  },
  baal: {
    feat: { r: 44, pal: { hi: '#d8f0ff', mid: '#7fd4e8', lo: '#2a6b8c', eye: '#0f4c5c', horn: '#e8f6ff' }, horns: 'curl', spikes: true, tail: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#bfeaff', { grim: true }),
  },
  terrorlord: {
    feat: { r: 48, pal: { hi: '#e08af0', mid: '#c04de0', lo: '#5c1670', eye: '#ff3d3d', horn: '#f4e8cf' }, horns: 'crown', wings: true, tail: true, tusks: true },
    face: (c, hy, hr) => {
      c.fillStyle = '#ff3d3d';
      c.beginPath();
      c.ellipse(-hr * 0.32, hy - hr * 0.08, hr * 0.18, hr * 0.1, -0.3, 0, TAU);
      c.ellipse(hr * 0.32, hy - hr * 0.08, hr * 0.18, hr * 0.1, 0.3, 0, TAU);
      c.fill();
      glowDot(c, -hr * 0.32, hy - hr * 0.08, hr * 0.1, '#ff3d3d');
      glowDot(c, hr * 0.32, hy - hr * 0.08, hr * 0.1, '#ff3d3d');
      demonFace(c, hy, hr, '#ff3d3d', { tusks: true });
    },
  },
  cinder: {
    feat: { r: 12, pal: { hi: '#ffb08a', mid: '#ff6b3d', lo: '#8c2410', eye: '#ffe14d', horn: '#5c1608' }, fat: true, horns: 'straight', tusks: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffe14d', { jaw: 0.9 }),
    overlay: (c, _P, f, n) => {
      const t = 0.5 + Math.sin((f / n) * TAU * 2) * 0.5;
      const g = c.createRadialGradient(0, 6, 1, 0, 6, 14);
      g.addColorStop(0, `rgba(255,240,180,${0.5 + t * 0.5})`);
      g.addColorStop(1, 'rgba(255,100,40,0)');
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 6, 14, 0, TAU);
      c.fill();
      c.restore();
    },
  },
  caller: {
    feat: { r: 16, pal: { hi: '#e8e0cc', mid: '#c9bfa8', lo: '#6b6350', eye: '#9be85e', cloth: '#4a4238', horn: '#c9bfa8' }, robe: true, hood: true, staff: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#9be85e'),
  },
  worm: {
    feat: { r: 16, pal: { hi: '#d8b088', mid: '#b08968', lo: '#5c4226', eye: '#ffd23d' }, horns: 'none' },
    custom: (c, P, f, n) => {
      const und = Math.sin((f / n) * TAU + P.flap) * 3;
      /* tail segments */
      for (let i = 3; i >= 1; i--) {
        sphere(c, -i * 9 + und * (i * 0.25), 6 - i * 1.5, 11 - i * 1.6, '#d8b088', '#b08968', '#5c4226', 1, 0.92);
      }
      /* head */
      sphere(c, 2 + und * 0.4, -4, 13, '#e8c8a0', '#c9a075', '#6b4c2c');
      /* maw */
      c.fillStyle = '#3d1c10';
      c.strokeStyle = OUT;
      c.lineWidth = 2.4;
      c.beginPath();
      c.ellipse(7 + und * 0.4, -6, 6.5, 7.5, 0, 0, TAU);
      c.fill();
      c.stroke();
      c.fillStyle = '#f4e8cf';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        const tx = 7 + Math.cos(a) * 5 + und * 0.4;
        const ty = -6 + Math.sin(a) * 6;
        c.beginPath();
        c.moveTo(tx - 1.6, ty);
        c.lineTo(tx + Math.cos(a) * 3.2, ty + Math.sin(a) * 3.2);
        c.lineTo(tx + 1.6, ty);
        c.closePath();
        c.fill();
      }
      glowDot(c, -2, -12, 2.4, '#ffd23d');
      glowDot(c, 4, -13, 2.4, '#ffd23d');
    },
  },
  knight: {
    feat: { r: 18, pal: { hi: '#d8707c', mid: '#b8434f', lo: '#5c1620', eye: '#ff6b4d', horn: '#3d3d4d', cloth: '#3d3d4d' }, horns: 'straight', shield: true, tusks: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ff6b4d', { tusks: true, grim: true }),
  },
  shade: {
    feat: { r: 14, pal: { hi: '#e8f6ff', mid: '#a8d8e8', lo: '#3d7d92', eye: '#7fd4e8', cloth: '#2a5c7d' }, robe: true, hood: true, translucent: 0.8, horns: 'none' },
    face: (c, hy, hr) => {
      glowDot(c, -hr * 0.3, hy, hr * 0.1, '#bfeaff');
      glowDot(c, hr * 0.3, hy, hr * 0.1, '#bfeaff');
    },
  },
  carrier: {
    feat: { r: 19, pal: { hi: '#f0e0a0', mid: '#d8c04d', lo: '#7a6420', eye: '#ffffff' }, fat: true, horns: 'none' },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ffffff', { jaw: 0.6 }),
    overlay: (c, _P, f, n) => {
      const t = 0.5 + Math.sin((f / n) * TAU) * 0.5;
      c.fillStyle = '#8a9c2a';
      for (let i = 0; i < 5; i++) {
        const a = i * 1.4 + 0.7;
        const pr = 3 + (i % 3) + t * 1.5;
        c.beginPath();
        c.arc(Math.cos(a) * 10, Math.sin(a) * 8 + 2, pr, 0, TAU);
        c.fill();
      }
    },
  },
  bloodraven: {
    feat: { r: 26, pal: { hi: '#e88a95', mid: '#c04d5c', lo: '#4d1018', eye: '#ff3d3d', horn: '#2a0a10' }, wings: true, ears: true, horns: 'crown', tusks: true },
    face: (c, hy, hr) => demonFace(c, hy, hr, '#ff3d3d', { tusks: true, jaw: 0.8 }),
  },
  bonetyrant: {
    feat: { r: 30, pal: { hi: '#fff8e8', mid: '#e8e0cc', lo: '#8a8064', eye: '#9be85e', horn: '#f4e8cf', cloth: '#5c1620' }, horns: 'crown', robe: true },
    face: (c, hy, hr) => {
      c.fillStyle = '#120a1c';
      c.beginPath();
      c.arc(-hr * 0.3, hy - hr * 0.08, hr * 0.2, 0, TAU);
      c.arc(hr * 0.3, hy - hr * 0.08, hr * 0.2, 0, TAU);
      c.fill();
      glowDot(c, -hr * 0.3, hy - hr * 0.08, hr * 0.09, '#9be85e');
      glowDot(c, hr * 0.3, hy - hr * 0.08, hr * 0.09, '#9be85e');
      c.fillStyle = '#120a1c';
      c.fillRect(-hr * 0.3, hy + hr * 0.3, hr * 0.6, hr * 0.18);
    },
  },
};

export const SPR_R: Record<string, number> = {
  risen: 15, clatter: 13, imp: 12, bat: 10, spitter: 15, goatkin: 16, shieldkin: 17,
  archer: 14, ghoul: 14, wraith: 14, hexer: 15, brute: 26, goblin: 13,
  cinder: 11, caller: 15, worm: 16, knight: 17, shade: 13, carrier: 18,
  bloodraven: 24, bonetyrant: 28,
  butcher: 40, andariel: 42, baal: 44, terrorlord: 48,
};

const RANGED = new Set(['spitter', 'hexer', 'archer', 'caller']);
const BOSSES = new Set(['butcher', 'andariel', 'baal', 'terrorlord', 'bloodraven', 'bonetyrant']);

function enemyClips(skin: SkinId): ClipSpec[] {
  const look = ENEMY_LOOKS[skin];
  const paintWith = (poseFn: (f: number, n: number) => Pose, clipName: string): Painter =>
    (c, f, n) => {
      const P = poseFn(f, n);
      if (look.custom) {
        look.custom(c, P, f, n);
        return;
      }
      const { hy, hr } = demon(c, P, look.feat);
      if (look.face) look.face(c, hy, hr, f, n, P);
      else demonFace(c, hy, hr, look.feat.pal.eye);
      if (look.overlay) look.overlay(c, P, f, n, clipName);
    };
  const clips: ClipSpec[] = [
    ['idle', 4, 5, true, paintWith(poseIdle, 'idle')],
    ['walk', 6, 9, true, paintWith(poseWalk, 'walk')],
    ['attack', 5, 13, false, paintWith(poseAttack, 'attack')],
    ['hurt', 3, 15, false, paintWith(poseHurt, 'hurt')],
    ['die', 6, 11, false, paintWith(poseDie, 'die')],
  ];
  if (RANGED.has(skin) || BOSSES.has(skin)) clips.splice(3, 0, ['cast', 5, 11, false, paintWith(poseCast, 'cast')]);
  if (skin === 'goatkin' || skin === 'knight') clips.splice(3, 0, ['charge', 4, 12, true, paintWith((f, n) => { const p = poseWalk(f, n, true); p.lean = 0.42; p.armA = -1.4; p.armB = -1.1; return p; }, 'charge')]);
  return clips;
}

/* ----------------------------- player sheets ------------------------------ */

const CLASS_LOOK: Record<ClassId, { skin: Pal; trim: string; cape: string; eye: string }> = {
  barbarian: { skin: { hi: '#e8b088', mid: '#c98a5f', lo: '#6b4426', eye: '#ff6b4d' }, trim: '#8c2f2f', cape: '#a03030', eye: '#ff6b4d' },
  necromancer: { skin: { hi: '#e8e0d0', mid: '#c9bfa8', lo: '#6b6350', eye: '#9be85e' }, trim: '#3d6b28', cape: '#2a4d1e', eye: '#9be85e' },
  sorceress: { skin: { hi: '#f0d0b8', mid: '#d8a888', lo: '#7a4d33', eye: '#7fd4e8' }, trim: '#2a6b8c', cape: '#1e4d6b', eye: '#7fd4e8' },
  paladin: { skin: { hi: '#f0e0c0', mid: '#d8c090', lo: '#7a6038', eye: '#ffc258' }, trim: '#c9a03d', cape: '#8c6a1e', eye: '#ffc258' },
};

function heroPainter(cls: ClassId, poseFn: (f: number, n: number) => Pose, clip: string): Painter {
  return (c, f, n) => {
    const L = CLASS_LOOK[cls];
    const P = poseFn(f, n);
    const R = 17;
    const t = n > 1 ? f / (n - 1) : 0;
    c.rotate(P.lean);
    c.translate(0, P.bob * R);
    /* cape */
    c.save();
    c.fillStyle = L.cape;
    c.strokeStyle = OUT;
    c.lineWidth = 2.6;
    c.beginPath();
    c.moveTo(-R * 0.55, -R * 0.5);
    c.quadraticCurveTo(-R * 1.0 - P.lean * 20, R * 0.55, -R * 0.5 + Math.sin(P.flap) * 3, R * 1.05);
    c.lineTo(R * 0.5 + Math.sin(P.flap + 1) * 3, R * 1.05);
    c.quadraticCurveTo(R * 1.0 - P.lean * 20, R * 0.5, R * 0.55, -R * 0.5);
    c.closePath();
    c.fill();
    c.stroke();
    c.restore();
    /* legs */
    for (const [side, ph] of [[-1, P.legA], [1, P.legB]] as [number, number][]) {
      const hx = side * R * 0.26;
      const fx = hx + Math.sin(ph) * R * 0.55;
      const fy = R * 0.62 + R * 0.42 - Math.abs(Math.sin(ph)) * R * 0.16;
      capsule(c, hx, R * 0.35, fx, fy, R * 0.26, '#4d3a2e', '#241a14');
      c.fillStyle = '#3d2e22';
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(fx + side * 2, fy + 2, R * 0.2, R * 0.12, 0, 0, TAU);
      c.fill();
      c.stroke();
    }
    /* torso */
    if (cls === 'barbarian') {
      sphere(c, 0, -R * 0.05, R * 0.72, L.skin.hi, L.skin.mid, L.skin.lo, 1.15, P.sq);
      /* fur pauldrons */
      for (const s of [-1, 1]) {
        c.fillStyle = '#8a6a4a';
        c.strokeStyle = OUT;
        c.lineWidth = 2.2;
        c.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = Math.PI + (i / 4) * Math.PI;
          c.lineTo(s * R * 0.62 + Math.cos(a) * R * 0.34, -R * 0.42 + Math.sin(a) * R * 0.3 - (i % 2 ? 3 : 0));
        }
        c.closePath();
        c.fill();
        c.stroke();
      }
      /* belt */
      c.fillStyle = '#5c3d24';
      rrPath(c, -R * 0.62, R * 0.42, R * 1.24, R * 0.22, 4);
      c.fill();
      c.strokeStyle = OUT; c.lineWidth = 2; c.stroke();
      c.fillStyle = '#ffc258';
      c.fillRect(-R * 0.1, R * 0.44, R * 0.2, R * 0.18);
    } else if (cls === 'paladin') {
      /* plate torso */
      sphere(c, 0, -R * 0.05, R * 0.72, '#e8eef6', '#aebfd2', '#5c6b7d', 1.08, P.sq);
      /* gold tabard */
      c.fillStyle = '#c9a03d';
      c.strokeStyle = OUT;
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(-R * 0.28, -R * 0.4);
      c.lineTo(R * 0.28, -R * 0.4);
      c.lineTo(R * 0.34, R * 0.72);
      c.lineTo(0, R * 0.88);
      c.lineTo(-R * 0.34, R * 0.72);
      c.closePath();
      c.fill();
      c.stroke();
      /* cross emblem */
      c.fillStyle = '#fff6dd';
      c.fillRect(-R * 0.07, -R * 0.24, R * 0.14, R * 0.6);
      c.fillRect(-R * 0.2, -R * 0.06, R * 0.4, R * 0.14);
      /* pauldrons */
      for (const s of [-1, 1]) {
        sphere(c, s * R * 0.62, -R * 0.36, R * 0.26, '#f4f8fc', '#aebfd2', '#5c6b7d');
      }
    } else {
      /* robe torso */
      const rc = cls === 'necromancer' ? '#3a4d33' : '#2a5c7d';
      c.save();
      c.beginPath();
      c.moveTo(-R * 0.6, -R * 0.55);
      c.quadraticCurveTo(0, -R * 0.8, R * 0.6, -R * 0.55);
      c.lineTo(R * 0.72, R * 0.75);
      c.quadraticCurveTo(0, R * 0.95, -R * 0.72, R * 0.75);
      c.closePath();
      const rg = c.createLinearGradient(-R * 0.4, -R * 0.5, R * 0.5, R * 0.7);
      rg.addColorStop(0, cls === 'necromancer' ? '#4d6b42' : '#3d7da0');
      rg.addColorStop(1, rc);
      c.fillStyle = rg;
      c.fill();
      c.strokeStyle = OUT;
      c.lineWidth = 2.6;
      c.stroke();
      /* trim sash */
      c.strokeStyle = L.trim;
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(-R * 0.5, -R * 0.3);
      c.lineTo(R * 0.45, R * 0.55);
      c.stroke();
      c.restore();
    }
    /* arms + weapon */
    const swing = clip === 'attack' ? t : 0;
    const armAng = cls === 'barbarian' && clip === 'attack'
      ? -2.5 + swing * 3.9
      : P.armA;
    const shoulder = { x: R * 0.5, y: -R * 0.28 };
    const hand = {
      x: shoulder.x + Math.sin(armAng) * R * 0.62,
      y: shoulder.y + Math.cos(armAng) * R * 0.62,
    };
    const hand2 = {
      x: -R * 0.5 + Math.sin(P.armB) * R * 0.5,
      y: -R * 0.28 + Math.cos(P.armB) * R * 0.55,
    };
    /* back arm */
    capsule(c, -R * 0.5, -R * 0.28, hand2.x, hand2.y, R * 0.2, L.skin.hi, L.skin.lo);
    if (cls === 'necromancer') {
      /* staff in back hand */
      c.save();
      c.translate(hand2.x, hand2.y);
      c.rotate(-0.18 + P.lean * 0.5 + (clip === 'attack' ? Math.sin(swing * Math.PI) * 0.9 : 0));
      c.fillStyle = '#d8cfae';
      c.strokeStyle = OUT;
      c.lineWidth = 2.2;
      rrPath(c, -2.4, -R * 1.75, 4.8, R * 2.5, 2.4);
      c.fill(); c.stroke();
      sphere(c, 0, -R * 1.85, R * 0.26, '#e8ffe0', '#9be85e', '#3d6b28');
      glowDot(c, 0, -R * 1.85, R * 0.18, '#9be85e');
      c.restore();
    } else if (cls === 'paladin') {
      /* kite shield on back arm */
      c.save();
      c.translate(hand2.x - 2, hand2.y);
      const sg = c.createLinearGradient(-R * 0.4, 0, R * 0.3, 0);
      sg.addColorStop(0, '#e8eef6');
      sg.addColorStop(0.55, '#aebfd2');
      sg.addColorStop(1, '#5c6b7d');
      c.fillStyle = sg;
      c.strokeStyle = OUT;
      c.lineWidth = 2.2;
      c.beginPath();
      c.moveTo(0, -R * 0.55);
      c.quadraticCurveTo(R * 0.45, -R * 0.45, R * 0.4, 0);
      c.quadraticCurveTo(R * 0.35, R * 0.5, 0, R * 0.7);
      c.quadraticCurveTo(-R * 0.35, R * 0.5, -R * 0.4, 0);
      c.quadraticCurveTo(-R * 0.45, -R * 0.45, 0, -R * 0.55);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#c9a03d';
      c.fillRect(-R * 0.06, -R * 0.3, R * 0.12, R * 0.62);
      c.fillRect(-R * 0.18, -R * 0.1, R * 0.36, R * 0.12);
      c.restore();
    }
    /* front arm */
    capsule(c, shoulder.x, shoulder.y, hand.x, hand.y, R * 0.22, L.skin.hi, L.skin.lo);
    c.fillStyle = L.skin.mid;
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(hand.x, hand.y, R * 0.15, 0, TAU);
    c.fill();
    c.stroke();
    if (cls === 'barbarian') {
      /* great axe */
      c.save();
      c.translate(hand.x, hand.y);
      c.rotate(armAng * 0.7 + 0.7);
      c.fillStyle = '#6b4a2e';
      c.strokeStyle = OUT;
      c.lineWidth = 2.2;
      rrPath(c, -2.6, -R * 0.4, 5.2, R * 1.7, 2.6);
      c.fill(); c.stroke();
      const ag = c.createLinearGradient(0, -R * 1.1, 0, -R * 0.3);
      ag.addColorStop(0, '#f0f4fa');
      ag.addColorStop(1, '#8fa3b8');
      c.fillStyle = ag;
      c.beginPath();
      c.moveTo(0, -R * 0.42);
      c.quadraticCurveTo(R * 0.85, -R * 0.62, R * 0.75, -R * 1.15);
      c.quadraticCurveTo(R * 0.2, -R * 0.95, 0, -R * 1.0);
      c.quadraticCurveTo(-R * 0.2, -R * 0.95, -R * 0.75, -R * 1.15);
      c.quadraticCurveTo(-R * 0.85, -R * 0.62, 0, -R * 0.42);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
      if (clip === 'attack' && t > 0.35 && t < 0.7) {
        c.strokeStyle = 'rgba(255,240,220,0.7)';
        c.lineWidth = 3.5;
        c.beginPath();
        c.arc(0, -R * 0.2, R * 1.35, -1.2 + swing * 2.4, -0.4 + swing * 2.4);
        c.stroke();
      }
    } else if (cls === 'sorceress') {
      /* orb */
      const push = clip === 'attack' ? Math.sin(swing * Math.PI) * R * 0.5 : 0;
      const ox = hand.x + R * 0.35 + push;
      const oy = hand.y - R * 0.15;
      const og = c.createRadialGradient(ox - 3, oy - 3, 1, ox, oy, R * 0.42);
      og.addColorStop(0, '#ffffff');
      og.addColorStop(0.4, '#7fd4e8');
      og.addColorStop(1, '#2a6b8c');
      c.fillStyle = og;
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      c.beginPath();
      c.arc(ox, oy, R * 0.34, 0, TAU);
      c.fill();
      c.stroke();
      glowDot(c, ox, oy, R * 0.28 + (clip === 'attack' ? swing * 6 : Math.sin(f * 1.3) * 1.5), '#7fd4e8');
    } else if (cls === 'paladin') {
      /* war hammer */
      const hAng = clip === 'attack' ? -2.2 + swing * 3.6 : armAng * 0.5 + 0.5;
      c.save();
      c.translate(hand.x, hand.y);
      c.rotate(hAng);
      c.fillStyle = '#6b4a2e';
      c.strokeStyle = OUT;
      c.lineWidth = 2.4;
      rrPath(c, -2.8, -R * 0.5, 5.6, R * 1.8, 2.8);
      c.fill();
      c.stroke();
      const hg = c.createLinearGradient(0, -R * 1.2, 0, -R * 0.4);
      hg.addColorStop(0, '#ffe9b0');
      hg.addColorStop(0.5, '#ffc258');
      hg.addColorStop(1, '#c9862a');
      c.fillStyle = hg;
      rrPath(c, -R * 0.45, -R * 1.25, R * 0.9, R * 0.72, R * 0.12);
      c.fill();
      c.stroke();
      c.fillStyle = '#fff6dd';
      c.fillRect(-R * 0.09, -R * 1.15, R * 0.18, R * 0.52);
      c.fillRect(-R * 0.28, -R * 0.98, R * 0.56, R * 0.16);
      glowDot(c, 0, -R * 0.88, R * 0.3 + (clip === 'attack' ? swing * 5 : 0), '#ffc258');
      c.restore();
      if (clip === 'attack' && t > 0.35 && t < 0.7) {
        c.strokeStyle = 'rgba(255,240,200,0.75)';
        c.lineWidth = 3.5;
        c.beginPath();
        c.arc(0, -R * 0.2, R * 1.3, -1.4 + swing * 2.6, -0.5 + swing * 2.6);
        c.stroke();
      }
    }
    /* head */
    const hy = -R * 0.95 * P.sq;
    const hr = R * 0.52;
    if (cls === 'barbarian') {
      sphere(c, 0, hy, hr, L.skin.hi, L.skin.mid, L.skin.lo);
      /* horned helm */
      c.fillStyle = '#6b7d92';
      c.strokeStyle = OUT;
      c.lineWidth = 2.2;
      c.beginPath();
      c.arc(0, hy - hr * 0.15, hr * 1.05, Math.PI, TAU);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = '#e8e0cc';
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(s * hr * 0.7, hy - hr * 0.5);
        c.quadraticCurveTo(s * hr * 1.6, hy - hr * 1.0, s * hr * 1.2, hy - hr * 1.7);
        c.quadraticCurveTo(s * hr * 1.0, hy - hr * 0.9, s * hr * 0.4, hy - hr * 0.7);
        c.closePath();
        c.fill();
        c.stroke();
      }
      c.fillStyle = '#a03030';
      c.fillRect(-hr * 0.9, hy - hr * 0.32, hr * 1.8, hr * 0.24);
      glowDot(c, -hr * 0.3, hy + hr * 0.05, hr * 0.11, L.eye);
      glowDot(c, hr * 0.3, hy + hr * 0.05, hr * 0.11, L.eye);
    } else if (cls === 'paladin') {
      sphere(c, 0, hy, hr, L.skin.hi, L.skin.mid, L.skin.lo);
      /* great helm */
      const hmg = c.createLinearGradient(-hr, 0, hr, 0);
      hmg.addColorStop(0, '#f4f8fc');
      hmg.addColorStop(0.5, '#aebfd2');
      hmg.addColorStop(1, '#6b7d92');
      c.fillStyle = hmg;
      c.strokeStyle = OUT;
      c.lineWidth = 2.4;
      c.beginPath();
      c.arc(0, hy, hr * 1.12, Math.PI * 0.95, Math.PI * 2.05);
      c.lineTo(hr * 1.0, hy + hr * 0.75);
      c.lineTo(-hr * 1.0, hy + hr * 0.75);
      c.closePath();
      c.fill();
      c.stroke();
      /* visor slit + plume */
      c.fillStyle = '#1c1428';
      c.fillRect(-hr * 0.55, hy - hr * 0.05, hr * 1.1, hr * 0.2);
      c.fillStyle = '#c9a03d';
      c.beginPath();
      c.moveTo(0, hy - hr * 1.1);
      c.quadraticCurveTo(hr * 0.5, hy - hr * 1.9, -hr * 0.15, hy - hr * 2.15);
      c.quadraticCurveTo(hr * 0.1, hy - hr * 1.5, -hr * 0.3, hy - hr * 1.05);
      c.closePath();
      c.fill();
      c.stroke();
      glowDot(c, -hr * 0.28, hy + hr * 0.05, hr * 0.1, L.eye);
      glowDot(c, hr * 0.28, hy + hr * 0.05, hr * 0.1, L.eye);
    } else {
      /* hood */
      const hc = cls === 'necromancer' ? '#2f4029' : '#1e4d6b';
      sphere(c, 0, hy, hr, L.skin.hi, L.skin.mid, L.skin.lo);
      c.fillStyle = hc;
      c.strokeStyle = OUT;
      c.lineWidth = 2.4;
      c.beginPath();
      c.arc(0, hy - hr * 0.12, hr * 1.22, Math.PI * 0.9, Math.PI * 2.1);
      c.quadraticCurveTo(hr * 0.95, hy + hr * 0.85, 0, hy + hr * 0.62);
      c.quadraticCurveTo(-hr * 0.95, hy + hr * 0.85, -hr * 1.16, hy + hr * 0.1);
      c.closePath();
      c.fill();
      c.stroke();
      c.fillStyle = 'rgba(10,4,18,0.82)';
      c.beginPath();
      c.arc(0, hy + hr * 0.05, hr * 0.85, 0, TAU);
      c.fill();
      glowDot(c, -hr * 0.3, hy + hr * 0.05, hr * 0.12, L.eye);
      glowDot(c, hr * 0.3, hy + hr * 0.05, hr * 0.12, L.eye);
    }
    /* death soul escape */
    if (clip === 'die' && t > 0.5) {
      const a = (t - 0.5) * 2;
      c.globalAlpha *= 1 - a;
      glowDot(c, 0, hy - a * R * 1.6, R * 0.25, L.eye);
      c.globalAlpha = 1;
    }
  };
}

function playerClips(cls: ClassId): ClipSpec[] {
  return [
    ['idle', 6, 6, true, heroPainter(cls, poseIdle, 'idle')],
    ['walk', 8, 9, true, heroPainter(cls, (f, n) => poseWalk(f, n, false), 'walk')],
    ['run', 8, 13, true, heroPainter(cls, (f, n) => poseWalk(f, n, true), 'run')],
    ['attack', 6, 16, false, heroPainter(cls, poseAttack, 'attack')],
    ['cast', 6, 13, false, heroPainter(cls, poseCast, 'cast')],
    ['hurt', 3, 15, false, heroPainter(cls, poseHurt, 'hurt')],
    ['die', 6, 9, false, heroPainter(cls, poseDie, 'die')],
  ];
}

/* ------------------------------- FX strips -------------------------------- */

export const FX_FRAMES: Record<string, number> = {};

function fxSheet(name: string, frames: number, fps: number, size: number, paint: Painter) {
  FX_FRAMES[name] = frames;
  bakeSheet(`fx-${name}`, size, size, [['strip', frames, fps, false, paint]]);
}

const EXP_PALS: Record<string, [string, string, string, string]> = {
  fire: ['#fff3c4', '#ffc258', '#ff8a3d', '#e6404f'],
  poison: ['#eaffd0', '#c0f08a', '#8fd94e', '#4d7d24'],
  frost: ['#ffffff', '#c0ecff', '#7fd4e8', '#2a6b8c'],
  arcane: ['#f0e0ff', '#d8a0ff', '#c07bff', '#5c2496'],
  holy: ['#ffffff', '#fff0c0', '#ffc258', '#c98a2e'],
};

function explosionPainter(kind: string): Painter {
  const [w, x, y, z] = EXP_PALS[kind];
  return (c, f, n) => {
    const t = f / (n - 1);
    const R = 10 + t * 34;
    c.globalAlpha = 1 - t * 0.85;
    /* outer lobes */
    c.fillStyle = z;
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + kind.length;
      const lr = R * (0.75 + 0.35 * Math.sin(i * 5.3 + f * 2.1));
      c.beginPath();
      c.arc(Math.cos(a) * R * 0.55, Math.sin(a) * R * 0.55, lr * 0.5, 0, TAU);
      c.fill();
    }
    c.fillStyle = y;
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + 1;
      c.beginPath();
      c.arc(Math.cos(a) * R * 0.35, Math.sin(a) * R * 0.35, R * 0.42, 0, TAU);
      c.fill();
    }
    const g = c.createRadialGradient(0, 0, 1, 0, 0, R * 0.75);
    g.addColorStop(0, w);
    g.addColorStop(0.5, x);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, R * 0.75, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  };
}

function soulPainter(color: string, core: string): Painter {
  return (c, f, n) => {
    const t = f / n;
    const wob = Math.sin(t * TAU * 2) * 2;
    c.translate(0, wob);
    const g = c.createRadialGradient(0, -2, 1, 0, 0, 13);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.45, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 13, 0, TAU);
    c.fill();
    c.restore();
    c.fillStyle = color;
    c.strokeStyle = OUT;
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(0, -2, 6.5, Math.PI, 0);
    c.lineTo(6.5, 4);
    for (let i = 2; i >= -2; i--) {
      c.quadraticCurveTo(i * 2.6 + 1.3, 7 + (i % 2 ? 2.6 : 0), i * 2.6, 4.4);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = core;
    c.beginPath();
    c.arc(-2.2, -2.5, 1.5, 0, TAU);
    c.arc(2.2, -2.5, 1.5, 0, TAU);
    c.fill();
  };
}

function buildFx() {
  for (const k of Object.keys(EXP_PALS)) fxSheet(`exp-${k}`, 8, 24, 96, explosionPainter(k));

  fxSheet('soul-green', 4, 8, 32, soulPainter('#9be85e', '#2a5c14'));
  fxSheet('soul-blue', 4, 8, 32, soulPainter('#7fd4e8', '#1e4d6b'));
  fxSheet('soul-purple', 4, 8, 32, soulPainter('#c07bff', '#4d2480'));
  fxSheet('soul-gold', 4, 8, 32, soulPainter('#ffc258', '#8a5a16'));

  fxSheet('coin', 6, 10, 24, (c, f, n) => {
    const w = Math.abs(Math.cos((f / n) * TAU));
    c.fillStyle = '#a5721d';
    c.strokeStyle = OUT;
    c.lineWidth = 1.8;
    c.beginPath();
    c.ellipse(0, 0, 8 * Math.max(0.25, w), 8, 0, 0, TAU);
    c.fill();
    c.stroke();
    if (w > 0.4) {
      c.fillStyle = '#ffc258';
      c.beginPath();
      c.ellipse(-1, 0, 5.5 * w, 5.5, 0, 0, TAU);
      c.fill();
      c.fillStyle = '#a5721d';
      c.font = '900 8px Nunito, sans-serif';
      c.textAlign = 'center';
      c.fillText('$', -1, 3);
    }
  });

  fxSheet('heal', 4, 7, 28, (c, f, n) => {
    const s = 1 + Math.sin((f / n) * TAU) * 0.12;
    c.scale(s, s);
    const g = c.createRadialGradient(0, 0, 1, 0, 0, 12);
    g.addColorStop(0, '#ffd0d8');
    g.addColorStop(1, '#e6404f');
    c.fillStyle = g;
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.arc(0, 0, 9, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = '#ffffff';
    c.fillRect(-5, -1.6, 10, 3.2);
    c.fillRect(-1.6, -5, 3.2, 10);
  });

  fxSheet('chest', 4, 6, 48, (c, f) => {
    const open = f === 0 ? 0 : f === 1 ? 0.35 : 1;
    c.translate(0, 6);
    if (open > 0.5) {
      const g = c.createRadialGradient(0, -10, 2, 0, -10, 26);
      g.addColorStop(0, 'rgba(255,240,190,0.95)');
      g.addColorStop(1, 'rgba(255,194,88,0)');
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, -10, 26, 0, TAU);
      c.fill();
      c.restore();
    }
    const bodyG = c.createLinearGradient(0, -12, 0, 14);
    bodyG.addColorStop(0, '#b07a3d');
    bodyG.addColorStop(1, '#5c3a1a');
    c.fillStyle = bodyG;
    c.strokeStyle = OUT;
    c.lineWidth = 2.4;
    rrPath(c, -15, -10, 30, 22, 3);
    c.fill();
    c.stroke();
    /* lid */
    c.save();
    c.translate(-15, -10);
    c.rotate(-open * 1.1);
    const lidG = c.createLinearGradient(0, -10, 0, 2);
    lidG.addColorStop(0, '#d89a52');
    lidG.addColorStop(1, '#8a5a2b');
    c.fillStyle = lidG;
    rrPath(c, 0, -11, 30, 12, 4);
    c.fill();
    c.stroke();
    c.restore();
    c.fillStyle = '#ffc258';
    rrPath(c, -4, -7, 8, 11, 2);
    c.fill();
    c.stroke();
    c.fillStyle = '#3d2410';
    c.beginPath();
    c.arc(0, -2, 1.8, 0, TAU);
    c.fill();
  });

  fxSheet('fireball', 6, 18, 48, (c, f, n) => {
    c.rotate((f / n) * TAU);
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 20);
    g.addColorStop(0, '#fff3c4');
    g.addColorStop(0.4, '#ffc258');
    g.addColorStop(1, 'rgba(230,64,79,0)');
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = g;
    c.beginPath();
    c.arc(0, 0, 20, 0, TAU);
    c.fill();
    c.restore();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      c.fillStyle = i % 2 ? '#ff8a3d' : '#ffc258';
      c.beginPath();
      c.moveTo(Math.cos(a) * 5, Math.sin(a) * 5);
      c.quadraticCurveTo(Math.cos(a + 0.5) * 16, Math.sin(a + 0.5) * 16, Math.cos(a + 0.9) * 6, Math.sin(a + 0.9) * 6);
      c.closePath();
      c.fill();
    }
    c.fillStyle = '#fff3c4';
    c.strokeStyle = 'rgba(122,32,16,0.9)';
    c.lineWidth = 1.8;
    c.beginPath();
    c.arc(0, 0, 6.5, 0, TAU);
    c.fill();
    c.stroke();
  });

  fxSheet('bonespear', 4, 16, 48, (c, f, n) => {
    c.rotate((f / n) * TAU);
    const g = c.createLinearGradient(-16, 0, 16, 0);
    g.addColorStop(0, '#9b927a');
    g.addColorStop(0.5, '#f4e8cf');
    g.addColorStop(1, '#9b927a');
    c.fillStyle = g;
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(18, 0);
    c.lineTo(4, -3.6);
    c.lineTo(-14, -2.4);
    c.quadraticCurveTo(-18, 0, -14, 2.4);
    c.lineTo(4, 3.6);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#f4e8cf';
    c.beginPath();
    c.arc(-14, 0, 3.4, 0, TAU);
    c.fill();
    c.stroke();
  });

  fxSheet('blade', 4, 20, 36, (c, f, n) => {
    c.rotate((f / n) * TAU);
    const g = c.createLinearGradient(-10, 0, 12, 0);
    g.addColorStop(0, '#8fa3b8');
    g.addColorStop(0.6, '#e8eef6');
    g.addColorStop(1, '#c9d4e4');
    c.fillStyle = g;
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(14, 0);
    c.quadraticCurveTo(4, -7, -10, -4);
    c.quadraticCurveTo(-2, 0, -10, 4);
    c.quadraticCurveTo(4, 7, 14, 0);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.8)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(11, 0);
    c.quadraticCurveTo(3, -4, -7, -2.6);
    c.stroke();
  });

  fxSheet('scytheorb', 4, 14, 44, (c, f, n) => {
    c.rotate((f / n) * TAU);
    c.fillStyle = '#6b4a2e';
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    rrPath(c, -2, -14, 4, 28, 2);
    c.fill();
    c.stroke();
    const g = c.createLinearGradient(0, -18, 0, -6);
    g.addColorStop(0, '#d0ffb0');
    g.addColorStop(1, '#69c94e');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(2, -14);
    c.quadraticCurveTo(16, -18, 17, -6);
    c.quadraticCurveTo(10, -10, 2, -8);
    c.closePath();
    c.fill();
    c.stroke();
  });

  fxSheet('caltrop', 4, 10, 32, (c, f) => {
    const s = f === 0 ? 0.4 : 1;
    c.scale(s, s);
    c.fillStyle = '#3d2a55';
    c.strokeStyle = OUT;
    c.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      c.save();
      c.rotate((i / 3) * TAU + 0.5);
      c.beginPath();
      c.moveTo(-4, 4);
      c.lineTo(0, -11);
      c.lineTo(4, 4);
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
    }
    if (f % 2 === 1) star4(c, 3, -6, 3, 'rgba(192,123,255,0.9)');
  });

  fxSheet('smoke', 6, 12, 48, (c, f, n) => {
    const t = f / (n - 1);
    c.globalAlpha = 0.5 * (1 - t);
    const r = 8 + t * 16;
    for (let i = 0; i < 4; i++) {
      const a = i * 1.8 + t * 2;
      const g = c.createRadialGradient(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4 - t * 10, 1, Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4 - t * 10, r * 0.7);
      g.addColorStop(0, 'rgba(120,90,150,0.8)');
      g.addColorStop(1, 'rgba(60,40,80,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4 - t * 10, r * 0.7, 0, TAU);
      c.fill();
    }
    c.globalAlpha = 1;
  });

  fxSheet('spark', 4, 16, 24, (c, f, n) => {
    c.rotate((f / n) * Math.PI);
    star4(c, 0, 0, 9, '#fff0c0');
    star4(c, 0, 0, 4.5, '#ffffff');
  });

  fxSheet('gore', 3, 1, 64, (c, f) => {
    const seed = f * 7 + 3;
    c.fillStyle = '#5c1220';
    for (let i = 0; i < 7; i++) {
      const a = seed + i * 2.4;
      const d = 6 + ((seed * (i + 3)) % 14);
      c.beginPath();
      c.ellipse(Math.cos(a) * d, Math.sin(a) * d * 0.7, 4 + (i % 3) * 2.5, 3 + (i % 2) * 2, a, 0, TAU);
      c.fill();
    }
    c.fillStyle = '#7d1830';
    c.beginPath();
    c.ellipse(0, 0, 10, 7, seed, 0, TAU);
    c.fill();
  });

  fxSheet('auraring', 8, 12, 96, (c, f, n) => {
    c.rotate((f / n) * TAU);
    c.strokeStyle = 'rgba(255,194,88,0.9)';
    c.lineWidth = 3;
    c.setLineDash([12, 9]);
    c.beginPath();
    c.arc(0, 0, 38, 0, TAU);
    c.stroke();
    c.setLineDash([]);
    c.fillStyle = '#ffe9b0';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      c.save();
      c.translate(Math.cos(a) * 38, Math.sin(a) * 38);
      c.rotate(a);
      c.fillRect(-2.5, -5, 5, 10);
      c.restore();
    }
  });

  fxSheet('whirl', 6, 20, 96, (c, f, n) => {
    c.rotate((f / n) * TAU);
    for (let i = 0; i < 3; i++) {
      c.save();
      c.rotate((i / 3) * TAU);
      const g = c.createLinearGradient(0, 0, 40, 0);
      g.addColorStop(0, 'rgba(230,64,79,0)');
      g.addColorStop(1, 'rgba(255,150,120,0.9)');
      c.strokeStyle = g;
      c.lineWidth = 7;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(0, 0, 34, 0.2, 1.9);
      c.stroke();
      c.restore();
    }
  });

  fxSheet('pillar', 5, 16, 224, (c, f, n) => {
    const t = f / (n - 1);
    const w = 8 + Math.sin(t * Math.PI) * 16;
    c.globalAlpha = Math.sin(t * Math.PI);
    const g = c.createLinearGradient(-w, 0, w, 0);
    g.addColorStop(0, 'rgba(255,194,88,0)');
    g.addColorStop(0.5, '#fff6dd');
    g.addColorStop(1, 'rgba(255,194,88,0)');
    c.fillStyle = g;
    c.fillRect(-w, -90, w * 2, 120);
    c.fillStyle = 'rgba(255,246,221,0.9)';
    c.beginPath();
    c.ellipse(0, 26, w * 1.4, 8, 0, 0, TAU);
    c.fill();
    c.globalAlpha = 1;
  });

  fxSheet('slash-green', 6, 20, 96, slashPainter('#9be85e'));
  fxSheet('slash-white', 6, 20, 96, slashPainter('#e8eef6'));

  fxSheet('meteor', 4, 14, 96, (c, f, n) => {
    c.rotate((f / n) * TAU * 0.5);
    /* tail */
    const tg = c.createLinearGradient(0, -30, 0, 0);
    tg.addColorStop(0, 'rgba(255,138,61,0)');
    tg.addColorStop(1, 'rgba(255,194,88,0.85)');
    c.fillStyle = tg;
    c.beginPath();
    c.moveTo(-9, -2);
    c.lineTo(0, -34);
    c.lineTo(9, -2);
    c.closePath();
    c.fill();
    sphere(c, 0, 4, 12, '#8a6a5a', '#5c4437', '#2a1c14');
    c.fillStyle = '#ff8a3d';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.arc(Math.cos(i * 2.4) * 5, 4 + Math.sin(i * 2.4) * 5, 2.4, 0, TAU);
      c.fill();
    }
  });
}

function slashPainter(color: string): Painter {
  return (c, f, n) => {
    const t = f / (n - 1);
    const a0 = -1.5 + t * 2.2;
    c.globalAlpha = 1 - t * 0.7;
    c.strokeStyle = color;
    c.lineWidth = 12 * (1 - t * 0.5);
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, 0, 34, a0, a0 + 1.1);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 4;
    c.beginPath();
    c.arc(0, 0, 34, a0 + 0.15, a0 + 0.95);
    c.stroke();
    c.globalAlpha = 1;
  };
}

/* --------------------------- ground & props ------------------------------- */

export const TILE = 144;
let tileCanvas: HTMLCanvasElement | null = null;

function buildTiles() {
  tileCanvas = document.createElement('canvas');
  tileCanvas.width = TILE * 4;
  tileCanvas.height = TILE;
  const c = tileCanvas.getContext('2d')!;
  for (let v = 0; v < 4; v++) {
    c.save();
    c.translate(v * TILE, 0);
    c.fillStyle = v % 2 ? '#1a1128' : '#191026';
    c.fillRect(0, 0, TILE, TILE);
    /* big soft stains */
    for (let i = 0; i < 3; i++) {
      const sx = ((v * 37 + i * 53) % 100) + 22;
      const sy = ((v * 61 + i * 31) % 100) + 22;
      const g = c.createRadialGradient(sx, sy, 4, sx, sy, 44);
      g.addColorStop(0, i % 2 ? 'rgba(45,28,70,0.5)' : 'rgba(16,9,28,0.55)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, TILE, TILE);
    }
    /* grout */
    c.strokeStyle = 'rgba(10,5,20,0.8)';
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, TILE - 3, TILE - 3);
    /* cracks */
    c.strokeStyle = 'rgba(8,4,16,0.65)';
    c.lineWidth = 2;
    c.beginPath();
    let cx = ((v * 23) % 90) + 20;
    let cy = 10;
    c.moveTo(cx, cy);
    for (let i = 0; i < 4; i++) {
      cx += ((v + i) % 2 ? 1 : -1) * (12 + i * 4);
      cy += 30;
      c.lineTo(cx, cy);
    }
    c.stroke();
    /* variant flavor */
    if (v === 1) {
      c.fillStyle = 'rgba(120,200,90,0.10)';
      for (let i = 0; i < 5; i++) {
        c.beginPath();
        c.ellipse(24 + i * 24, 30 + ((i * 37) % 80), 10, 6, i, 0, TAU);
        c.fill();
      }
    } else if (v === 2) {
      c.fillStyle = 'rgba(120,15,35,0.16)';
      c.beginPath();
      c.ellipse(70, 76, 26, 16, 0.5, 0, TAU);
      c.fill();
    } else if (v === 3) {
      c.fillStyle = 'rgba(216,198,154,0.3)';
      for (let i = 0; i < 4; i++) {
        c.beginPath();
        c.arc(30 + i * 28, 40 + ((i * 41) % 60), 2.4, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(216,198,154,0.35)';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(80, 90, 8, 0.4, 2.6);
      c.stroke();
    } else {
      c.fillStyle = 'rgba(77,47,107,0.35)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc(20 + ((i * 47) % 104), 24 + ((i * 29) % 96), 2, 0, TAU);
        c.fill();
      }
    }
    c.restore();
  }
}

export function tileVariant(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) % 4;
}
export function getTileCanvas() {
  return tileCanvas;
}

/* props */
export interface PropDraw { canvas: HTMLCanvasElement; glow?: string; }
const props: Record<string, PropDraw> = {};

function propCanvas(w: number, h: number, paint: (c: CanvasRenderingContext2D) => void, glow?: string) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d')!;
  c.translate(w / 2, h / 2);
  paint(c);
  return { canvas: cv, glow };
}

function buildProps() {
  props.tree = propCanvas(130, 170, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 72, 34, 10, 0, 0, TAU);
    c.fill();
    c.strokeStyle = '#2a1a2e';
    c.lineCap = 'round';
    const branch = (x: number, y: number, a: number, l: number, w: number, d: number) => {
      const x2 = x + Math.cos(a) * l;
      const y2 = y + Math.sin(a) * l;
      c.lineWidth = w;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x2, y2);
      c.stroke();
      if (d > 0) {
        branch(x2, y2, a - 0.6, l * 0.6, w * 0.6, d - 1);
        branch(x2, y2, a + 0.5, l * 0.55, w * 0.6, d - 1);
      }
    };
    c.fillStyle = '#33203a';
    c.strokeStyle = '#1c0e24';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-10, 74);
    c.quadraticCurveTo(-6, 10, -14, -40);
    c.lineTo(6, -46);
    c.quadraticCurveTo(4, 10, 12, 74);
    c.closePath();
    c.fill();
    c.stroke();
    branch(-12, -30, -1.9, 30, 7, 2);
    branch(4, -42, -1.2, 32, 7, 2);
    branch(-4, 0, -2.5, 24, 6, 1);
  });
  props.grave = propCanvas(100, 120, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 48, 34, 10, 0, 0, TAU);
    c.fill();
    sphere(c, 0, 0, 30, '#8d7ba8', '#5c4d75', '#2e2440', 1, 1.25);
    c.strokeStyle = 'rgba(12,4,22,0.8)';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(-6, -26);
    c.lineTo(2, -8);
    c.lineTo(-4, 8);
    c.stroke();
    c.fillStyle = 'rgba(120,200,90,0.18)';
    c.beginPath();
    c.ellipse(-12, 20, 12, 7, -0.4, 0, TAU);
    c.fill();
    c.strokeStyle = '#2e2440';
    c.lineWidth = 4;
    c.beginPath();
    c.moveTo(-8, -10);
    c.lineTo(8, -10);
    c.moveTo(0, -20);
    c.lineTo(0, 2);
    c.stroke();
  });
  props.bones = propCanvas(110, 80, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.beginPath();
    c.ellipse(0, 22, 40, 10, 0, 0, TAU);
    c.fill();
    for (let i = 0; i < 4; i++) {
      c.strokeStyle = '#d8c69a';
      c.lineWidth = 5;
      c.lineCap = 'round';
      c.beginPath();
      c.arc(-24 + i * 8, 14, 16, -2.4, -0.7);
      c.stroke();
    }
    sphere(c, 22, 0, 14, '#fff8e8', '#e8e0cc', '#9b927a');
    c.fillStyle = '#120a1c';
    c.beginPath();
    c.arc(17, -2, 3.4, 0, TAU);
    c.arc(27, -2, 3.4, 0, TAU);
    c.fill();
    c.fillRect(19, 6, 7, 2.6);
  });
  props.rock = propCanvas(110, 90, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 30, 38, 10, 0, 0, TAU);
    c.fill();
    sphere(c, 0, 0, 28, '#7d6b92', '#4d4060', '#241c33', 1.25, 0.9);
    c.strokeStyle = 'rgba(12,4,22,0.6)';
    c.lineWidth = 2.4;
    c.beginPath();
    c.moveTo(-16, -10);
    c.lineTo(-2, 2);
    c.lineTo(12, -4);
    c.stroke();
  });
  props.mushroom = propCanvas(80, 80, (c) => {
    for (const [mx, my, s] of [[-14, 10, 1], [12, 14, 0.75], [2, -2, 1.25]] as [number, number, number][]) {
      c.fillStyle = '#d8cfae';
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      rrPath(c, mx - 3 * s, my, 6 * s, 14 * s, 3);
      c.fill();
      c.stroke();
      c.fillStyle = '#c07bff';
      c.beginPath();
      c.ellipse(mx, my, 11 * s, 7 * s, 0, Math.PI, 0);
      c.fill();
      c.stroke();
      c.fillStyle = '#e8d0ff';
      c.beginPath();
      c.arc(mx - 3 * s, my - 3 * s, 1.6 * s, 0, TAU);
      c.arc(mx + 4 * s, my - 2 * s, 1.3 * s, 0, TAU);
      c.fill();
    }
  }, '#c07bff');
  props.candle = propCanvas(70, 90, (c) => {
    for (const [mx, h] of [[-14, 22], [4, 30], [18, 16]] as [number, number][]) {
      c.fillStyle = '#e8e0cc';
      c.strokeStyle = OUT;
      c.lineWidth = 2;
      rrPath(c, mx - 6, 26 - h, 12, h, 4);
      c.fill();
      c.stroke();
      const fg = c.createRadialGradient(mx, 18 - h, 1, mx, 18 - h, 9);
      fg.addColorStop(0, '#fff6dd');
      fg.addColorStop(0.5, '#ffc258');
      fg.addColorStop(1, 'rgba(255,138,61,0)');
      c.fillStyle = fg;
      c.beginPath();
      c.ellipse(mx, 17 - h, 5, 8, 0, 0, TAU);
      c.fill();
    }
  }, '#ffc258');
  props.pillar = propCanvas(100, 160, (c) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath();
    c.ellipse(0, 66, 36, 10, 0, 0, TAU);
    c.fill();
    const g = c.createLinearGradient(-22, 0, 22, 0);
    g.addColorStop(0, '#8d7ba8');
    g.addColorStop(0.45, '#6b5a88');
    g.addColorStop(1, '#3a2e50');
    c.fillStyle = g;
    c.strokeStyle = OUT;
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-22, 64);
    c.lineTo(-20, -40);
    c.lineTo(-8, -52);
    c.lineTo(10, -44);
    c.lineTo(20, -30);
    c.lineTo(22, 64);
    c.closePath();
    c.fill();
    c.stroke();
    c.strokeStyle = 'rgba(12,4,22,0.5)';
    c.lineWidth = 2.4;
    for (let i = -1; i <= 1; i++) {
      c.beginPath();
      c.moveTo(i * 9, -40);
      c.lineTo(i * 9, 60);
      c.stroke();
    }
  });
}

export const PROP_KINDS = ['tree', 'grave', 'bones', 'rock', 'mushroom', 'candle', 'pillar'] as const;

export function getProp(kind: string): PropDraw | undefined {
  return props[kind];
}

export function propAt(tx: number, ty: number): { kind: string; dx: number; dy: number; s: number; flip: boolean } | null {
  let h = (tx * 917654321 + ty * 123456789) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  const u = ((h ^ (h >> 16)) >>> 0) / 4294967295;
  if (u > 0.14) return null;
  const kind = PROP_KINDS[Math.floor(u * 7 * 7.31) % PROP_KINDS.length];
  let h2 = (tx * 374761393 + ty * 668265263) | 0;
  h2 = (h2 ^ (h2 >> 13)) * 1274126177;
  const u2 = ((h2 ^ (h2 >> 16)) >>> 0) / 4294967295;
  return {
    kind,
    dx: (u2 - 0.5) * 90,
    dy: (((u2 * 7.7) % 1) - 0.5) * 90,
    s: 0.8 + ((u2 * 3.3) % 1) * 0.5,
    flip: u2 > 0.5,
  };
}

/* fog blobs */
const fogCanvases: HTMLCanvasElement[] = [];
export function getFogs() {
  return fogCanvases;
}
function buildFog() {
  for (let k = 0; k < 3; k++) {
    const cv = document.createElement('canvas');
    cv.width = 480;
    cv.height = 240;
    const c = cv.getContext('2d')!;
    for (let i = 0; i < 9; i++) {
      const x = ((i * 137 + k * 61) % 440) + 20;
      const y = ((i * 89 + k * 37) % 180) + 30;
      const r = 50 + ((i * 53) % 70);
      const g = c.createRadialGradient(x, y, 4, x, y, r);
      g.addColorStop(0, `rgba(${110 + k * 15},${80 + k * 10},${160 + k * 10},${0.09 - k * 0.015})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    fogCanvases.push(cv);
  }
}

/* ------------------------------ draw helper ------------------------------- */

export function drawFx(
  c: CanvasRenderingContext2D, name: string, x: number, y: number,
  size: number, t01: number, rot = 0, alpha = 1,
) {
  const s = sheets.get(`fx-${name}`);
  if (!s) return;
  const clip = s.clips['strip'];
  const frame = Math.min(clip.frames - 1, Math.max(0, Math.floor(t01 * clip.frames)));
  c.save();
  c.globalAlpha = Math.max(0, Math.min(1, alpha));
  c.translate(x, y);
  if (rot) c.rotate(rot);
  const sc = size / s.fw;
  c.scale(sc, sc);
  c.drawImage(s.canvas, frame * s.fw, clip.y, s.fw, s.fh, -s.fw / 2, -s.fh / 2, s.fw, s.fh);
  c.restore();
}

export function fxFrame(name: string, time: number, fps = 10): number {
  const n = FX_FRAMES[name] ?? 1;
  return ((Math.floor(time * fps) % n) + n) % n / Math.max(1, n - 1);
}

/* ------------------------------- bake all --------------------------------- */

let baked = false;
export function isBaked() {
  return baked;
}

export async function bakeAll(onProgress?: (p: number) => void): Promise<void> {
  if (baked) {
    onProgress?.(1);
    return;
  }
  const jobs: (() => void)[] = [];
  for (const skin of Object.keys(ENEMY_LOOKS)) {
    const s = skin as SkinId;
    const fw = BOSSES.has(s) ? 224 : s === 'brute' ? 160 : 96;
    jobs.push(() => bakeSheet(`en-${s}`, fw, fw, enemyClips(s)));
  }
  for (const cls of ['barbarian', 'necromancer', 'sorceress'] as ClassId[]) {
    jobs.push(() => bakeSheet(`player-${cls}`, 112, 112, playerClips(cls)));
  }
  jobs.push(buildFx);
  jobs.push(buildTiles);
  jobs.push(buildProps);
  jobs.push(buildFog);

  for (let i = 0; i < jobs.length; i++) {
    try {
      jobs[i]();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[Gloomfall] sprite bake job failed:', err);
    }
    onProgress?.((i + 1) / jobs.length);
    await new Promise((r) => requestAnimationFrame(r));
  }
  /* verify critical sheets; retry anything that silently failed */
  for (const cls of ['barbarian', 'necromancer', 'sorceress'] as ClassId[]) {
    if (!sheets.has(`player-${cls}`)) {
      try {
        bakeSheet(`player-${cls}`, 112, 112, playerClips(cls));
      } catch { /* fallback painter handles it */ }
    }
  }
  for (const skin of Object.keys(ENEMY_LOOKS)) {
    if (!sheets.has(`en-${skin}`)) {
      try {
        const s = skin as SkinId;
        const fw = BOSSES.has(s) ? 224 : s === 'brute' ? 160 : 96;
        bakeSheet(`en-${s}`, fw, fw, enemyClips(s));
      } catch { /* ignore */ }
    }
  }
  if (!tileCanvas) {
    try { buildTiles(); } catch { /* ignore */ }
  }
  baked = true;
  onProgress?.(1);
}
