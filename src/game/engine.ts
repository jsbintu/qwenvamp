import {
  BOSSES, CLASSES, ENEMIES, GAME_DURATION, MAX_PASSIVES, MAX_RANK, MAX_WEAPONS,
  PASSIVES, WEAPONS, xpForLevel,
} from './data';
import type { BossDef, BossPhase, EnemyDef } from './data';
import { resolveFusion, type FusionDef } from './fusions';
import type {
  Choice, ChestReward, ClassId, CompId, EndStats, PassiveId, RankDef, RelicProc,
  SkinId, Snapshot, SnapshotPassive, SnapshotWeapon, WeaponId,
} from './types';
import { isWeapon, PASSIVE_IDS, WEAPON_IDS } from './types';
import { sfx, setMuted } from './audio';

/* ------------------------------ internal types ----------------------------- */

interface WeaponSlot {
  id: WeaponId;
  lvl: number;
  cd: number;
  fused?: { def: FusionDef; partner: CompId };
  /* recomputed */
  dmg: number; rcd: number; area: number; proj: number; pierce: number;
  pspd: number; crit: number; mods: Set<string>;
}

type PassiveSlot =
  | { kind: 'p'; id: PassiveId; lvl: number }
  | { kind: 'r'; a: PassiveId; b: PassiveId; def: FusionDef };

interface Enemy {
  def: EnemyDef | BossDef;
  skin: SkinId;
  x: number; y: number;
  hp: number; maxHp: number; r: number; dmg: number; speed: number; xp: number;
  flash: number; slow: number; elite: boolean;
  ai: { state: number; t: number; ax: number; ay: number; ang: number };
  bossIdx: number; phase: number; atkT: number; cycle: number;
  atk: { type: string; t: number; dur: number; ax: number; ay: number; done: boolean } | null;
  spikeT: number; hurtT: number; seed: number; dead: boolean;
}

interface Proj {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  pierce: number; hit: Set<Enemy>; life: number; kind: string; color: string;
  slot: number; knock: number; trail: boolean;
}

interface EBullet {
  x: number; y: number; vx: number; vy: number; r: number; dmg: number;
  color: string; life: number; poison: boolean;
}

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; maxLife: number;
  size: number; color: string; kind: 'dot' | 'spark' | 'ring' | 'shard' | 'smoke';
}

interface Floater { x: number; y: number; t: number; txt: string; color: string; size: number; }
interface Decal { x: number; y: number; r: number; a: number; color: string; }
interface Pickup { x: number; y: number; kind: 'xp' | 'gold' | 'heal' | 'chest'; v: number; t: number; }
interface Spike { x: number; y: number; t: number; dur: number; dmg: number; slot: number; }
interface Orbital { ang: number; r: number; dmg: number; kind: 'blade' | 'scythe'; slot: number; }

interface Hazard {
  kind: 'pool' | 'beam' | 'warnc' | 'warnl' | 'burst' | 'pillar';
  x: number; y: number; x2: number; y2: number; r: number; ang: number;
  t: number; dur: number; dmg: number; color: string; slow: boolean; owner: 'e' | 'p'; slot: number;
}

export interface Callbacks {
  onSnapshot: (s: Snapshot) => void;
  onEnd: (s: EndStats) => void;
  onLevelUp: (c: Choice[]) => void;
  onChest: (r: ChestReward[]) => void;
  onEvolve: (name: string, desc: string, flagship: boolean) => void;
  onBanner: (t: string, sub?: string) => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
function hash2(x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  return ((h ^ (h >> 16)) >>> 0) / 4294967295;
}

/* ================================= ENGINE ================================= */

export class GloomfallEngine {
  private canvas: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private cb: Callbacks;
  private raf = 0;
  private last = 0;
  private running = false;
  private paused = false;
  private uiLock = false;
  private over = false;
  private deathT = -1;

  private keys = new Set<string>();
  private W = 0; private H = 0; private dpr = 1;

  /* world */
  private time = 0;
  private cam = { x: 0, y: 0 };
  private shake = 0;
  private freeze = 0;
  private timeScale = 1;
  private flashT = 0;
  private redFlash = 0;
  private snapT = 0;

  /* player */
  private classId: ClassId;
  private px = 0; private py = 0;
  private facing = 1;
  private moving = false;
  private hp = 100; private maxHp = 100;
  private level = 1; private xp = 0;
  private pendingLevels = 0;
  private kills = 0; private gold = 0;
  private dmgDealt = 0; private bossKills = 0;
  private iframe = 0;
  private spinT = 0;
  private phoenixUsed = false;
  private walkT = 0;
  private aimAng = 0;

  /* stats (recomputed) */
  private st = {
    dmgMul: 1, cdMul: 1, areaMul: 1, spdMul: 1, maxHpMul: 1, regen: 0, goldMul: 1,
    luck: 0, xpMul: 1, armor: 0, crit: 0.05, pickup: 1, pspd: 1, pierce: 0,
    lifeSteal: 0, goldHeal: 0,
    flags: new Set<string>(),
  };

  private weapons: WeaponSlot[] = [];
  private passives: PassiveSlot[] = [];
  private fusionNames: string[] = [];

  /* entities */
  private enemies: Enemy[] = [];
  private projs: Proj[] = [];
  private ebullets: EBullet[] = [];
  private particles: Particle[] = [];
  private floaters: Floater[] = [];
  private decals: Decal[] = [];
  private pickups: Pickup[] = [];
  private spikes: Spike[] = [];
  private orbitals: Orbital[] = [];
  private hazards: Hazard[] = [];
  private arcs: { x1: number; y1: number; x2: number; y2: number; t: number; color: string }[] = [];

  /* timers */
  private spawnT = 0.5;
  private orbTickT = 0;
  private wardT = 0; private warT = 0; private bulwarkT = 0;
  private emberCd = 0; private magnetT = 0; private magnetPull = 0;
  private judgmentT = 0; private tempestT = 0; private meteorT = 0;
  private eruptionT = 0; private trailT = 0;
  private bossSpawned = new Set<number>();

  constructor(canvas: HTMLCanvasElement, cb: Callbacks, classId: ClassId) {
    this.canvas = canvas;
    this.cb = cb;
    this.classId = classId;
    this.c = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.kd);
    window.addEventListener('keyup', this.ku);
    this.setupWeapons();
    this.recompute();
    this.hp = this.maxHp;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.last = performance.now();
  }
  toggleMute(): boolean {
    setMuted(true);
    return true;
  }
  setMutedState(m: boolean) {
    setMuted(m);
  }

  private resize = () => {
    this.dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    this.W = window.innerWidth;
    this.H = window.innerHeight;
    this.canvas.width = Math.floor(this.W * this.dpr);
    this.canvas.height = Math.floor(this.H * this.dpr);
    this.canvas.style.width = `${this.W}px`;
    this.canvas.style.height = `${this.H}px`;
  };

  private kd = (e: KeyboardEvent) => {
    this.keys.add(e.key.toLowerCase());
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  };
  private ku = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());

  /* ------------------------------- setup -------------------------------- */

  private setupWeapons() {
    const def = CLASSES[this.classId];
    this.st.dmgMul *= def.dmgMul;
    this.st.spdMul *= def.spdMul;
    this.st.maxHpMul *= def.hpMul;
    if (this.classId === 'necromancer') {
      this.st.areaMul *= 1.15;
      this.st.xpMul *= 1.1;
    }
    this.addWeapon(CLASSES[this.classId].startWeapon);
  }

  private mkSlot(id: WeaponId): WeaponSlot {
    return {
      id, lvl: 1, cd: 0, dmg: 0, rcd: 1, area: 1, proj: 1, pierce: 0, pspd: 1, crit: 0,
      mods: new Set<string>(),
    };
  }

  private addWeapon(id: WeaponId) {
    const slot = this.mkSlot(id);
    this.weapons.push(slot);
    this.recomputeWeapon(slot);
  }

  /* ------------------------- stat recomputation -------------------------- */

  private recomputeWeapon(s: WeaponSlot) {
    const def = WEAPONS[s.id];
    let dmg = def.baseDmg;
    let cd = def.baseCd;
    let area = 1;
    let proj = s.id === 'blades' ? 2 : 1;
    let pierce = s.id === 'bonespear' ? 2 : 0;
    let pspd = 1;
    let crit = s.id === 'scythe' ? 0.1 : 0;
    const mods = new Set<string>();
    for (let i = 0; i < s.lvl; i++) {
      const r = def.ranks[i];
      if (r.dmg) dmg *= 1 + r.dmg;
      if (r.cd) cd *= 1 + r.cd;
      if (r.area) area *= 1 + r.area;
      if (r.proj) proj += r.proj;
      if (r.pierce) pierce += r.pierce;
      if (r.pspd) pspd *= 1 + r.pspd;
      if (r.flag) mods.add(r.flag);
    }
    if (s.fused) {
      const f = s.fused.def;
      dmg *= f.dmgMul;
      cd *= f.cdMul;
      area *= f.areaMul;
      proj += f.projBonus;
      f.mods.forEach((m) => mods.add(m));
    }
    /* global passive contributions */
    dmg *= this.st.dmgMul;
    cd *= this.st.cdMul;
    area *= this.st.areaMul;
    pspd *= this.st.pspd;
    pierce += this.st.pierce;
    crit += this.st.crit;
    if (mods.has('vorpal')) { pierce = 999; crit += 0.2; }
    if (mods.has('critplus')) crit += 0.25;
    if (mods.has('pierceplus')) pierce += 3;
    if (mods.has('swift')) pspd *= 1.7;
    s.dmg = dmg; s.rcd = cd; s.area = area; s.proj = proj;
    s.pierce = pierce; s.pspd = pspd; s.crit = crit; s.mods = mods;
  }

  private foldPassiveRanks(id: PassiveId, lvl: number, scale: number) {
    const def = PASSIVES[id];
    const s = this.st;
    for (let i = 0; i < lvl; i++) {
      const r: RankDef = def.ranks[i];
      if (r.hp) s.maxHpMul *= 1 + r.hp * scale;
      if (r.regen) s.regen += r.regen * scale;
      if (r.spd) s.spdMul *= 1 + r.spd * scale;
      if (r.gold) s.goldMul *= 1 + r.gold * scale;
      if (r.luck) s.luck += r.luck * scale;
      if (r.xp) s.xpMul *= 1 + r.xp * scale;
      if (r.armor) s.armor += r.armor * scale;
      if (r.crit) s.crit += r.crit * scale;
      if (r.pickup) s.pickup *= 1 + r.pickup * scale;
      if (r.cd) s.cdMul *= 1 + r.cd * scale;
      if (r.pspd) s.pspd *= 1 + r.pspd * scale;
      if (r.dmg) s.dmgMul *= 1 + r.dmg * scale;
      if (r.area) s.areaMul *= 1 + r.area * scale;
      if (r.pierce) s.pierce += r.pierce * scale;
      if (r.flag) s.flags.add(r.flag);
    }
  }

  private recompute() {
    const s = this.st;
    const def = CLASSES[this.classId];
    s.dmgMul = def.dmgMul; s.cdMul = 1; s.areaMul = this.classId === 'necromancer' ? 1.15 : 1;
    s.spdMul = def.spdMul; s.maxHpMul = def.hpMul; s.regen = 0; s.goldMul = 1; s.luck = 0;
    s.xpMul = this.classId === 'necromancer' ? 1.1 : 1; s.armor = 0; s.crit = 0.05;
    s.pickup = 1; s.pspd = 1; s.pierce = 0; s.lifeSteal = 0; s.goldHeal = 0;
    s.flags = new Set<string>();

    for (const p of this.passives) {
      if (p.kind === 'p') this.foldPassiveRanks(p.id, p.lvl, 1);
      else {
        this.foldPassiveRanks(p.a, MAX_RANK, 1.5);
        this.foldPassiveRanks(p.b, MAX_RANK, 1.5);
        this.applyProc(p.def.proc!, s);
      }
    }
    const oldMax = this.maxHp;
    this.maxHp = Math.round(100 * s.maxHpMul);
    this.hp = clamp(this.hp + (this.maxHp - oldMax), 1, this.maxHp);
    for (const w of this.weapons) this.recomputeWeapon(w);
  }

  private applyProc(proc: RelicProc, s: typeof this.st) {
    switch (proc) {
      case 'bloodpact': s.regen += 3; s.lifeSteal = Math.max(s.lifeSteal, 0.04); break;
      case 'midas': s.goldMul *= 1.3; s.goldHeal = 2; break;
      case 'chronoshift': s.cdMul *= 0.85; s.spdMul *= 1.08; break;
      case 'bulwark': s.armor += 6; s.flags.add('bulwark'); break;
      case 'warmonger': s.dmgMul *= 1.25; s.flags.add('warmonger'); break;
      case 'swiftfortune': s.spdMul *= 1.12; s.luck += 0.25; break;
      case 'omniscience': s.xpMul *= 1.4; s.pickup *= 1.5; break;
      case 'razorwind': s.pspd *= 1.2; s.pierce += 1; break;
      case 'ironblood': s.maxHpMul *= 1.3; s.armor += 3; break;
      case 'emberheart': s.dmgMul *= 1.1; s.flags.add('emberheart'); break;
    }
  }

  /* ------------------------------ choices -------------------------------- */

  private buildChoices(): Choice[] {
    const pool: Choice[] = [];
    for (const id of WEAPON_IDS) {
      const slot = this.weapons.find((w) => w.id === id);
      if (slot) {
        if (slot.lvl < MAX_RANK) pool.push({ kind: 'weapon', id, level: slot.lvl + 1, isNew: false, rankText: WEAPONS[id].ranks[slot.lvl].text });
      } else if (this.weapons.length < MAX_WEAPONS) {
        pool.push({ kind: 'weapon', id, level: 1, isNew: true, rankText: WEAPONS[id].ranks[0].text });
      }
    }
    for (const id of PASSIVE_IDS) {
      const slot = this.passives.find((p) => p.kind === 'p' && p.id === id);
      if (slot && slot.kind === 'p') {
        if (slot.lvl < PASSIVES[id].ranks.length) pool.push({ kind: 'passive', id, level: slot.lvl + 1, isNew: false, rankText: PASSIVES[id].ranks[slot.lvl].text });
      } else if (this.passives.length < MAX_PASSIVES) {
        pool.push({ kind: 'passive', id, level: 1, isNew: true, rankText: PASSIVES[id].ranks[0].text });
      }
    }
    if (pool.length === 0) {
      pool.push({ kind: 'passive', id: 'vitality', level: 99, isNew: false, rankText: 'A surge of raw power: +30 life now.' });
    }
    const picks: Choice[] = [];
    while (picks.length < 3 && pool.length > 0) {
      const i = Math.floor(Math.random() * pool.length);
      picks.push(pool.splice(i, 1)[0]);
    }
    return picks;
  }

  choose(c: Choice): boolean {
    this.applyChoice(c);
    if (this.pendingLevels > 0) {
      this.pendingLevels--;
      this.cb.onLevelUp(this.buildChoices());
      return true;
    }
    this.uiLock = false;
    return false;
  }

  private applyChoice(c: Choice) {
    if (c.level === 99) {
      this.hp = clamp(this.hp + 30, 1, this.maxHp);
      sfx.heal();
      return;
    }
    if (c.kind === 'weapon') {
      const slot = this.weapons.find((w) => w.id === c.id);
      if (slot) slot.lvl = c.level;
      else this.addWeapon(c.id as WeaponId);
      sfx.rankup();
    } else {
      const slot = this.passives.find((p) => p.kind === 'p' && p.id === c.id);
      if (slot && slot.kind === 'p') slot.lvl = c.level;
      else this.passives.push({ kind: 'p', id: c.id as PassiveId, lvl: c.level });
      sfx.rankup();
    }
    this.recompute();
  }

  /* ------------------------------- fusions ------------------------------- */

  private eligibleFusions(): { a: CompId; b: CompId; flagship: boolean }[] {
    const out: { a: CompId; b: CompId; flagship: boolean }[] = [];
    const maxW = this.weapons.filter((w) => w.lvl >= MAX_RANK && !w.fused);
    const maxP = this.passives.filter((p): p is { kind: 'p'; id: PassiveId; lvl: number } => p.kind === 'p' && p.lvl >= PASSIVES[p.id].ranks.length);
    for (let i = 0; i < maxW.length; i++)
      for (let j = i + 1; j < maxW.length; j++)
        out.push({ a: maxW[i].id, b: maxW[j].id, flagship: false });
    for (const w of maxW)
      for (const p of maxP)
        out.push({ a: w.id, b: p.id, flagship: resolveFusion(w.id, p.id).flagship === true });
    for (let i = 0; i < maxP.length; i++)
      for (let j = i + 1; j < maxP.length; j++)
        out.push({ a: maxP[i].id, b: maxP[j].id, flagship: false });
    return out.sort((x, y) => Number(y.flagship) - Number(x.flagship));
  }

  private applyFusion(aId: CompId, bId: CompId) {
    const def = resolveFusion(aId, bId);
    if (def.kind === 'weapon') {
      const sA = this.weapons.find((w) => w.id === aId);
      const sB = this.weapons.find((w) => w.id === bId);
      if (!sA) return;
      const base = def.base ?? sA.id;
      const newSlot: WeaponSlot = this.mkSlot(base);
      newSlot.lvl = Math.max(sA.lvl, sB ? sB.lvl : PASSIVES[bId as PassiveId].ranks.length);
      newSlot.fused = { def, partner: bId };
      const idx = this.weapons.indexOf(sA);
      this.weapons[idx] = newSlot;
      if (sB) this.weapons = this.weapons.filter((w) => w !== sB);
      this.recompute();
    } else {
      const pA = this.passives.find((p) => p.kind === 'p' && p.id === aId);
      const pB = this.passives.find((p) => p.kind === 'p' && p.id === bId);
      if (!pA || !pB || pA.kind !== 'p' || pB.kind !== 'p') return;
      this.passives = this.passives.filter((p) => p !== pA && p !== pB);
      this.passives.push({ kind: 'r', a: pA.id, b: pB.id, def });
      this.recompute();
    }
    this.fusionNames.push(def.name);
    this.flashT = 0.9;
    this.shake = 14;
    this.freeze = 0.08;
    this.burst(this.px, this.py, 46, def.color, 'spark');
    this.ring(this.px, this.py, def.color, 160);
    sfx.fuse();
    this.cb.onEvolve(def.name, def.desc, !!def.flagship);
  }

  claimChest(rewards: ChestReward[]) {
    for (const r of rewards) {
      if (r.kind === 'fusion' && r.id && r.pairWith) this.applyFusion(r.id, r.pairWith);
      else if (r.kind === 'heal') {
        this.hp = clamp(this.hp + (r.amount ?? 40), 1, this.maxHp);
        sfx.heal();
      } else if (r.kind === 'gold') {
        this.gold += r.amount ?? 50;
        sfx.gold();
      } else if (r.kind === 'weapon' && r.id) {
        const slot = this.weapons.find((w) => w.id === r.id);
        if (slot && slot.lvl < MAX_RANK) { slot.lvl++; this.recompute(); sfx.rankup(); }
      } else if (r.kind === 'passive' && r.id) {
        const slot = this.passives.find((p) => p.kind === 'p' && p.id === r.id);
        if (slot && slot.kind === 'p' && slot.lvl < PASSIVES[slot.id].ranks.length) { slot.lvl++; this.recompute(); sfx.rankup(); }
      }
    }
    this.uiLock = false;
  }

  private openChest() {
    const rewards: ChestReward[] = [];
    const fusions = this.eligibleFusions();
    if (fusions.length > 0) {
      const f = fusions[0];
      rewards.push({ kind: 'fusion', id: f.a, pairWith: f.b });
    }
    const extras = fusions.length > 0 ? 1 : 2;
    for (let i = 0; i < extras; i++) {
      const roll = Math.random();
      if (roll < 0.35) rewards.push({ kind: 'heal', amount: 40 });
      else if (roll < 0.7) rewards.push({ kind: 'gold', amount: Math.round(30 + this.level * 4 + Math.random() * 40) });
      else {
        const upW = this.weapons.filter((w) => w.lvl < MAX_RANK);
        const upP = this.passives.filter((p): p is { kind: 'p'; id: PassiveId; lvl: number } => p.kind === 'p' && p.lvl < PASSIVES[p.id].ranks.length);
        const all = [...upW.map((w) => ({ kind: 'weapon' as const, id: w.id as CompId })), ...upP.map((p) => ({ kind: 'passive' as const, id: p.id as CompId }))];
        if (all.length > 0) rewards.push({ ...all[Math.floor(Math.random() * all.length)] });
        else rewards.push({ kind: 'gold', amount: 60 });
      }
    }
    this.uiLock = true;
    sfx.chest();
    this.cb.onChest(rewards);
  }

  /* ------------------------------- spawning ------------------------------ */

  private hpScale() { return 1 + Math.pow(this.time / 60, 1.25) * 0.55; }
  private dmgScale() { return 1 + (this.time / GAME_DURATION) * 1.3; }

  private spawnEnemy(def: EnemyDef | BossDef, x?: number, y?: number, bossIdx = -1) {
    if (this.enemies.length > 260) return;
    const ang = rand(0, Math.PI * 2);
    const d = rand(420, 560);
    const ex = x ?? this.px + Math.cos(ang) * d;
    const ey = y ?? this.py + Math.sin(ang) * d;
    const elite = !def.boss && Math.random() < 0.04 + (this.time / GAME_DURATION) * 0.07;
    const hpMul = this.hpScale() * (elite ? 8 : 1);
    const e: Enemy = {
      def, skin: def.skin, x: ex, y: ey,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul,
      r: def.r * (elite ? 1.5 : 1),
      dmg: def.dmg * this.dmgScale() * (elite ? 1.6 : 1),
      speed: def.speed * rand(0.9, 1.12),
      xp: def.xp * (elite ? 5 : 1),
      flash: 0, slow: 0, elite,
      ai: { state: 0, t: rand(0, 2), ax: 0, ay: 0, ang: 0 },
      bossIdx, phase: 0, atkT: 2, cycle: 0, atk: null,
      spikeT: 0, hurtT: 0, seed: Math.random() * 100, dead: false,
    };
    this.enemies.push(e);
    if (def.boss) {
      this.cb.onBanner(`${(def as BossDef).name.toUpperCase()}`, (def as BossDef).title);
      sfx.boss();
      this.shake = 16;
    }
    return e;
  }

  private updateSpawning(dt: number) {
    for (let i = 0; i < BOSSES.length; i++) {
      if (!this.bossSpawned.has(i) && this.time >= BOSSES[i].at) {
        this.bossSpawned.add(i);
        this.spawnEnemy(BOSSES[i], undefined, undefined, i);
      }
    }
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      const prog = this.time / GAME_DURATION;
      this.spawnT = Math.max(0.34, 1.1 - prog * 0.8);
      const batch = 1 + Math.floor(prog * 3.2);
      const avail = ENEMIES.filter((d) => this.time >= d.minTime);
      const total = avail.reduce((a, d) => a + d.weight, 0);
      for (let i = 0; i < batch; i++) {
        let roll = Math.random() * total;
        let def = avail[0];
        for (const d of avail) { roll -= d.weight; if (roll <= 0) { def = d; break; } }
        this.spawnEnemy(def);
      }
    }
  }

  /* ------------------------------ enemy AI -------------------------------- */
  /* Small behavior trees: selector over (telegraphed attack, ranged band, chase). */

  private updateEnemies(dt: number) {
    const px = this.px, py = this.py;
    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 5);
      e.spikeT = Math.max(0, e.spikeT - dt);
      e.hurtT = Math.max(0, e.hurtT - dt);
      e.slow = Math.max(0, e.slow - dt);
      const slowF = e.slow > 0 && !this.st.flags.has('noslow') ? 0.55 : 1;

      if (e.bossIdx >= 0) { this.updateBoss(e, dt, slowF); continue; }

      const dx = px - e.x, dy = py - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d;
      const spd = e.speed * slowF;
      const ai = e.ai;

      switch (e.skin) {
        case 'bat': {
          const wob = Math.sin(this.time * 9 + e.seed) * 90;
          e.x += (nx * spd + -ny * wob * 0.4) * dt;
          e.y += (ny * spd + nx * wob * 0.4) * dt;
          break;
        }
        case 'spitter':
        case 'hexer': {
          const band = e.skin === 'spitter' ? [170, 250] : [210, 290];
          if (ai.state === 0) {
            if (d < band[0]) { e.x -= nx * spd * dt; e.y -= ny * spd * dt; }
            else if (d > band[1]) { e.x += nx * spd * dt; e.y += ny * spd * dt; }
            ai.t -= dt;
            if (ai.t <= 0 && d < band[1] + 60) { ai.state = 1; ai.t = 0.7; }
          } else if (ai.state === 1) {
            ai.t -= dt;
            if (ai.t <= 0) {
              ai.state = 2; ai.t = 1.3;
              if (e.skin === 'spitter') {
                for (let k = -1; k <= 1; k++) this.ebullet(e.x, e.y, Math.atan2(dy, dx) + k * 0.22, 230, e.dmg * 0.8, '#a4d94e', true);
                sfx.shoot();
              } else {
                const cast = Math.floor(e.seed) % 2;
                if (cast === 0) {
                  this.hazards.push({ kind: 'warnc', x: px, y: py, x2: 0, y2: 0, r: 85, ang: 0, t: 0, dur: 3, dmg: e.dmg * 0.5, color: '#c07bff', slow: true, owner: 'e', slot: -1 });
                } else {
                  this.ebullet(e.x, e.y, Math.atan2(dy, dx), 200, e.dmg, '#c07bff', true);
                }
                sfx.zap();
              }
            }
          } else {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 0; ai.t = rand(1.6, 2.6); }
          }
          break;
        }
        case 'archer': {
          if (ai.state === 0) {
            if (d < 220) { e.x -= nx * spd * dt; e.y -= ny * spd * dt; }
            else if (d > 300) { e.x += nx * spd * dt; e.y += ny * spd * dt; }
            ai.t -= dt;
            if (ai.t <= 0 && d < 420) { ai.state = 1; ai.t = 0.6; }
          } else if (ai.state === 1) {
            ai.t -= dt;
            if (ai.t <= 0) {
              ai.state = 2; ai.t = 1.4;
              this.ebullet(e.x, e.y, Math.atan2(dy, dx), 330, e.dmg, '#d8cfae', false);
              sfx.bones();
            }
          } else {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 0; ai.t = rand(1.8, 2.8); }
          }
          break;
        }
        case 'goatkin': {
          if (ai.state === 0) {
            e.x += nx * spd * dt; e.y += ny * spd * dt;
            ai.t -= dt;
            if (ai.t <= 0 && d < 340) { ai.state = 1; ai.t = 0.6; ai.ang = Math.atan2(dy, dx); sfx.telegraph(); }
          } else if (ai.state === 1) {
            ai.t -= dt;
            e.x += Math.cos(ai.ang + Math.PI) * 14 * dt * Math.sin(this.time * 40);
            if (ai.t <= 0) { ai.state = 2; ai.t = 0.65; }
          } else if (ai.state === 2) {
            e.x += Math.cos(ai.ang) * spd * 3.1 * dt;
            e.y += Math.sin(ai.ang) * spd * 3.1 * dt;
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 3; ai.t = 1; }
          } else {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 0; ai.t = rand(2.4, 3.6); }
          }
          break;
        }
        case 'wraith': {
          ai.t -= dt;
          if (ai.state === 0 && ai.t <= 0) { ai.state = 1; ai.t = 0.5; ai.ang = Math.atan2(dy, dx); }
          if (ai.state === 1) {
            e.x += Math.cos(ai.ang) * spd * 2.6 * dt;
            e.y += Math.sin(ai.ang) * spd * 2.6 * dt;
            if (ai.t <= 0) { ai.state = 0; ai.t = 1.8; }
          } else {
            e.x += nx * spd * 0.4 * dt; e.y += ny * spd * 0.4 * dt;
          }
          break;
        }
        case 'shieldkin': {
          ai.ang = Math.atan2(dy, dx);
          e.x += nx * spd * dt; e.y += ny * spd * dt;
          break;
        }
        case 'ghoul': {
          if (ai.state === 0) {
            const ta = e.seed * 7 + Math.floor(this.time / 5);
            const tx = px + Math.cos(ta) * 140, ty = py + Math.sin(ta) * 140;
            const td = Math.hypot(tx - e.x, ty - e.y);
            if (td > 20) { e.x += ((tx - e.x) / td) * spd * 1.9 * dt; e.y += ((ty - e.y) / td) * spd * 1.9 * dt; }
            else { ai.state = 1; ai.t = 0.55; sfx.telegraph(); }
            if (Math.random() < dt * 8) this.puff(e.x, e.y, '#8a7355');
          } else if (ai.state === 1) {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 2; ai.t = 3.5; }
          } else if (ai.state === 2) {
            e.x += nx * spd * 1.15 * dt; e.y += ny * spd * 1.15 * dt;
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 0; }
          }
          break;
        }
        case 'brute': {
          if (ai.state === 0) {
            e.x += nx * spd * dt; e.y += ny * spd * dt;
            ai.t -= dt;
            if (ai.t <= 0 && d < 190) { ai.state = 1; ai.t = 0.8; ai.ax = px; ai.ay = py; sfx.telegraph(); }
          } else if (ai.state === 1) {
            ai.t -= dt;
            if (ai.t <= 0) {
              ai.state = 2; ai.t = 1.2;
              this.hazards.push({ kind: 'burst', x: ai.ax, y: ai.ay, x2: 0, y2: 0, r: 95, ang: 0, t: 0, dur: 0.25, dmg: e.dmg, color: '#d95f4d', slow: false, owner: 'e', slot: -1 });
              this.ring(ai.ax, ai.ay, '#d95f4d', 95);
              this.shakeAt(6);
              sfx.explode();
            }
          } else {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 0; ai.t = rand(2.8, 4); }
          }
          break;
        }
        case 'goblin': {
          e.x += (-nx + Math.sin(this.time * 6 + e.seed) * 0.7) * spd * dt;
          e.y += (-ny + Math.cos(this.time * 6 + e.seed) * 0.7) * spd * dt;
          ai.t -= dt;
          if (ai.t <= 0) { ai.t = 1.4; this.pickups.push({ x: e.x, y: e.y, kind: 'gold', v: 4, t: 0 }); sfx.gold(); }
          break;
        }
        default: {
          e.x += nx * spd * dt; e.y += ny * spd * dt;
        }
      }
      /* contact damage */
      if (e.dmg > 0 && dist2(e.x, e.y, px, py) < (e.r + 15) * (e.r + 15)) {
        this.hurtPlayer(e.dmg, e);
      }
    }
    /* separation */
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead || a.bossIdx >= 0) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead || b.bossIdx >= 0) continue;
        const rr = (a.r + b.r) * 0.6;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 < rr * rr && d2 > 0.01) {
          const d = Math.sqrt(d2);
          const push = ((rr - d) / d) * 0.35;
          const dx = (a.x - b.x) * push, dy = (a.y - b.y) * push;
          a.x += dx; a.y += dy; b.x -= dx; b.y -= dy;
        }
      }
    }
  }

  /* ------------------------------- boss AI -------------------------------- */

  private updateBoss(e: Enemy, dt: number, slowF: number) {
    const def = e.def as BossDef;
    const phs = def.phases;
    const hpPct = e.hp / e.maxHp;
    let ph = 0;
    for (let i = 0; i < phs.length; i++) if (hpPct <= phs[i].at) ph = i;
    if (ph !== e.phase) {
      e.phase = ph;
      const p: BossPhase = phs[ph];
      this.cb.onBanner(p.msg);
      sfx.phase();
      this.ring(e.x, e.y, def.color, 180);
      this.shakeAt(10);
      this.burst(e.x, e.y, 26, def.color, 'spark');
      e.atkT = Math.min(e.atkT, 0.8);
    }
    const phase = phs[e.phase];
    const spd = e.speed * phase.spdMul * slowF;
    const dx = this.px - e.x, dy = this.py - e.y;
    const d = Math.hypot(dx, dy) || 1;

    /* execute current attack */
    if (e.atk) {
      const a = e.atk;
      a.t += dt;
      this.runBossAttack(e, a, dt);
      if (a.t >= a.dur) e.atk = null;
    } else {
      /* approach */
      if (d > e.r + 60) {
        e.x += (dx / d) * spd * dt;
        e.y += (dy / d) * spd * dt;
      }
      e.atkT -= dt;
      if (e.atkT <= 0) {
        const patterns = phase.patterns;
        const type = patterns[e.cycle % patterns.length];
        e.cycle++;
        e.atkT = 2.7 * phase.cdMul;
        e.atk = { type, t: 0, dur: this.atkDuration(type), ax: this.px, ay: this.py, done: false };
        sfx.telegraph();
      }
    }
    if (e.dmg > 0 && dist2(e.x, e.y, this.px, this.py) < (e.r + 15) * (e.r + 15)) {
      this.hurtPlayer(e.dmg, e);
    }
  }

  private atkDuration(type: string): number {
    switch (type) {
      case 'charge': return 1.5;
      case 'spin': return 1.1;
      case 'beams': return 3.2;
      case 'dash': return 1.6;
      default: return 0.7;
    }
  }

  private runBossAttack(e: Enemy, a: { type: string; t: number; dur: number; ax: number; ay: number; done: boolean }, dt: number) {
    const def = e.def as BossDef;
    const angP = Math.atan2(this.py - e.y, this.px - e.x);
    const d = Math.hypot(this.px - e.x, this.py - e.y) || 1;
    switch (a.type) {
      case 'charge': {
        if (a.t < 0.7) {
          if (!a.done) { a.done = true; a.ax = Math.cos(angP); a.ay = Math.sin(angP); sfx.telegraph(); }
          /* telegraph handled by drawing line from boss along ax,ay */
        } else {
          e.x += a.ax * e.speed * 4.2 * dt;
          e.y += a.ay * e.speed * 4.2 * dt;
          if (Math.random() < dt * 30) this.puff(e.x, e.y, def.color);
        }
        break;
      }
      case 'spin': {
        if (!a.done && a.t > 0.55) {
          a.done = true;
          for (let i = 0; i < 16; i++) this.ebullet(e.x, e.y, (i / 16) * Math.PI * 2, 240, e.dmg * 0.5, def.color, false);
          this.ring(e.x, e.y, def.color, 130);
          this.shakeAt(8);
          sfx.explode();
          if (d < 150) this.hurtPlayer(e.dmg, e);
        }
        break;
      }
      case 'summon': {
        if (!a.done) {
          a.done = true;
          const pool = ENEMIES.filter((x) => x.skin === 'risen' || x.skin === 'imp' || x.skin === 'clatter');
          for (let i = 0; i < 6; i++) {
            const sd = pool[Math.floor(Math.random() * pool.length)];
            this.spawnEnemy(sd, e.x + rand(-120, 120), e.y + rand(-120, 120));
          }
          this.burst(e.x, e.y, 18, def.color, 'smoke');
        }
        break;
      }
      case 'spit': {
        if (!a.done) {
          a.done = true;
          for (let k = -2; k <= 2; k++) this.ebullet(e.x, e.y, angP + k * 0.18, 250, e.dmg * 0.6, '#8fd94e', true);
          sfx.shoot();
        }
        break;
      }
      case 'pool': {
        if (!a.done) {
          a.done = true;
          for (let i = 0; i < 3; i++) {
            this.hazards.push({
              kind: 'warnc', x: this.px + rand(-90, 90), y: this.py + rand(-90, 90), x2: 0, y2: 0,
              r: 75, ang: 0, t: 0, dur: 3.4, dmg: e.dmg * 0.45, color: '#8fd94e', slow: true, owner: 'e', slot: -1,
            });
          }
        }
        break;
      }
      case 'dash': {
        const seg = a.dur / 3;
        const si = Math.min(2, Math.floor(a.t / seg));
        const lt = a.t - si * seg;
        if (lt < dt * 1.5 && si < 3) {
          const ta = Math.atan2(this.py - e.y, this.px - e.x);
          e.x += Math.cos(ta) * 190;
          e.y += Math.sin(ta) * 190;
          this.hazards.push({ kind: 'pool', x: e.x, y: e.y, x2: 0, y2: 0, r: 65, ang: 0, t: 0, dur: 2.6, dmg: e.dmg * 0.4, color: '#8fd94e', slow: true, owner: 'e', slot: -1 });
          this.ring(e.x, e.y, '#8fd94e', 60);
        }
        break;
      }
      case 'spray': {
        if (!a.done) {
          a.done = true;
          for (let i = 0; i < 26; i++) this.ebullet(e.x, e.y, (i / 26) * Math.PI * 2, 175, e.dmg * 0.5, '#8fd94e', true);
          sfx.zap();
        }
        break;
      }
      case 'frostbolt': {
        const n = Math.floor(a.t / 0.18);
        const fired = Math.floor((a.t - dt) / 0.18);
        if (n > fired && n <= 3) {
          for (let k = -1; k <= 1; k++) this.ebullet(e.x, e.y, angP + k * 0.15, 290, e.dmg * 0.55, '#7fd4e8', false);
          sfx.zap();
        }
        break;
      }
      case 'nova': {
        if (!a.done) {
          a.done = true;
          for (let i = 0; i < 20; i++) this.ebullet(e.x, e.y, (i / 20) * Math.PI * 2, 210, e.dmg * 0.5, '#7fd4e8', false);
          this.ring(e.x, e.y, '#7fd4e8', 150);
        }
        break;
      }
      case 'blink': {
        if (!a.done) {
          a.done = true;
          this.burst(e.x, e.y, 16, def.color, 'smoke');
          const na = rand(0, Math.PI * 2);
          e.x = this.px + Math.cos(na) * 150;
          e.y = this.py + Math.sin(na) * 150;
          for (let i = 0; i < 14; i++) this.ebullet(e.x, e.y, (i / 14) * Math.PI * 2, 230, e.dmg * 0.5, def.color, false);
          this.ring(e.x, e.y, def.color, 120);
          this.shakeAt(7);
          sfx.explode();
        }
        break;
      }
      case 'beams': {
        if (!a.done) {
          a.done = true;
          const base = rand(0, Math.PI);
          this.hazards.push({ kind: 'beam', x: e.x, y: e.y, x2: 0, y2: 0, r: 460, ang: base, t: 0, dur: 3, dmg: e.dmg * 0.6, color: def.color, slow: false, owner: 'e', slot: -1 });
          this.hazards.push({ kind: 'beam', x: e.x, y: e.y, x2: 0, y2: 0, r: 460, ang: base + Math.PI / 2, t: 0, dur: 3, dmg: e.dmg * 0.6, color: def.color, slow: false, owner: 'e', slot: -1 });
          sfx.zap();
        }
        break;
      }
      case 'meteors': {
        const n = Math.floor(a.t / 0.35);
        const fired = Math.floor((a.t - dt) / 0.35);
        if (n > fired && n <= 5) {
          this.hazards.push({
            kind: 'warnc', x: this.px + rand(-160, 160), y: this.py + rand(-160, 160), x2: 0, y2: 0,
            r: 70, ang: 0, t: 0.75, dur: 0.3, dmg: e.dmg * 0.8, color: def.color, slow: false, owner: 'e', slot: -1,
          });
        }
        break;
      }
      case 'firebolt': {
        if (!a.done) {
          a.done = true;
          for (let k = -1; k <= 2; k++) this.ebullet(e.x, e.y, angP + k * 0.2 - 0.1, 270, e.dmg * 0.55, '#ff8a3d', false);
          sfx.shoot();
        }
        break;
      }
      case 'ring': {
        if (!a.done) {
          a.done = true;
          for (let i = 0; i < 24; i++) this.ebullet(e.x, e.y, (i / 24) * Math.PI * 2, 195, e.dmg * 0.5, '#ff5a3d', false);
          this.ring(e.x, e.y, '#ff5a3d', 140);
        }
        break;
      }
    }
  }

  private ebullet(x: number, y: number, ang: number, spd: number, dmg: number, color: string, poison: boolean) {
    this.ebullets.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, r: 7, dmg, color, life: 4, poison });
  }

  /* ------------------------------ weapons --------------------------------- */

  private nearest(maxD: number): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || (e.skin === 'ghoul' && e.ai.state < 2)) continue;
      const d2 = dist2(e.x, e.y, this.px, this.py);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  private updateWeapons(dt: number) {
    for (let i = 0; i < this.weapons.length; i++) {
      const s = this.weapons[i];
      s.cd -= dt;
      if (s.cd > 0) continue;
      const R = 90 * s.area;
      switch (s.id) {
        case 'hellfire': {
          const t = this.nearest(640);
          if (!t) { s.cd = 0.15; break; }
          const base = Math.atan2(t.y - this.py, t.x - this.px);
          this.fireHellfire(i, base, s);
          s.cd = s.rcd;
          break;
        }
        case 'bonespear': {
          const t = this.nearest(700);
          if (!t) { s.cd = 0.15; break; }
          const base = Math.atan2(t.y - this.py, t.x - this.px);
          this.fireSpears(i, base, s);
          if (s.mods.has('barrage')) setTimeout2(this, 0.18, () => this.fireSpears(i, base + 0.15, s));
          s.cd = s.rcd;
          break;
        }
        case 'aura': {
          const R2 = R * R;
          let hitAny = false;
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (dist2(e.x, e.y, this.px, this.py) < (Math.sqrt(R2) + e.r) * (Math.sqrt(R2) + e.r)) {
              this.damageEnemy(e, s.dmg, i, 0);
              hitAny = true;
            }
          }
          if (hitAny) sfx.hit();
          s.cd = s.rcd;
          break;
        }
        case 'lightning': {
          const t = this.nearest(560);
          if (!t) { s.cd = 0.15; break; }
          this.chainFrom(this.px, this.py, t, s.proj + 2, s, i);
          s.cd = s.rcd;
          sfx.zap();
          break;
        }
        case 'blades': {
          /* damage tick for orbitals is in updateOrbitals; here just ensure count */
          s.cd = s.rcd;
          break;
        }
        case 'caltrops': {
          const back = this.facing < 0 ? 0 : Math.PI;
          for (let k = 0; k < s.proj; k++) {
            const a = back + rand(-1.1, 1.1);
            const d = rand(40, 120) * s.area;
            this.spikes.push({
              x: this.px + Math.cos(a) * d, y: this.py + Math.sin(a) * d,
              t: 0, dur: 2.6 * (1 + (s.area - 1) * 0.5), dmg: s.dmg, slot: i,
            });
          }
          s.cd = s.rcd;
          sfx.bones();
          break;
        }
        case 'whirlwind': {
          const t = this.nearest(R * 1.6);
          if (!t) { s.cd = 0.2; break; }
          this.spinT = 1.15 * (1 + (s.area - 1) * 0.4);
          this.spinSlot = i;
          s.cd = s.rcd;
          sfx.explode();
          break;
        }
        case 'scythe': {
          const t = this.nearest(R * 2.2);
          if (!t) { s.cd = 0.2; break; }
          const dir = Math.atan2(t.y - this.py, t.x - this.px);
          this.sweep(dir, s, i);
          if (s.proj >= 2) setTimeout2(this, 0.12, () => this.sweep(dir + Math.PI, s, i));
          s.cd = s.rcd;
          break;
        }
      }
    }
    /* whirlwind active */
    if (this.spinT > 0) {
      this.spinT -= dt;
      const s = this.weapons[this.spinSlot];
      if (s) {
        const R = 100 * s.area;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d2 = dist2(e.x, e.y, this.px, this.py);
          if (d2 < (R + e.r) * (R + e.r)) {
            if (e.hurtT <= 0) {
              this.damageEnemy(e, s.dmg * 0.9, this.spinSlot, 0);
              e.hurtT = 0.3;
              if (s.mods.has('pull')) {
                const d = Math.sqrt(d2) || 1;
                e.x -= ((e.x - this.px) / d) * 60 * dt * 8;
                e.y -= ((e.y - this.py) / d) * 60 * dt * 8;
              }
              if (s.mods.has('bloodthirst')) this.hp = clamp(this.hp + s.dmg * 0.05, 1, this.maxHp);
            }
          }
        }
        if (Math.random() < dt * 24) {
          const a = rand(0, Math.PI * 2);
          this.particles.push({ x: this.px + Math.cos(a) * R, y: this.py + Math.sin(a) * R, vx: -Math.sin(a) * 120, vy: Math.cos(a) * 120, life: 0.4, maxLife: 0.4, size: 4, color: '#e6404f', kind: 'spark' });
        }
      }
    }
  }
  private spinSlot = 0;

  private fireHellfire(i: number, base: number, s: WeaponSlot) {
    for (let k = 0; k < s.proj; k++) {
      const a = base + (k - (s.proj - 1) / 2) * 0.3;
      this.spawnProj(i, a, 300 * s.pspd, s, 'fire', 13, true);
    }
    sfx.shoot();
  }

  private fireSpears(i: number, base: number, s: WeaponSlot) {
    if (!this.weapons.includes(s)) return;
    for (let k = 0; k < s.proj; k++) {
      const a = base + (k - (s.proj - 1) / 2) * 0.16;
      this.spawnProj(i, a, 430 * s.pspd, s, 'bone', 9, false);
    }
    sfx.bones();
  }

  private spawnProj(i: number, ang: number, spd: number, s: WeaponSlot, kind: string, r: number, trail: boolean) {
    const p: Proj = {
      x: this.px, y: this.py, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      r, dmg: s.dmg, pierce: s.pierce, hit: new Set(), life: 2.2, kind,
      color: WEAPONS[s.id].color, slot: i, knock: s.mods.has('crush') ? 320 : 130, trail,
    };
    this.projs.push(p);
    if (s.mods.has('split') && Math.random() < 0.28) {
      const q = { ...p, hit: new Set<Enemy>(), x: this.px, y: this.py };
      const a2 = ang + (Math.random() < 0.5 ? 0.5 : -0.5);
      q.vx = Math.cos(a2) * spd; q.vy = Math.sin(a2) * spd;
      this.projs.push(q);
      this.puff(this.px, this.py, '#c07bff');
    }
    if (s.mods.has('echo') && Math.random() < 0.35) {
      setTimeout2(this, 0.2, () => {
        if (this.weapons[i] === s) this.spawnProj(i, ang + rand(-0.15, 0.15), spd, s, kind, r, trail);
      });
    }
    /* muzzle flash */
    this.particles.push({ x: this.px + Math.cos(ang) * 22, y: this.py + Math.sin(ang) * 22, vx: Math.cos(ang) * 60, vy: Math.sin(ang) * 60, life: 0.12, maxLife: 0.12, size: 9, color: '#ffc258', kind: 'dot' });
  }

  private chainFrom(x: number, y: number, first: Enemy | null, jumps: number, s: WeaponSlot, slot: number) {
    if (!first) return;
    let cx = x, cy = y;
    let cur: Enemy | null = first;
    const hitSet = new Set<Enemy>();
    for (let j = 0; j < jumps && cur; j++) {
      this.arcs.push({ x1: cx, y1: cy, x2: cur.x, y2: cur.y, t: 0.22, color: WEAPONS[s.id].color });
      hitSet.add(cur);
      this.damageEnemy(cur, s.dmg * (j === 0 ? 1 : 0.75), slot, 60);
      if (s.mods.has('explode')) this.explodeAt(cur.x, cur.y, 70 * s.area, s.dmg * 0.5, slot, s);
      cx = cur.x; cy = cur.y;
      const from = cur;
      let best: Enemy | null = null;
      let bd = 240 * 240 * s.area * s.area;
      for (const e of this.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        const d2 = dist2(e.x, e.y, from.x, from.y);
        if (d2 < bd) { bd = d2; best = e; }
      }
      cur = best;
    }
  }

  private sweep(dir: number, s: WeaponSlot, slot: number) {
    const R = 120 * s.area;
    const arcW = 1.15 * (1 + (s.area - 1) * 0.5);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d2 = dist2(e.x, e.y, this.px, this.py);
      if (d2 > (R + e.r) * (R + e.r)) continue;
      let a = Math.atan2(e.y - this.py, e.x - this.px) - dir;
      while (a > Math.PI) a -= Math.PI * 2;
      while (a < -Math.PI) a += Math.PI * 2;
      if (Math.abs(a) < arcW) {
        this.damageEnemy(e, s.dmg, slot, 170, 1.4);
      }
    }
    /* swing arc visual */
    for (let k = 0; k < 8; k++) {
      const a = dir + (k / 7 - 0.5) * arcW * 2;
      this.particles.push({
        x: this.px + Math.cos(a) * R * 0.8, y: this.py + Math.sin(a) * R * 0.8,
        vx: Math.cos(a + Math.PI / 2) * 160, vy: Math.sin(a + Math.PI / 2) * 160,
        life: 0.25, maxLife: 0.25, size: 5, color: WEAPONS[s.id].color, kind: 'spark',
      });
    }
    sfx.shoot();
  }

  /* --------------------------- projectile update -------------------------- */

  private updateProjs(dt: number) {
    for (const p of this.projs) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.trail && Math.random() < dt * 40) {
        this.particles.push({ x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-15, 15), life: 0.3, maxLife: 0.3, size: p.r * 0.5, color: p.color, kind: 'dot' });
      }
      for (const e of this.enemies) {
        if (e.dead || p.hit.has(e)) continue;
        const rr = e.r + p.r;
        if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
          p.hit.add(e);
          this.onProjHit(p, e);
          if (p.pierce <= 0) { p.life = 0; break; }
          p.pierce--;
        }
      }
      if (p.life <= 0) {
        const s = this.weapons[p.slot];
        if (s && p.kind === 'fire') this.explodeAt(p.x, p.y, 80 * s.area, p.dmg * 0.65, p.slot, s);
      }
    }
    this.projs = this.projs.filter((p) => p.life > 0);
  }

  private onProjHit(p: Proj, e: Enemy) {
    const s = this.weapons[p.slot];
    if (!s) { this.damageEnemy(e, p.dmg, p.slot, p.knock); return; }
    /* shieldkin frontal block */
    if (e.skin === 'shieldkin') {
      const angIn = Math.atan2(p.y - e.y, p.x - e.x);
      let da = angIn - e.ai.ang;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 1.2 && p.pierce < 900) {
        this.floater(e.x, e.y - e.r, 'BLOCK', '#8fa3b8', 11);
        sfx.hit();
        p.pierce = Math.min(p.pierce, 0);
        p.life = p.kind === 'bone' ? p.life : 0;
        return;
      }
    }
    this.damageEnemy(e, p.dmg, p.slot, p.knock);
    const m = s.mods;
    if (m.has('explode')) this.explodeAt(e.x, e.y, 75 * s.area, p.dmg * 0.5, p.slot, s);
    if (m.has('chain')) this.chainFrom(e.x, e.y, this.nearestTo(e, 220 * s.area, e), 3, s, p.slot);
    if (m.has('spikes')) {
      for (let k = 0; k < 3; k++) {
        this.spikes.push({ x: e.x + rand(-30, 30), y: e.y + rand(-30, 30), t: 0, dur: 2.2, dmg: p.dmg * 0.6, slot: p.slot });
      }
    }
    if (m.has('pull')) {
      for (const o of this.enemies) {
        if (o.dead) continue;
        const d2 = dist2(o.x, o.y, e.x, e.y);
        if (d2 < 120 * 120) {
          const d = Math.sqrt(d2) || 1;
          o.x -= ((o.x - e.x) / d) * 40;
          o.y -= ((o.y - e.y) / d) * 40;
        }
      }
    }
  }

  private nearestTo(from: Enemy, maxD: number, exclude?: Enemy): Enemy | null {
    let best: Enemy | null = null;
    let bd = maxD * maxD;
    for (const e of this.enemies) {
      if (e.dead || e === exclude) continue;
      const d2 = dist2(e.x, e.y, from.x, from.y);
      if (d2 < bd) { bd = d2; best = e; }
    }
    return best;
  }

  private explodeAt(x: number, y: number, r: number, dmg: number, slot: number, s: WeaponSlot) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      const rr = r + e.r;
      if (dist2(e.x, e.y, x, y) < rr * rr) this.damageEnemy(e, dmg, slot, 90);
    }
    this.ring(x, y, WEAPONS[s.id].color, r);
    this.burst(x, y, 10, WEAPONS[s.id].color, 'spark');
    if (s.mods.has('inferno')) {
      this.hazards.push({ kind: 'pool', x, y, x2: 0, y2: 0, r: r * 0.8, ang: 0, t: 0, dur: 2.4, dmg: dmg * 0.5, color: '#ff8a3d', slow: false, owner: 'p', slot });
    }
    sfx.explode();
    this.shakeAt(2.5);
  }

  /* ------------------------------ damage ---------------------------------- */

  private damageEnemy(e: Enemy, amount: number, slot: number, knock: number, critBonus = 0) {
    if (e.dead) return;
    const s = this.weapons[slot];
    const critChance = (s ? s.crit : this.st.crit) + critBonus;
    const crit = Math.random() < critChance;
    let dmg = amount * (crit ? 2 : 1) * rand(0.9, 1.1);
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 1;
    this.dmgDealt += dmg;
    this.floater(e.x + rand(-8, 8), e.y - e.r - 6, `${dmg}`, crit ? '#ffc258' : '#f4e8cf', crit ? 17 : 12);
    if (crit) {
      sfx.crit();
      this.freeze = Math.max(this.freeze, 0.03);
    } else if (Math.random() < 0.25) sfx.hit();
    if (knock > 0 && e.bossIdx < 0) {
      const d = Math.hypot(e.x - this.px, e.y - this.py) || 1;
      e.x += ((e.x - this.px) / d) * knock * 0.12;
      e.y += ((e.y - this.py) / d) * knock * 0.12;
    }
    this.burst(e.x, e.y, crit ? 6 : 2, '#a01830', 'dot');
    if (this.st.lifeSteal > 0) this.hp = clamp(this.hp + dmg * this.st.lifeSteal, 1, this.maxHp);
    if (e.hp <= 0) this.killEnemy(e, slot);
  }

  private killEnemy(e: Enemy, slot: number) {
    e.dead = true;
    this.kills++;
    const s = this.weapons[slot];
    /* gore decal */
    if (this.decals.length < 130) {
      this.decals.push({ x: e.x, y: e.y, r: e.r * rand(0.9, 1.5), a: 0.5, color: e.skin === 'clatter' ? '#6b6350' : '#4d0f1c' });
    }
    this.burst(e.x, e.y, e.elite ? 16 : 7, e.def.color, 'shard');
    /* xp */
    const xpVal = e.xp * (this.st.flags.has('erudite') && Math.random() < 0.12 ? 2 : 1);
    this.dropXp(e.x, e.y, xpVal);
    /* gold */
    const goldChance = 0.28 + this.st.luck * 0.5 + (s && s.mods.has('gilded') ? 0.5 : 0);
    if (Math.random() < goldChance) {
      this.pickups.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), kind: 'gold', v: Math.round((3 + Math.random() * 6) * this.st.goldMul), t: 0 });
    }
    if (s && s.mods.has('gilded')) this.burst(e.x, e.y, 5, '#ffc258', 'dot');
    /* chests */
    if (e.elite) this.pickups.push({ x: e.x, y: e.y, kind: 'chest', v: 0, t: 0 });
    if (e.skin === 'goblin') {
      this.pickups.push({ x: e.x, y: e.y, kind: 'chest', v: 0, t: 0 });
      for (let i = 0; i < 6; i++) this.pickups.push({ x: e.x + rand(-40, 40), y: e.y + rand(-40, 40), kind: 'gold', v: Math.round(8 * this.st.goldMul), t: 0 });
      sfx.goblin();
    }
    /* boss death */
    if (e.bossIdx >= 0) {
      this.bossKills++;
      this.timeScale = 0.25;
      this.freeze = 0.1;
      this.shakeAt(18);
      this.ring(e.x, e.y, e.def.color, 260);
      this.burst(e.x, e.y, 40, e.def.color, 'shard');
      this.pickups.push({ x: e.x, y: e.y, kind: 'chest', v: 0, t: 0 });
      this.dropXp(e.x, e.y, e.xp);
      sfx.explode();
      this.cb.onBanner(`${e.def.name.toUpperCase()} SLAIN`);
      if (e.bossIdx === 3) this.finish(true);
    }
  }

  private dropXp(x: number, y: number, v: number) {
    let left = v;
    const tiers = [30, 15, 5, 1];
    const colors = ['#ffc258', '#c07bff', '#7fd4e8', '#9be85e'];
    let ti = 0;
    while (left > 0 && this.pickups.length < 320) {
      while (ti < tiers.length - 1 && left < tiers[ti]) ti++;
      const take = Math.min(left, tiers[ti]);
      this.pickups.push({ x: x + rand(-16, 16), y: y + rand(-16, 16), kind: 'xp', v: take, t: 0 });
      left -= take;
      if (take < tiers[ti]) ti++;
    }
    void colors;
  }

  private hurtPlayer(amount: number, src?: Enemy) {
    if (this.iframe > 0 || this.over || this.uiLock) return;
    let dmg = Math.max(1, amount - this.st.armor);
    if (this.st.flags.has('warded')) dmg *= 0.92;
    dmg = Math.round(dmg);
    this.hp -= dmg;
    this.iframe = 0.55;
    this.redFlash = 0.5;
    this.shakeAt(7);
    sfx.hurt();
    this.floater(this.px, this.py - 26, `-${dmg}`, '#e6404f', 14);
    if (this.st.flags.has('thorns') && src && src.bossIdx < 0) {
      src.hp -= 8 + this.level * 2;
      src.flash = 1;
      if (src.hp <= 0) this.killEnemy(src, 0);
    }
    if (this.st.flags.has('emberheart') && this.emberCd <= 0) {
      this.emberCd = 6;
      this.explodeAt(this.px, this.py, 150, 40 + this.level * 4, 0, { ...this.mkSlot('hellfire'), dmg: 1, area: 1, mods: new Set<string>(['inferno']) } as WeaponSlot);
    }
    if (this.hp <= 0) {
      if (this.st.flags.has('phoenix') && !this.phoenixUsed) {
        this.phoenixUsed = true;
        this.hp = this.maxHp * 0.6;
        this.iframe = 2;
        this.flashT = 0.7;
        this.explodeAt(this.px, this.py, 260, 120, 0, { ...this.mkSlot('hellfire'), dmg: 1, area: 1.5, mods: new Set<string>(['inferno']) } as WeaponSlot);
        this.cb.onBanner('THE PHOENIX REBIRTHS YOU');
        sfx.fuse();
      } else {
        this.finish(false);
      }
    }
  }

  /* ------------------------- passive proc updates ------------------------- */

  private updateProcs(dt: number) {
    const f = this.st.flags;
    if (this.st.regen > 0) this.hp = clamp(this.hp + this.st.regen * dt, 1, this.maxHp);
    this.emberCd = Math.max(0, this.emberCd - dt);

    const anyWard = f.has('bulwark') || this.weapons.some((w) => w.mods.has('ward'));
    if (anyWard) {
      this.wardT -= dt;
      if (this.wardT <= 0) {
        this.wardT = 5;
        this.explodeAt(this.px, this.py, 170 * this.st.areaMul, 25 + this.level * 3, 0, this.weapons[0] ?? ({ ...this.mkSlot('aura'), area: 1.2, mods: new Set<string>() } as WeaponSlot));
        this.ring(this.px, this.py, '#8d7ba8', 170);
      }
    }
    if (f.has('warmonger')) {
      this.warT -= dt;
      if (this.warT <= 0) {
        this.warT = 4;
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (dist2(e.x, e.y, this.px, this.py) < 160 * 160) this.damageEnemy(e, 30 + this.level * 3, 0, 40);
        }
        this.ring(this.px, this.py, '#ff8a3d', 160);
      }
    }
    if (f.has('magnet')) {
      this.magnetT -= dt;
      if (this.magnetT <= 0) { this.magnetT = 8; this.magnetPull = 0.7; sfx.pickup(); }
    }
    this.magnetPull = Math.max(0, this.magnetPull - dt);

    /* weapon-flag procs */
    let hasJudge = false, hasTempest = false, hasMeteor = false, hasErupt = false;
    for (const w of this.weapons) {
      if (w.mods.has('judgment')) hasJudge = true;
      if (w.mods.has('tempest')) hasTempest = true;
      if (w.mods.has('meteorRain')) hasMeteor = true;
      if (w.mods.has('eruption')) hasErupt = true;
    }
    if (hasJudge) {
      this.judgmentT -= dt;
      if (this.judgmentT <= 0) {
        this.judgmentT = 4 / this.st.cdMul;
        const t = this.densestEnemy();
        if (t) {
          this.hazards.push({ kind: 'pillar', x: t.x, y: t.y, x2: 0, y2: 0, r: 70 * this.st.areaMul, ang: 0, t: 0, dur: 0.5, dmg: 60 + this.level * 6, color: '#ffc258', slow: false, owner: 'p', slot: 0 });
          sfx.zap();
        }
      }
    }
    if (hasTempest) {
      this.tempestT -= dt;
      if (this.tempestT <= 0) {
        this.tempestT = 5 / this.st.cdMul;
        this.explodeAt(this.px, this.py, 240 * this.st.areaMul, 50 + this.level * 5, 0, this.weapons[0] ?? ({ ...this.mkSlot('lightning'), area: 1.5, mods: new Set<string>() } as WeaponSlot));
        this.ring(this.px, this.py, '#7fd4e8', 240);
      }
    }
    if (hasMeteor) {
      this.meteorT -= dt;
      if (this.meteorT <= 0) {
        this.meteorT = 6 / this.st.cdMul;
        const targets = this.enemies.filter((e) => !e.dead).slice(0, 5);
        for (const t of targets) {
          this.hazards.push({ kind: 'warnc', x: t.x, y: t.y, x2: 0, y2: 0, r: 78, ang: 0, t: 0, dur: 0.3, dmg: 90 + this.level * 8, color: '#ff8a3d', slow: false, owner: 'p', slot: 0 });
        }
        if (targets.length) sfx.telegraph();
      }
    }
    if (hasErupt) {
      this.eruptionT -= dt;
      if (this.eruptionT <= 0) {
        this.eruptionT = 1.6 / this.st.cdMul;
        const t = this.enemies.filter((e) => !e.dead)[Math.floor(Math.random() * Math.max(1, this.enemies.length))];
        if (t && !t.dead) {
          for (let k = 0; k < 4; k++) this.spikes.push({ x: t.x + rand(-26, 26), y: t.y + rand(-26, 26), t: 0, dur: 2.2, dmg: 24 + this.level * 2, slot: 0 });
          this.ring(t.x, t.y, '#b06cff', 40);
        }
      }
    }
    if (f.has('trail') && this.moving) {
      this.trailT -= dt;
      if (this.trailT <= 0) {
        this.trailT = 0.4;
        this.hazards.push({ kind: 'pool', x: this.px - this.facing * 20, y: this.py + 14, x2: 0, y2: 0, r: 34, ang: 0, t: 0, dur: 0.9, dmg: 12 + this.level, color: '#7fd4e8', slow: false, owner: 'p', slot: 0 });
      }
    }
  }

  private densestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bc = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      let c = 0;
      for (const o of this.enemies) {
        if (o !== e && !o.dead && dist2(e.x, e.y, o.x, o.y) < 130 * 130) c++;
      }
      if (c > bc) { bc = c; best = e; }
    }
    return best ?? this.nearest(600);
  }

  /* ------------------------------ main update ----------------------------- */

  private update(dt: number) {
    this.time += dt;
    this.iframe = Math.max(0, this.iframe - dt);
    this.redFlash = Math.max(0, this.redFlash - dt * 1.6);
    this.flashT = Math.max(0, this.flashT - dt);
    this.shake = Math.max(0, this.shake - dt * 26);

    /* movement */
    let mx = 0, my = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) my -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) my += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) mx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) mx += 1;
    this.moving = mx !== 0 || my !== 0;
    if (this.moving) {
      const len = Math.hypot(mx, my);
      let spd = 185 * this.st.spdMul;
      if (this.spinT > 0) spd *= 0.55;
      this.px += (mx / len) * spd * dt;
      this.py += (my / len) * spd * dt;
      if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
      this.walkT += dt * 11;
      this.aimAng = Math.atan2(my, mx);
    }
    this.cam.x += (this.px - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (this.py - this.cam.y) * Math.min(1, dt * 6);

    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateProjs(dt);
    this.updateOrbitals(dt);
    this.updateProcs(dt);
    this.updateHazards(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);

    /* particles / floaters / arcs / decals */
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 620) this.particles.splice(0, this.particles.length - 620);
    for (const f of this.floaters) { f.y -= 34 * dt; f.t -= dt; }
    this.floaters = this.floaters.filter((f) => f.t > 0);
    for (const a of this.arcs) a.t -= dt;
    this.arcs = this.arcs.filter((a) => a.t > 0);
    for (const d of this.decals) d.a -= dt * 0.02;
    this.decals = this.decals.filter((d) => d.a > 0.05);

    this.enemies = this.enemies.filter((e) => !e.dead);

    /* win by survival */
    if (this.time >= GAME_DURATION && !this.over) this.finish(true);

    /* snapshot */
    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.1;
      this.cb.onSnapshot(this.snapshot());
    }
  }

  /* ------------------------- orbitals & hazards --------------------------- */

  private updateOrbitals(dt: number) {
    this.orbitals = [];
    for (let i = 0; i < this.weapons.length; i++) {
      const s = this.weapons[i];
      if (s.id === 'blades') {
        const n = s.proj + (s.mods.has('orbitals') ? 3 : 0);
        const R = 85 * s.area * (s.mods.has('cyclone') ? 1 + Math.sin(this.time * 2.2) * 0.45 : 1);
        for (let k = 0; k < n; k++) {
          this.orbitals.push({ ang: this.time * 3.4 + (k / n) * Math.PI * 2, r: R, dmg: s.dmg, kind: 'blade', slot: i });
        }
      }
      if (s.mods.has('orbitals') && s.id !== 'blades') {
        for (let k = 0; k < 3; k++) {
          this.orbitals.push({ ang: -this.time * 3 + (k / 3) * Math.PI * 2, r: 95 * s.area, dmg: s.dmg * 0.8, kind: 'blade', slot: i });
        }
      }
      if (s.mods.has('reaper')) {
        this.orbitals.push({ ang: this.time * 2.6, r: 105 * s.area, dmg: s.dmg * 1.1, kind: 'scythe', slot: i });
      }
      if (s.mods.has('ring')) {
        const R = 100 * s.area;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = Math.abs(Math.hypot(e.x - this.px, e.y - this.py) - R);
          if (d < 26 + e.r * 0.5 && e.hurtT <= 0) {
            this.damageEnemy(e, s.dmg * 0.9, i, 60);
            e.hurtT = 0.35;
          }
        }
      }
    }
    this.orbTickT -= dt;
    const tick = this.orbTickT <= 0;
    if (tick) this.orbTickT = 0.4;
    for (const o of this.orbitals) {
      const ox = this.px + Math.cos(o.ang) * o.r;
      const oy = this.py + Math.sin(o.ang) * o.r;
      if (tick) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (dist2(e.x, e.y, ox, oy) < (e.r + 16) * (e.r + 16)) {
            this.damageEnemy(e, o.dmg, o.slot, 90);
            if (Math.random() < 0.4) this.puff(ox, oy, '#c9d4e4');
            break;
          }
        }
      }
    }
  }

  private updateHazards(dt: number) {
    for (const h of this.hazards) {
      h.t += dt;
      if (h.kind === 'warnc') {
        if (h.t >= h.dur * 0 + (h.owner === 'e' ? 0.8 : 0.8)) {
          /* convert to active pool or burst */
          if (h.slow) h.kind = 'pool';
          else {
            h.kind = 'burst';
            h.t = 0;
            h.dur = 0.3;
            if (h.owner === 'p') {
              const rr = h.r * h.r;
              for (const e of this.enemies) {
                if (e.dead) continue;
                if (dist2(e.x, e.y, h.x, h.y) < (h.r + e.r) * (h.r + e.r)) this.damageEnemy(e, h.dmg, h.slot, 80);
              }
              void rr;
            }
            this.ring(h.x, h.y, h.color, h.r);
            this.shakeAt(4);
            sfx.explode();
          }
          h.t = 0;
        }
        continue;
      }
      if (h.kind === 'pool') {
        const rr = h.r * h.r;
        if (h.owner === 'e') {
          if (dist2(this.px, this.py, h.x, h.y) < rr && this.iframe <= 0) this.hurtPlayer(h.dmg);
        } else {
          for (const e of this.enemies) {
            if (e.dead || e.spikeT > 0) continue;
            if (dist2(e.x, e.y, h.x, h.y) < (h.r + e.r * 0.5) * (h.r + e.r * 0.5)) {
              this.damageEnemy(e, h.dmg, h.slot, 0);
              e.spikeT = 0.5;
            }
          }
        }
        if (Math.random() < dt * 10) this.puff(h.x + rand(-h.r, h.r) * 0.7, h.y + rand(-h.r, h.r) * 0.7, h.color);
      } else if (h.kind === 'beam') {
        h.ang += dt * 1.1;
        const ex = h.x + Math.cos(h.ang) * h.r;
        const ey = h.y + Math.sin(h.ang) * h.r;
        /* distance from player to segment */
        const L2 = h.r * h.r;
        let t = ((this.px - h.x) * (ex - h.x) + (this.py - h.y) * (ey - h.y)) / L2;
        t = clamp(t, 0, 1);
        const cx = h.x + (ex - h.x) * t, cy = h.y + (ey - h.y) * t;
        if (dist2(this.px, this.py, cx, cy) < 18 * 18 && this.iframe <= 0) this.hurtPlayer(h.dmg);
      } else if (h.kind === 'burst') {
        if (h.owner === 'e' && dist2(this.px, this.py, h.x, h.y) < h.r * h.r && this.iframe <= 0 && h.t < 0.2) {
          this.hurtPlayer(h.dmg);
        }
      } else if (h.kind === 'pillar') {
        if (h.t < 0.15 && h.t + dt >= 0.05) {
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (dist2(e.x, e.y, h.x, h.y) < (h.r + e.r) * (h.r + e.r)) this.damageEnemy(e, h.dmg, h.slot, 80);
          }
          this.ring(h.x, h.y, h.color, h.r);
          this.shakeAt(4);
          sfx.zap();
        }
      }
    }
    this.hazards = this.hazards.filter((h) => {
      if (h.kind === 'warnc') return h.t < 0.8;
      return h.t < h.dur;
    });
    /* spikes */
    for (const sp of this.spikes) {
      sp.t += dt;
      for (const e of this.enemies) {
        if (e.dead || e.spikeT > 0) continue;
        if (dist2(e.x, e.y, sp.x, sp.y) < (e.r + 12) * (e.r + 12)) {
          this.damageEnemy(e, sp.dmg, sp.slot, 40);
          e.spikeT = 0.5;
          sfx.hit();
        }
      }
    }
    this.spikes = this.spikes.filter((s) => s.t < s.dur);
  }

  private updateBullets(dt: number) {
    for (const b of this.ebullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (dist2(b.x, b.y, this.px, this.py) < (b.r + 13) * (b.r + 13)) {
        b.life = 0;
        if (this.iframe <= 0) {
          this.hurtPlayer(b.dmg);
          if (b.poison) this.redFlash = Math.max(this.redFlash, 0.3);
        }
      }
    }
    this.ebullets = this.ebullets.filter((b) => b.life > 0);
  }

  private updatePickups(dt: number) {
    const pr = 62 * this.st.pickup;
    const pr2 = pr * pr;
    for (const p of this.pickups) {
      p.t += dt;
      const d2 = dist2(p.x, p.y, this.px, this.py);
      if (this.magnetPull > 0 && p.kind !== 'chest') {
        const d = Math.sqrt(d2) || 1;
        p.x -= ((p.x - this.px) / d) * 700 * dt;
        p.y -= ((p.y - this.py) / d) * 700 * dt;
      } else if (d2 < pr2 && p.kind !== 'chest') {
        const d = Math.sqrt(d2) || 1;
        const pull = 520;
        p.x -= ((p.x - this.px) / d) * pull * dt;
        p.y -= ((p.y - this.py) / d) * pull * dt;
      }
      if (d2 < 22 * 22) {
        p.t = -999;
        if (p.kind === 'xp') {
          this.gainXp(Math.round(p.v * this.st.xpMul));
          sfx.pickup();
        } else if (p.kind === 'gold') {
          this.gold += p.v;
          if (this.st.goldHeal > 0) this.hp = clamp(this.hp + this.st.goldHeal, 1, this.maxHp);
          sfx.gold();
        } else if (p.kind === 'heal') {
          this.hp = clamp(this.hp + 30, 1, this.maxHp);
          sfx.heal();
        } else if (p.kind === 'chest') {
          this.openChest();
        }
      }
    }
    this.pickups = this.pickups.filter((p) => p.t > -900);
  }

  private gainXp(v: number) {
    this.xp += v;
    while (this.xp >= xpForLevel(this.level)) {
      this.xp -= xpForLevel(this.level);
      this.level++;
      this.pendingLevels++;
    }
    if (this.pendingLevels > 0 && !this.uiLock) {
      this.pendingLevels--;
      this.uiLock = true;
      sfx.levelup();
      this.flashT = Math.max(this.flashT, 0.25);
      this.cb.onLevelUp(this.buildChoices());
    }
  }

  /* ------------------------------- finish --------------------------------- */

  private finish(victory: boolean) {
    if (this.over) return;
    this.over = true;
    if (victory) sfx.victory();
    else {
      sfx.death();
      this.burst(this.px, this.py, 40, '#e6404f', 'shard');
      this.shakeAt(16);
    }
    const stats: EndStats = {
      victory,
      time: Math.min(this.time, GAME_DURATION),
      level: this.level,
      kills: this.kills,
      gold: this.gold,
      dmgDealt: Math.round(this.dmgDealt),
      evolutions: this.fusionNames.length,
      fusions: this.fusionNames,
      bossKills: this.bossKills,
      stats: [
        { label: 'Damage dealt', value: Math.round(this.dmgDealt).toLocaleString() },
        { label: 'Demons slain', value: this.kills.toLocaleString() },
        { label: 'Gold hoarded', value: this.gold.toLocaleString() },
        { label: 'Level reached', value: `${this.level}` },
        { label: 'Bosses slain', value: `${this.bossKills} / 4` },
        { label: 'Evolutions', value: `${this.fusionNames.length}` },
      ],
    };
    setTimeout(() => this.cb.onEnd(stats), victory ? 900 : 1200);
  }

  /* ------------------------------- snapshot ------------------------------- */

  private snapshot(): Snapshot {
    const weapons: SnapshotWeapon[] = this.weapons.map((w) => ({
      id: w.id, lvl: w.lvl, fused: !!w.fused,
      fusedName: w.fused?.def.name, fusedWith: w.fused?.partner,
    }));
    const passives: SnapshotPassive[] = this.passives.map((p) =>
      p.kind === 'p'
        ? { id: p.id, lvl: p.lvl, fused: false }
        : { id: p.a, lvl: MAX_RANK, fused: true, fusedName: p.def.name, proc: p.def.proc },
    );
    let boss = null;
    for (const e of this.enemies) {
      if (e.bossIdx >= 0 && !e.dead) {
        boss = {
          name: `${(e.def as BossDef).name} — ${(e.def as BossDef).title}`,
          hpPct: clamp(e.hp / e.maxHp, 0, 1),
          phase: e.phase + 1,
          phases: (e.def as BossDef).phases.length,
        };
        break;
      }
    }
    return {
      hp: Math.max(0, Math.ceil(this.hp)), maxHp: this.maxHp,
      level: this.level, xp: this.xp, xpNeed: xpForLevel(this.level),
      time: this.time, duration: GAME_DURATION,
      kills: this.kills, gold: this.gold,
      weapons, passives, boss,
      muted: false,
    };
  }

  /* ------------------------------ fx helpers ------------------------------ */

  private shakeAt(v: number) { this.shake = Math.max(this.shake, v); }

  private burst(x: number, y: number, n: number, color: string, kind: Particle['kind']) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(40, kind === 'smoke' ? 90 : 240);
      this.particles.push({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (kind === 'smoke' ? 40 : 0),
        life: rand(0.25, 0.6), maxLife: 0.6, size: rand(2, kind === 'shard' ? 7 : 5), color, kind,
      });
    }
  }

  private ring(x: number, y: number, color: string, r: number) {
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, maxLife: 0.35, size: r, color, kind: 'ring' });
  }

  private puff(x: number, y: number, color: string) {
    this.particles.push({ x, y, vx: rand(-20, 20), vy: rand(-40, -10), life: 0.5, maxLife: 0.5, size: rand(3, 6), color, kind: 'smoke' });
  }

  private floater(x: number, y: number, txt: string, color: string, size: number) {
    if (this.floaters.length > 60) this.floaters.shift();
    this.floaters.push({ x, y, t: 0.8, txt, color, size });
  }

  /* ================================= DRAW ================================= */

  private loop = (now: number) => {
    this.raf = requestAnimationFrame(this.loop);
    let raw = (now - this.last) / 1000;
    this.last = now;
    raw = Math.min(raw, 0.05);
    if (!this.paused && !this.uiLock && this.deathT < 0) {
      if (this.freeze > 0) {
        this.freeze -= raw;
      } else {
        this.timeScale += (1 - this.timeScale) * Math.min(1, raw * 2.2);
        this.update(raw * this.timeScale);
      }
    }
    this.draw();
  };

  private draw() {
    const c = this.c;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.fillStyle = '#191026';
    c.fillRect(0, 0, this.W, this.H);

    const shx = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    const shy = this.shake > 0 ? rand(-this.shake, this.shake) : 0;
    const ox = this.W / 2 - this.cam.x + shx;
    const oy = this.H / 2 - this.cam.y + shy;

    this.drawFloor(c, ox, oy);

    c.save();
    c.translate(ox, oy);

    /* decals */
    for (const d of this.decals) {
      c.globalAlpha = d.a * 0.6;
      c.fillStyle = d.color;
      c.beginPath();
      c.ellipse(d.x, d.y, d.r, d.r * 0.65, 0, 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    /* hazard visuals under entities */
    this.drawHazardsUnder(c);

    /* pickups */
    for (const p of this.pickups) this.drawPickup(c, p);

    /* spikes */
    for (const sp of this.spikes) {
      const s = Math.min(1, sp.t * 6);
      c.save();
      c.translate(sp.x, sp.y);
      c.scale(s, s);
      c.fillStyle = '#3d2a55';
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-7, 4); c.lineTo(0, -9); c.lineTo(7, 4); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = '#b06cff';
      c.beginPath();
      c.moveTo(-2, 1); c.lineTo(0, -5); c.lineTo(2, 1); c.closePath();
      c.fill();
      c.restore();
    }

    /* enemies sorted by y */
    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) this.drawEnemy(c, e);

    /* player */
    if (!this.over || this.deathT >= 0) this.drawPlayer(c);

    /* orbitals */
    for (const o of this.orbitals) {
      const x = this.px + Math.cos(o.ang) * o.r;
      const y = this.py + Math.sin(o.ang) * o.r;
      c.save();
      c.translate(x, y);
      c.rotate(o.ang + Math.PI / 2);
      if (o.kind === 'blade') {
        c.fillStyle = '#c9d4e4';
        c.strokeStyle = '#120a1c';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(0, -11); c.lineTo(5, 6); c.lineTo(-5, 6); c.closePath();
        c.fill(); c.stroke();
      } else {
        c.fillStyle = '#9be85e';
        c.strokeStyle = '#120a1c';
        c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-8, 6); c.quadraticCurveTo(-10, -8, 6, -10);
        c.quadraticCurveTo(10, -10, 10, -6);
        c.quadraticCurveTo(0, -4, -2, 6);
        c.closePath();
        c.fill(); c.stroke();
      }
      c.restore();
    }

    /* aura rings */
    for (const s of this.weapons) {
      if (s.id === 'aura') {
        const R = 90 * s.area;
        c.globalAlpha = 0.12 + Math.sin(this.time * 5) * 0.04;
        c.fillStyle = '#ffc258';
        c.beginPath(); c.arc(this.px, this.py, R, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.8;
        c.strokeStyle = '#ffc258';
        c.lineWidth = 3;
        c.setLineDash([14, 10]);
        c.lineDashOffset = -this.time * 60;
        c.beginPath(); c.arc(this.px, this.py, R, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
      if (s.mods.has('ring') && s.id !== 'aura') {
        const R = 100 * s.area;
        c.globalAlpha = 0.5;
        c.strokeStyle = '#8d7ba8';
        c.lineWidth = 4;
        c.setLineDash([6, 12]);
        c.lineDashOffset = this.time * 50;
        c.beginPath(); c.arc(this.px, this.py, R, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
    }

    /* whirlwind visual */
    if (this.spinT > 0) {
      const s = this.weapons[this.spinSlot];
      if (s) {
        const R = 100 * s.area;
        c.globalAlpha = 0.2;
        c.fillStyle = '#e6404f';
        c.beginPath(); c.arc(this.px, this.py, R, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.8;
        c.strokeStyle = '#e6404f';
        c.lineWidth = 4;
        for (let k = 0; k < 3; k++) {
          const a0 = this.time * 14 + (k * Math.PI * 2) / 3;
          c.beginPath();
          c.arc(this.px, this.py, R * (0.5 + k * 0.22), a0, a0 + 1.6);
          c.stroke();
        }
        c.globalAlpha = 1;
      }
    }

    /* projectiles */
    for (const p of this.projs) this.drawProj(c, p);

    /* lightning arcs */
    for (const a of this.arcs) {
      c.globalAlpha = a.t / 0.22;
      c.strokeStyle = a.color;
      c.lineWidth = 3;
      c.beginPath();
      const mx = (a.x1 + a.x2) / 2 + rand(-14, 14);
      const my = (a.y1 + a.y2) / 2 + rand(-14, 14);
      c.moveTo(a.x1, a.y1);
      c.lineTo(mx, my);
      c.lineTo(a.x2, a.y2);
      c.stroke();
      c.globalAlpha = 1;
    }

    /* enemy bullets */
    for (const b of this.ebullets) {
      c.fillStyle = b.color;
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.55)';
      c.beginPath();
      c.arc(b.x - 2, b.y - 2, b.r * 0.35, 0, Math.PI * 2);
      c.fill();
    }

    /* particles */
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      if (p.kind === 'ring') {
        c.globalAlpha = t;
        c.strokeStyle = p.color;
        c.lineWidth = 5 * t + 1;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
        c.stroke();
      } else {
        c.globalAlpha = t;
        c.fillStyle = p.color;
        if (p.kind === 'shard') {
          c.save();
          c.translate(p.x, p.y);
          c.rotate(p.vx * 0.02);
          c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          c.restore();
        } else {
          c.beginPath();
          c.arc(p.x, p.y, p.size * t + 0.5, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.globalAlpha = 1;

    /* beams over entities */
    for (const h of this.hazards) {
      if (h.kind === 'beam') {
        const ex = h.x + Math.cos(h.ang) * h.r;
        const ey = h.y + Math.sin(h.ang) * h.r;
        const g = c.createLinearGradient(h.x, h.y, ex, ey);
        g.addColorStop(0, h.color);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.globalAlpha = 0.85;
        c.strokeStyle = g;
        c.lineWidth = 16;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(ex, ey); c.stroke();
        c.lineWidth = 6;
        c.strokeStyle = '#ffffff';
        c.globalAlpha = 0.7;
        c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(ex, ey); c.stroke();
        c.globalAlpha = 1;
      } else if (h.kind === 'pillar') {
        const a = clamp(h.t / 0.5, 0, 1);
        c.globalAlpha = 1 - a;
        c.fillStyle = h.color;
        c.fillRect(h.x - h.r * 0.4, h.y - 700 * (1 - a * 0.3), h.r * 0.8, 700);
        c.globalAlpha = (1 - a) * 0.5;
        c.fillRect(h.x - h.r, h.y - 700, h.r * 2, 700);
        c.globalAlpha = 1;
      }
    }

    /* charge telegraphs */
    for (const e of this.enemies) {
      if (e.bossIdx >= 0 && e.atk && e.atk.type === 'charge' && e.atk.t < 0.7) {
        c.globalAlpha = 0.5 + Math.sin(this.time * 20) * 0.25;
        c.strokeStyle = '#e6404f';
        c.lineWidth = 5;
        c.setLineDash([16, 12]);
        c.beginPath();
        c.moveTo(e.x, e.y);
        c.lineTo(e.x + e.atk.ax * 420, e.y + e.atk.ay * 420);
        c.stroke();
        c.setLineDash([]);
        c.globalAlpha = 1;
      }
    }

    /* floaters */
    c.textAlign = 'center';
    for (const f of this.floaters) {
      c.globalAlpha = clamp(f.t / 0.3, 0, 1);
      c.font = `900 ${f.size}px Nunito, sans-serif`;
      c.strokeStyle = '#120a1c';
      c.lineWidth = 4;
      c.strokeText(f.txt, f.x, f.y);
      c.fillStyle = f.color;
      c.fillText(f.txt, f.x, f.y);
    }
    c.globalAlpha = 1;

    c.restore();

    /* vignette + flashes */
    const vg = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,2,12,0.62)');
    c.fillStyle = vg;
    c.fillRect(0, 0, this.W, this.H);

    if (this.redFlash > 0) {
      c.globalAlpha = this.redFlash * 0.35;
      c.fillStyle = '#a00f22';
      c.fillRect(0, 0, this.W, this.H);
      c.globalAlpha = 1;
    }
    if (this.flashT > 0) {
      c.globalAlpha = this.flashT * 0.7;
      const fg = c.createRadialGradient(this.W / 2, this.H / 2, 0, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.6);
      fg.addColorStop(0, '#fff6dd');
      fg.addColorStop(1, 'rgba(255,194,88,0)');
      c.fillStyle = fg;
      c.fillRect(0, 0, this.W, this.H);
      c.globalAlpha = 1;
    }
    if (this.hp / this.maxHp < 0.3 && !this.over) {
      c.globalAlpha = 0.22 + Math.sin(this.time * 6) * 0.1;
      const lg = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.3, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.7);
      lg.addColorStop(0, 'rgba(160,15,34,0)');
      lg.addColorStop(1, 'rgba(160,15,34,0.9)');
      c.fillStyle = lg;
      c.fillRect(0, 0, this.W, this.H);
      c.globalAlpha = 1;
    }
  }

  private drawFloor(c: CanvasRenderingContext2D, ox: number, oy: number) {
    const T = 72;
    const x0 = Math.floor(-ox / T) - 1;
    const y0 = Math.floor(-oy / T) - 1;
    const x1 = Math.ceil((this.W - ox) / T) + 1;
    const y1 = Math.ceil((this.H - oy) / T) + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const h = hash2(tx, ty);
        const px = tx * T + ox;
        const py = ty * T + oy;
        c.fillStyle = h < 0.12 ? '#1d1330' : h < 0.2 ? '#17102a' : '#191026';
        c.fillRect(px, py, T, T);
        if (h > 0.93) {
          c.strokeStyle = 'rgba(77,47,107,0.5)';
          c.lineWidth = 2;
          c.beginPath();
          const cx = px + T * hash2(tx + 7, ty);
          const cy = py + T * hash2(tx, ty + 7);
          c.moveTo(cx - 12, cy - 8);
          c.lineTo(cx + 4, cy + 2);
          c.lineTo(cx + 14, cy + 12);
          c.stroke();
        } else if (h > 0.905) {
          /* bones */
          c.strokeStyle = 'rgba(216,198,154,0.4)';
          c.lineWidth = 3;
          c.beginPath();
          c.arc(px + T * 0.5, py + T * 0.5, 6, 0.4, 2.7);
          c.stroke();
        } else if (h > 0.885) {
          /* glowing mushroom */
          const gx = px + T * 0.5, gy = py + T * 0.5;
          c.fillStyle = `rgba(192,123,255,${0.25 + Math.sin(this.time * 2 + tx * 3 + ty) * 0.12})`;
          c.beginPath();
          c.arc(gx, gy, 4, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(192,123,255,0.1)';
          c.beginPath();
          c.arc(gx, gy, 11, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }

  private drawHazardsUnder(c: CanvasRenderingContext2D) {
    for (const h of this.hazards) {
      if (h.kind === 'pool') {
        const a = clamp(1 - h.t / h.dur, 0, 1);
        c.globalAlpha = 0.4 * a + 0.1;
        c.fillStyle = h.color;
        c.beginPath();
        c.ellipse(h.x, h.y, h.r, h.r * 0.72, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 0.7 * a;
        c.strokeStyle = h.color;
        c.lineWidth = 2.5;
        c.beginPath();
        c.ellipse(h.x, h.y, h.r * (0.7 + Math.sin(this.time * 6) * 0.06), h.r * 0.5, 0, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      } else if (h.kind === 'warnc') {
        const p = clamp(h.t / 0.8, 0, 1);
        c.globalAlpha = 0.25 + Math.sin(this.time * 16) * 0.12;
        c.fillStyle = h.color;
        c.beginPath(); c.arc(h.x, h.y, h.r, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.9;
        c.strokeStyle = h.color;
        c.lineWidth = 3;
        c.beginPath(); c.arc(h.x, h.y, h.r * (1 - p * 0.5), 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
      }
    }
  }

  private drawPickup(c: CanvasRenderingContext2D, p: Pickup) {
    const bob = Math.sin(p.t * 5 + p.x) * 3;
    if (p.kind === 'xp') {
      const col = p.v >= 30 ? '#ffc258' : p.v >= 15 ? '#c07bff' : p.v >= 5 ? '#7fd4e8' : '#9be85e';
      const r = p.v >= 30 ? 9 : p.v >= 15 ? 8 : p.v >= 5 ? 6.5 : 5;
      c.save();
      c.translate(p.x, p.y + bob);
      c.rotate(p.t * 2);
      c.fillStyle = col;
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        c.lineTo(Math.cos(a + Math.PI / 4) * r * 0.45, Math.sin(a + Math.PI / 4) * r * 0.45);
      }
      c.closePath();
      c.fill(); c.stroke();
      c.restore();
    } else if (p.kind === 'gold') {
      c.save();
      c.translate(p.x, p.y + bob);
      c.fillStyle = '#ffc258';
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath(); c.ellipse(0, 0, 7, 5.5, 0, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#a5721d';
      c.font = '900 8px Nunito';
      c.textAlign = 'center';
      c.fillText('$', 0, 3);
      c.restore();
    } else if (p.kind === 'heal') {
      c.save();
      c.translate(p.x, p.y + bob);
      c.fillStyle = '#e6404f';
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(0, 0, 9, 0, Math.PI * 2);
      c.fill(); c.stroke();
      c.fillStyle = '#fff';
      c.fillRect(-5, -1.5, 10, 3);
      c.fillRect(-1.5, -5, 3, 10);
      c.restore();
    } else {
      /* chest */
      c.save();
      c.translate(p.x, p.y + bob);
      c.rotate(Math.sin(p.t * 8) * 0.06);
      c.fillStyle = '#8a5a2b';
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2.5;
      c.fillRect(-14, -10, 28, 20);
      c.strokeRect(-14, -10, 28, 20);
      c.fillStyle = '#b07a3d';
      c.fillRect(-14, -10, 28, 8);
      c.strokeRect(-14, -10, 28, 8);
      c.fillStyle = '#ffc258';
      c.fillRect(-4, -6, 8, 10);
      c.strokeRect(-4, -6, 8, 10);
      c.globalAlpha = 0.5 + Math.sin(p.t * 6) * 0.3;
      c.strokeStyle = '#ffc258';
      c.lineWidth = 2;
      c.strokeRect(-18, -14, 36, 28);
      c.globalAlpha = 1;
      c.restore();
    }
  }

  private drawProj(c: CanvasRenderingContext2D, p: Proj) {
    c.save();
    c.translate(p.x, p.y);
    if (p.kind === 'fire') {
      const g = c.createRadialGradient(0, 0, 2, 0, 0, p.r + 6);
      g.addColorStop(0, '#fff3c4');
      g.addColorStop(0.5, '#ff8a3d');
      g.addColorStop(1, 'rgba(230,64,79,0)');
      c.fillStyle = g;
      c.beginPath(); c.arc(0, 0, p.r + 6, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffc258';
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath(); c.arc(0, 0, p.r * 0.75, 0, Math.PI * 2); c.fill(); c.stroke();
    } else {
      c.rotate(Math.atan2(p.vy, p.vx));
      c.fillStyle = '#f4e8cf';
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(14, 0); c.lineTo(-10, -4.5); c.lineTo(-6, 0); c.lineTo(-10, 4.5);
      c.closePath();
      c.fill(); c.stroke();
    }
    c.restore();
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const x = this.px, y = this.py;
    const bob = this.moving ? Math.sin(this.walkT) * 2.4 : Math.sin(this.time * 2.5) * 1.4;
    const cls = CLASSES[this.classId];
    c.save();
    c.translate(x, y + bob);
    if (this.iframe > 0 && Math.floor(this.time * 18) % 2 === 0) c.globalAlpha = 0.55;
    /* shadow */
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, 16 - bob, 14, 5.5, 0, 0, Math.PI * 2);
    c.fill();
    /* cape */
    c.fillStyle = cls.color;
    c.strokeStyle = '#120a1c';
    c.lineWidth = 2.5;
    c.beginPath();
    c.moveTo(-9, -6);
    c.quadraticCurveTo(-13 - this.facing * 2, 10, -7 + Math.sin(this.walkT) * 2, 16);
    c.lineTo(7 + Math.sin(this.walkT + 1) * 2, 16);
    c.quadraticCurveTo(13, 8, 9, -6);
    c.closePath();
    c.fill(); c.stroke();
    /* body */
    c.fillStyle = '#3d2a55';
    c.beginPath();
    c.roundRect(-8, -6, 16, 18, 6);
    c.fill(); c.stroke();
    /* hood/head */
    c.fillStyle = '#2a1a40';
    c.beginPath();
    c.arc(0, -10, 9.5, 0, Math.PI * 2);
    c.fill(); c.stroke();
    /* eyes */
    c.fillStyle = cls.color;
    c.beginPath();
    c.arc(this.facing * 3 - 2.4, -10, 2, 0, Math.PI * 2);
    c.arc(this.facing * 3 + 2.4, -10, 2, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy) {
    const t = this.time + e.seed;
    const x = e.x, y = e.y;
    if (e.skin === 'ghoul' && e.ai.state === 0) {
      /* burrowed: dust mound */
      c.fillStyle = 'rgba(138,115,85,0.7)';
      c.beginPath();
      c.ellipse(x, y, e.r, e.r * 0.5, 0, Math.PI, 0);
      c.fill();
      return;
    }
    const wob = Math.sin(t * (e.speed / 9)) * 0.08;
    c.save();
    c.translate(x, y);
    /* shadow */
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath();
    c.ellipse(0, e.r * 0.85, e.r * 0.9, e.r * 0.32, 0, 0, Math.PI * 2);
    c.fill();
    if (e.elite) {
      c.strokeStyle = '#ffc258';
      c.lineWidth = 3;
      c.globalAlpha = 0.7 + Math.sin(t * 6) * 0.3;
      c.beginPath(); c.arc(0, 0, e.r + 6, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    c.rotate(wob * (e.bossIdx >= 0 ? 0.3 : 1));
    const body = (col: string, rMul = 1) => {
      c.fillStyle = col;
      c.strokeStyle = '#120a1c';
      c.lineWidth = e.r > 20 ? 3.4 : 2.4;
      c.beginPath();
      c.arc(0, 0, e.r * rMul, 0, Math.PI * 2);
      c.fill(); c.stroke();
    };
    const eyes = (dx: number, dy: number, col = '#ffdd55', r = Math.max(2, e.r * 0.16)) => {
      c.fillStyle = col;
      c.beginPath();
      c.arc(-dx, dy, r, 0, Math.PI * 2);
      c.arc(dx, dy, r, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = '#120a1c';
      c.beginPath();
      c.arc(-dx, dy, r * 0.45, 0, Math.PI * 2);
      c.arc(dx, dy, r * 0.45, 0, Math.PI * 2);
      c.fill();
    };
    const horns = (col: string) => {
      c.fillStyle = col;
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(-e.r * 0.55, -e.r * 0.7); c.lineTo(-e.r * 0.85, -e.r * 1.25); c.lineTo(-e.r * 0.3, -e.r * 0.9);
      c.closePath(); c.fill(); c.stroke();
      c.beginPath();
      c.moveTo(e.r * 0.55, -e.r * 0.7); c.lineTo(e.r * 0.85, -e.r * 1.25); c.lineTo(e.r * 0.3, -e.r * 0.9);
      c.closePath(); c.fill(); c.stroke();
    };

    switch (e.skin) {
      case 'risen': {
        body('#7cb356');
        eyes(e.r * 0.3, -e.r * 0.15, '#e8ff9b');
        c.strokeStyle = '#120a1c'; c.lineWidth = 2;
        c.beginPath(); c.arc(0, e.r * 0.3, e.r * 0.3, 0.3, Math.PI - 0.3); c.stroke();
        break;
      }
      case 'clatter': {
        body('#e8e0cc');
        c.fillStyle = '#120a1c';
        c.beginPath();
        c.arc(-e.r * 0.3, -e.r * 0.1, e.r * 0.22, 0, Math.PI * 2);
        c.arc(e.r * 0.3, -e.r * 0.1, e.r * 0.22, 0, Math.PI * 2);
        c.fill();
        c.fillRect(-e.r * 0.35, e.r * 0.3, e.r * 0.7, e.r * 0.16);
        break;
      }
      case 'imp': {
        body('#ff9d4d');
        horns('#c96a2b');
        eyes(e.r * 0.3, -e.r * 0.1, '#fff2b0');
        break;
      }
      case 'bat': {
        const flap = Math.sin(t * 22) * 0.7;
        c.fillStyle = '#9b7bd8';
        c.strokeStyle = '#120a1c';
        c.lineWidth = 2;
        for (const s of [-1, 1]) {
          c.save();
          c.scale(s, 1);
          c.rotate(flap * s);
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(e.r * 1.6, -e.r * 1.2, e.r * 2, 0);
          c.quadraticCurveTo(e.r * 1.2, e.r * 0.2, 0, e.r * 0.4);
          c.closePath();
          c.fill(); c.stroke();
          c.restore();
        }
        body('#7a5bb0', 0.8);
        eyes(e.r * 0.25, -e.r * 0.1, '#ff6b7d', 2.4);
        break;
      }
      case 'spitter': {
        body('#a4d94e');
        c.fillStyle = '#6f9c2f';
        for (let i = 0; i < 4; i++) {
          c.beginPath();
          c.arc(Math.cos(i * 1.7 + e.seed) * e.r * 0.5, Math.sin(i * 1.7 + e.seed) * e.r * 0.5 - e.r * 0.15, e.r * 0.16, 0, Math.PI * 2);
          c.fill();
        }
        eyes(e.r * 0.3, -e.r * 0.2, '#fff');
        const open = e.ai.state === 1 ? 0.5 : 0.15;
        c.fillStyle = '#3d5c14';
        c.beginPath(); c.arc(0, e.r * 0.35, e.r * open, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'goatkin': {
        body('#c9803f');
        horns('#e8e0cc');
        eyes(e.r * 0.3, -e.r * 0.15, '#ffe14d');
        if (e.ai.state === 1) {
          c.strokeStyle = '#e6404f';
          c.lineWidth = 2;
          c.beginPath(); c.arc(0, 0, e.r + 5 + Math.sin(t * 30) * 2, 0, Math.PI * 2); c.stroke();
        }
        break;
      }
      case 'archer': {
        body('#d8cfae');
        c.fillStyle = '#120a1c';
        c.beginPath();
        c.arc(-e.r * 0.28, -e.r * 0.12, e.r * 0.18, 0, Math.PI * 2);
        c.arc(e.r * 0.28, -e.r * 0.12, e.r * 0.18, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#8a6a3d';
        c.lineWidth = 2.6;
        c.beginPath(); c.arc(e.r * 0.9, 0, e.r * 0.8, -1.1, 1.1); c.stroke();
        break;
      }
      case 'wraith': {
        c.globalAlpha = e.ai.state === 1 ? 0.55 : 0.85;
        body('#9fd8e8');
        c.fillStyle = '#120a1c';
        c.beginPath();
        c.ellipse(-e.r * 0.3, -e.r * 0.1, e.r * 0.16, e.r * 0.26, 0, 0, Math.PI * 2);
        c.ellipse(e.r * 0.3, -e.r * 0.1, e.r * 0.16, e.r * 0.26, 0, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        for (let i = 0; i < 4; i++) {
          const bx = -e.r * 0.7 + i * e.r * 0.47;
          c.moveTo(bx, e.r * 0.6);
          c.quadraticCurveTo(bx + e.r * 0.2, e.r * (1.1 + Math.sin(t * 8 + i) * 0.15), bx + e.r * 0.45, e.r * 0.6);
        }
        c.fillStyle = '#9fd8e8';
        c.fill();
        c.globalAlpha = 1;
        break;
      }
      case 'brute': {
        body('#d95f4d');
        horns('#8c3a2e');
        eyes(e.r * 0.32, -e.r * 0.2, '#ffd23d', e.r * 0.13);
        c.fillStyle = '#8c3a2e';
        c.beginPath();
        c.arc(-e.r * 0.95, e.r * 0.25, e.r * 0.32, 0, Math.PI * 2);
        c.arc(e.r * 0.95, e.r * 0.25, e.r * 0.32, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#120a1c'; c.lineWidth = 2.4; c.stroke();
        if (e.ai.state === 1) {
          c.globalAlpha = 0.4 + Math.sin(t * 20) * 0.2;
          c.strokeStyle = '#e6404f';
          c.beginPath(); c.arc(0, 0, e.r + 8, 0, Math.PI * 2); c.stroke();
          c.globalAlpha = 1;
        }
        break;
      }
      case 'shieldkin': {
        body('#8fa3b8');
        eyes(e.r * 0.28, -e.r * 0.15, '#ffd23d');
        c.save();
        c.rotate(e.ai.ang);
        c.fillStyle = '#5c6b7d';
        c.strokeStyle = '#120a1c';
        c.lineWidth = 2.4;
        c.beginPath();
        c.roundRect(e.r * 0.7, -e.r * 0.75, e.r * 0.4, e.r * 1.5, 4);
        c.fill(); c.stroke();
        c.fillStyle = '#3d4a59';
        c.beginPath(); c.arc(e.r * 0.9, 0, e.r * 0.18, 0, Math.PI * 2); c.fill();
        c.restore();
        break;
      }
      case 'hexer': {
        c.fillStyle = '#5c3d8f';
        c.strokeStyle = '#120a1c';
        c.lineWidth = 2.4;
        c.beginPath();
        c.moveTo(0, -e.r * 1.25);
        c.quadraticCurveTo(e.r * 1.05, -e.r * 0.3, e.r * 0.8, e.r * 0.85);
        c.lineTo(-e.r * 0.8, e.r * 0.85);
        c.quadraticCurveTo(-e.r * 1.05, -e.r * 0.3, 0, -e.r * 1.25);
        c.fill(); c.stroke();
        c.fillStyle = '#c07bff';
        c.beginPath();
        c.arc(-e.r * 0.25, -e.r * 0.25, e.r * 0.13, 0, Math.PI * 2);
        c.arc(e.r * 0.25, -e.r * 0.25, e.r * 0.13, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#8a6a3d';
        c.lineWidth = 3;
        c.beginPath(); c.moveTo(e.r * 0.9, e.r * 0.7); c.lineTo(e.r * 1.05, -e.r * 0.9); c.stroke();
        c.fillStyle = `rgba(192,123,255,${0.6 + Math.sin(t * 6) * 0.4})`;
        c.beginPath(); c.arc(e.r * 1.05, -e.r * 1.05, e.r * 0.22, 0, Math.PI * 2); c.fill();
        break;
      }
      case 'ghoul': {
        body('#c9a86b');
        c.fillStyle = '#120a1c';
        c.beginPath();
        c.arc(-e.r * 0.3, -e.r * 0.2, e.r * 0.17, 0, Math.PI * 2);
        c.arc(e.r * 0.3, -e.r * 0.2, e.r * 0.17, 0, Math.PI * 2);
        c.fill();
        c.strokeStyle = '#120a1c'; c.lineWidth = 2;
        c.beginPath();
        c.moveTo(-e.r * 0.3, e.r * 0.25);
        c.lineTo(-e.r * 0.15, e.r * 0.4);
        c.lineTo(0, e.r * 0.25);
        c.lineTo(e.r * 0.15, e.r * 0.4);
        c.lineTo(e.r * 0.3, e.r * 0.25);
        c.stroke();
        if (e.ai.state === 1) {
          c.strokeStyle = '#c9a86b';
          c.lineWidth = 3;
          c.beginPath(); c.arc(0, 0, e.r + 6, 0, Math.PI * 2); c.stroke();
        }
        break;
      }
      case 'goblin': {
        body('#ffd23d', 0.9);
        c.fillStyle = '#3daa56';
        c.beginPath(); c.arc(0, -e.r * 0.2, e.r * 0.62, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#120a1c'; c.lineWidth = 2; c.stroke();
        eyes(e.r * 0.25, -e.r * 0.25, '#fff', e.r * 0.17);
        c.fillStyle = '#8a5a2b';
        c.beginPath(); c.arc(-e.r * 0.7, -e.r * 0.1, e.r * 0.4, 0, Math.PI * 2); c.fill(); c.stroke();
        break;
      }
      case 'butcher': {
        body('#e05a6a');
        horns('#8c2f3d');
        eyes(e.r * 0.3, -e.r * 0.15, '#ffd23d', e.r * 0.13);
        c.strokeStyle = '#8c2f3d'; c.lineWidth = 3;
        c.beginPath(); c.arc(0, e.r * 0.25, e.r * 0.4, 0.2, Math.PI - 0.2); c.stroke();
        c.fillStyle = '#c9d4e4';
        c.beginPath();
        c.roundRect(e.r * 0.8, -e.r * 0.3, e.r * 0.6, e.r * 0.16, 3);
        c.fill();
        c.strokeStyle = '#120a1c'; c.lineWidth = 2; c.stroke();
        break;
      }
      case 'andariel': {
        body('#8fd94e');
        c.strokeStyle = '#4d7d24';
        c.lineWidth = 3.4;
        for (let i = 0; i < 7; i++) {
          const a = -Math.PI / 2 + (i - 3) * 0.32;
          c.beginPath();
          c.moveTo(Math.cos(a) * e.r * 0.8, Math.sin(a) * e.r * 0.8);
          c.lineTo(Math.cos(a) * e.r * 1.5, Math.sin(a) * e.r * 1.5);
          c.stroke();
        }
        eyes(e.r * 0.28, -e.r * 0.15, '#e8ffb0', e.r * 0.12);
        break;
      }
      case 'baal': {
        body('#7fd4e8');
        horns('#e8f6ff');
        eyes(e.r * 0.3, -e.r * 0.15, '#0f4c5c', e.r * 0.13);
        c.globalAlpha = 0.4;
        c.strokeStyle = '#e8f6ff';
        c.lineWidth = 2.5;
        c.beginPath(); c.arc(0, 0, e.r + 8 + Math.sin(t * 3) * 3, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        break;
      }
      case 'terrorlord': {
        body('#c04de0');
        c.fillStyle = '#7d1fa0';
        c.strokeStyle = '#120a1c';
        c.lineWidth = 2.4;
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI / 2 + (i - 2) * 0.5;
          c.beginPath();
          c.moveTo(Math.cos(a - 0.16) * e.r * 0.9, Math.sin(a - 0.16) * e.r * 0.9);
          c.lineTo(Math.cos(a) * e.r * 1.45, Math.sin(a) * e.r * 1.45);
          c.lineTo(Math.cos(a + 0.16) * e.r * 0.9, Math.sin(a + 0.16) * e.r * 0.9);
          c.closePath();
          c.fill(); c.stroke();
        }
        c.fillStyle = '#ff3d3d';
        c.beginPath();
        c.ellipse(-e.r * 0.3, -e.r * 0.15, e.r * 0.16, e.r * 0.1, -0.3, 0, Math.PI * 2);
        c.ellipse(e.r * 0.3, -e.r * 0.15, e.r * 0.16, e.r * 0.1, 0.3, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 0.5 + Math.sin(t * 4) * 0.2;
        c.strokeStyle = '#ff3d3d';
        c.lineWidth = 3;
        c.beginPath(); c.arc(0, 0, e.r + 10, 0, Math.PI * 2); c.stroke();
        c.globalAlpha = 1;
        break;
      }
    }

    /* hit flash */
    if (e.flash > 0) {
      c.globalAlpha = e.flash * 0.75;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(0, 0, e.r, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }
    c.restore();

    /* elite/boss hp bar */
    if ((e.elite || e.bossIdx >= 0) && e.hp < e.maxHp && e.bossIdx < 0) {
      const w = e.r * 2;
      c.fillStyle = '#120a1c';
      c.fillRect(x - w / 2, y - e.r - 12, w, 5);
      c.fillStyle = '#e6404f';
      c.fillRect(x - w / 2 + 1, y - e.r - 11, (w - 2) * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
  }
}

/* deferred micro-tasks tied to engine lifetime */
function setTimeout2(engine: GloomfallEngine, ms: number, fn: () => void) {
  const t0 = performance.now();
  const tick = () => {
    if (performance.now() - t0 >= ms) fn();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  void engine;
}

declare module './engine' {
  interface Enemy { facingDir?: number }
}
