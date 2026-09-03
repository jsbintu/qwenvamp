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
import {
  Animator, SPR_R, drawFx, fxFrame, getFogs, getProp, getSheet, getTileCanvas, propAt,
  TILE, tileVariant,
} from './sprites';

/* ------------------------------ internal types ----------------------------- */

interface WeaponSlot {
  id: WeaponId;
  lvl: number;
  cd: number;
  fused?: { def: FusionDef; partner: CompId };
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
  spikeT: number; hurtT: number; seed: number;
  dead: boolean; gone: boolean; dying: number;
  anim: Animator; face: number;
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
  size: number; color: string;
  kind: 'dot' | 'spark' | 'ring' | 'shard' | 'smoke' | 'sprite';
  spr?: string; rot?: number; vr?: number;
}

interface Floater { x: number; y: number; t: number; txt: string; color: string; size: number; }
interface Decal { x: number; y: number; r: number; a: number; color: string; spr?: number; }
interface Pickup { x: number; y: number; kind: 'xp' | 'gold' | 'heal' | 'chest'; v: number; t: number; }
interface Spike { x: number; y: number; t: number; dur: number; dmg: number; slot: number; }
interface Orbital { ang: number; r: number; dmg: number; kind: 'blade' | 'scythe'; slot: number; }

interface Hazard {
  kind: 'pool' | 'beam' | 'warnc' | 'burst' | 'pillar';
  x: number; y: number; x2: number; y2: number; r: number; ang: number;
  t: number; dur: number; dmg: number; color: string; slow: boolean; owner: 'e' | 'p'; slot: number;
}

interface Corpse { x: number; y: number; big: boolean; t: number; dur: number; }
interface HammerQ { x: number; y: number; t: number; slot: number; }

export interface Callbacks {
  onSnapshot: (s: Snapshot) => void;
  onEnd: (s: EndStats) => void;
  onLevelUp: (c: Choice[]) => void;
  onChest: (r: ChestReward[]) => void;
  onEvolve: (name: string, desc: string, flagship: boolean) => void;
  onBanner: (t: string, sub?: string) => void;
  onError?: (msg: string) => void;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (ax: number, ay: number, bx: number, by: number) => {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
};
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/* ================================= ENGINE ================================= */

export class GloomfallEngine {
  private canvas: HTMLCanvasElement;
  private c: CanvasRenderingContext2D;
  private cb: Callbacks;
  private raf = 0;
  private last = 0;
  private paused = false;
  private uiLock = false;
  private over = false;
  private victory = false;

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
  private spinSlot = 0;
  private phoenixUsed = false;
  private pAtk = 0;
  private panim: Animator;
  private muted = false;

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
  private corpses: Corpse[] = [];
  private hammerQ: HammerQ[] = [];
  private pSlowT = 0;
  private blessedT = 0;
  private baseArmor = 0;

  /* timers */
  private spawnT = 0.5;
  private orbTickT = 0;
  private wardT = 0; private warT = 0;
  private emberCd = 0; private magnetT = 0; private magnetPull = 0;
  private judgmentT = 0; private tempestT = 0; private meteorT = 0;
  private eruptionT = 0; private trailT = 0;
  private bossSpawned = new Set<number>();

  constructor(canvas: HTMLCanvasElement, cb: Callbacks, classId: ClassId) {
    this.canvas = canvas;
    this.cb = cb;
    this.classId = classId;
    this.c = canvas.getContext('2d')!;
    this.panim = new Animator(`player-${classId}`);
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

  private destroyed = false;

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.kd);
    window.removeEventListener('keyup', this.ku);
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (!p) this.last = performance.now();
  }
  setMutedState(m: boolean) {
    this.muted = m;
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
    if (this.classId === 'paladin') {
      this.baseArmor = 2;
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
    s.xpMul = this.classId === 'necromancer' ? 1.1 : 1; s.armor = this.baseArmor; s.crit = 0.05;
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
      const wd = WEAPONS[id];
      if (wd.classOnly && wd.classOnly !== this.classId) continue;
      const slot = this.weapons.find((w) => w.id === id);
      if (slot) {
        if (slot.lvl < MAX_RANK) pool.push({ kind: 'weapon', id, level: slot.lvl + 1, isNew: false, rankText: WEAPONS[id].ranks[slot.lvl].text });
      } else if (this.weapons.length < MAX_WEAPONS) {
        pool.push({ kind: 'weapon', id, level: 1, isNew: true, rankText: WEAPONS[id].ranks[0].text });
      }
    }
    for (const id of PASSIVE_IDS) {
      const pd = PASSIVES[id];
      if (pd.classOnly && pd.classOnly !== this.classId) continue;
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
    this.spawnSprite('exp-holy', this.px, this.py, 180, 0.6, 0, 0);
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
      spikeT: 0, hurtT: 0, seed: Math.random() * 100,
      dead: false, gone: false, dying: -1,
      anim: new Animator(`en-${def.skin}`), face: 1,
    };
    this.enemies.push(e);
    if (def.boss) {
      const bd = def as BossDef;
      this.cb.onBanner(`${bd.name.toUpperCase()}`, bd.title);
      sfx.boss();
      this.shake = 16;
      this.ring(ex, ey, bd.color, 200);
      this.burst(ex, ey, 24, bd.color, 'spark');
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

  private deriveAnim(e: Enemy) {
    const a = e.anim;
    if (['attack', 'cast', 'charge', 'hurt', 'die'].includes(a.clipName) && !a.done) return;
    let want = 'walk';
    if (e.bossIdx >= 0) {
      if (e.atk) {
        want = ['charge', 'dash'].includes(e.atk.type) ? 'attack' : 'cast';
      }
    } else {
      switch (e.skin) {
        case 'spitter':
        case 'hexer':
        case 'archer':
          want = e.ai.state === 1 ? 'cast' : 'walk';
          break;
        case 'goatkin':
          want = e.ai.state === 1 ? 'charge' : e.ai.state === 2 ? 'attack' : 'walk';
          break;
        case 'brute':
          want = e.ai.state === 1 ? 'attack' : 'walk';
          break;
        case 'wraith':
          want = e.ai.state === 1 ? 'attack' : 'walk';
          break;
        case 'knight':
          want = e.ai.state === 1 ? 'attack' : e.ai.state === 2 ? 'charge' : 'walk';
          break;
        case 'cinder':
          want = e.ai.state === 1 ? 'attack' : 'walk';
          break;
        case 'worm':
          want = e.ai.state === 2 ? 'attack' : 'walk';
          break;
        case 'caller':
          want = e.ai.t > 2.7 ? 'cast' : 'walk';
          break;
        default:
          want = 'walk';
      }
    }
    if (want !== a.clipName) a.play(want);
  }

  private updateEnemies(dt: number) {
    const px = this.px, py = this.py;
    for (const e of this.enemies) {
      if (e.dead) {
        e.dying += dt;
        e.anim.update(dt);
        if (e.dying > (e.bossIdx >= 0 ? 1.15 : 0.62)) e.gone = true;
        continue;
      }
      e.flash = Math.max(0, e.flash - dt * 5);
      e.spikeT = Math.max(0, e.spikeT - dt);
      e.hurtT = Math.max(0, e.hurtT - dt);
      e.slow = Math.max(0, e.slow - dt);
      e.anim.update(dt);
      e.face = px < e.x ? -1 : 1;
      const slowF = e.slow > 0 && !this.st.flags.has('noslow') ? 0.55 : 1;

      if (e.bossIdx >= 0) { this.updateBoss(e, dt, slowF); this.deriveAnim(e); continue; }

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
            if (ai.t <= 0) { ai.state = 2; ai.t = 0.65; }
          } else if (ai.state === 2) {
            e.x += Math.cos(ai.ang) * spd * 3.1 * dt;
            e.y += Math.sin(ai.ang) * spd * 3.1 * dt;
            if (Math.random() < dt * 20) this.puff(e.x, e.y, '#8a7355');
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
              this.spawnSprite('exp-fire', ai.ax, ai.ay, 150, 0.45, 0, 0);
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
        case 'cinder': {
          /* kamikaze: rush, blink-fuse, detonate */
          if (ai.state === 0) {
            const rush = d < 170 ? 1.65 : 1;
            e.x += nx * spd * rush * dt; e.y += ny * spd * rush * dt;
            if (d < 78) { ai.state = 1; ai.t = 0.85; sfx.telegraph(); }
          } else {
            ai.t -= dt;
            if (Math.random() < dt * 24) this.puff(e.x + rand(-8, 8), e.y + rand(-8, 8), '#ff8a3d');
            if (ai.t <= 0) {
              e.dead = true; e.gone = true;
              this.spawnSprite('exp-fire', e.x, e.y, 210, 0.5, 0, 0);
              this.ring(e.x, e.y, '#ff6b3d', 105);
              this.shakeAt(6);
              sfx.explode();
              if (dist2(e.x, e.y, px, py) < 105 * 105) this.hurtPlayer(e.dmg * 1.5);
            }
          }
          break;
        }
        case 'caller': {
          /* keeps its distance and raises the dead */
          if (d < 260) { e.x -= nx * spd * dt; e.y -= ny * spd * dt; }
          else if (d > 360) { e.x += nx * spd * 0.6 * dt; e.y += ny * spd * 0.6 * dt; }
          ai.t -= dt;
          if (ai.t <= 0) {
            ai.t = 3.2;
            for (let k = 0; k < 2; k++) {
              const risen = ENEMIES[0];
              this.spawnEnemy(risen, e.x + rand(-40, 40), e.y + rand(-40, 40));
            }
            this.burst(e.x, e.y, 10, '#9be85e', 'smoke');
            this.ring(e.x, e.y, '#9be85e', 50);
            sfx.zap();
          }
          break;
        }
        case 'worm': {
          /* burrow → telegraph → burst → vulnerable */
          if (ai.state === 0) {
            ai.t -= dt;
            if (ai.t <= 0) {
              ai.t = 1.4;
              const na = rand(0, Math.PI * 2);
              const nd = rand(90, 210);
              e.x = px + Math.cos(na) * nd;
              e.y = py + Math.sin(na) * nd;
              ai.state = 1; ai.t = 0.75;
              sfx.telegraph();
            }
          } else if (ai.state === 1) {
            ai.t -= dt;
            if (ai.t <= 0) {
              ai.state = 2; ai.t = 0.3;
              this.ring(e.x, e.y, '#b08968', 95);
              this.spawnSprite('exp-poison', e.x, e.y, 150, 0.4, 0, 0);
              this.burst(e.x, e.y, 14, '#8a7355', 'shard');
              this.shakeAt(6);
              sfx.explode();
              if (dist2(e.x, e.y, px, py) < 95 * 95) this.hurtPlayer(e.dmg);
              for (const o of this.enemies) {
                if (o !== e && !o.dead && dist2(o.x, o.y, e.x, e.y) < 90 * 90) {
                  const dd = Math.hypot(o.x - e.x, o.y - e.y) || 1;
                  o.x += ((o.x - e.x) / dd) * 40; o.y += ((o.y - e.y) / dd) * 40;
                }
              }
            }
          } else if (ai.state === 2) {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 3; ai.t = 2.4; }
          } else {
            e.x += nx * 60 * dt; e.y += ny * 60 * dt;
            ai.t -= dt;
            if (Math.random() < dt * 6) this.puff(e.x, e.y, '#8a7355');
            if (ai.t <= 0) { ai.state = 0; ai.t = rand(0.6, 1.4); this.burst(e.x, e.y, 6, '#8a7355', 'smoke'); }
          }
          break;
        }
        case 'knight': {
          /* armored duelist: advance, telegraph, dash, recover */
          if (ai.state === 0) {
            e.x += nx * spd * dt; e.y += ny * spd * dt;
            ai.t -= dt;
            if (ai.t <= 0 && d < 330) { ai.state = 1; ai.t = 0.5; ai.ang = Math.atan2(dy, dx); sfx.telegraph(); }
          } else if (ai.state === 1) {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 2; ai.t = 0.45; }
          } else if (ai.state === 2) {
            e.x += Math.cos(ai.ang) * spd * 4.6 * dt;
            e.y += Math.sin(ai.ang) * spd * 4.6 * dt;
            this.puff(e.x, e.y, 'rgba(184,67,79,0.6)');
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 3; ai.t = 0.9; }
          } else {
            ai.t -= dt;
            if (ai.t <= 0) { ai.state = 0; ai.t = rand(1.8, 2.8); }
          }
          break;
        }
        case 'shade': {
          /* drifts close and chills you to the bone */
          e.x += nx * spd * dt; e.y += ny * spd * dt;
          if (dist2(e.x, e.y, px, py) < 135 * 135) {
            if (!this.st.flags.has('noslow')) this.pSlowT = 0.35;
            if (Math.random() < dt * 16) this.puff(px + rand(-30, 30), py + rand(-30, 30), '#a8d8e8');
          }
          break;
        }
        case 'carrier': {
          /* bloated, slow, brimming with plague */
          e.x += nx * spd * dt; e.y += ny * spd * dt;
          if (Math.random() < dt * 3) this.puff(e.x + rand(-10, 10), e.y + rand(-10, 10), '#a4d94e');
          break;
        }
        default: {
          e.x += nx * spd * dt; e.y += ny * spd * dt;
        }
      }
      if (e.dmg > 0 && dist2(e.x, e.y, px, py) < (e.r + 15) * (e.r + 15)) {
        this.hurtPlayer(e.dmg, e);
      }
      this.deriveAnim(e);
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
          const dd = Math.sqrt(d2);
          const push = ((rr - dd) / dd) * 0.35;
          const ddx = (a.x - b.x) * push, ddy = (a.y - b.y) * push;
          a.x += ddx; a.y += ddy; b.x -= ddx; b.y -= ddy;
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

    if (e.atk) {
      const a = e.atk;
      a.t += dt;
      this.runBossAttack(e, a, dt);
      if (a.t >= a.dur) e.atk = null;
    } else {
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
      case 'feathers': return 1.0;
      case 'bonering': return 0.9;
      case 'graveyard': return 0.8;
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
            r: 70, ang: 0, t: 0, dur: 0.75, dmg: e.dmg * 0.8, color: def.color, slow: false, owner: 'e', slot: -1,
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
      case 'feathers': {
        /* three staggered aimed fans of blood-feathers */
        const n = Math.floor(a.t / 0.28);
        const fired = Math.floor((a.t - dt) / 0.28);
        if (n > fired && n <= 3) {
          for (let k = -2; k <= 2; k++) this.ebullet(e.x, e.y, angP + k * 0.16, 300, e.dmg * 0.45, '#e04d5c', false);
          sfx.shoot();
        }
        break;
      }
      case 'bonering': {
        /* rotating double ring of bone shards */
        const n = Math.floor(a.t / 0.3);
        const fired = Math.floor((a.t - dt) / 0.3);
        if (n > fired && n <= 3) {
          const off = n * 0.26;
          for (let i = 0; i < 14; i++) this.ebullet(e.x, e.y, (i / 14) * Math.PI * 2 + off, 200, e.dmg * 0.4, '#e8e0cc', false);
          this.ring(e.x, e.y, '#e8e0cc', 60 + n * 30);
          sfx.bones();
        }
        break;
      }
      case 'graveyard': {
        /* the dead rise in a circle around you */
        if (!a.done) {
          a.done = true;
          const risen = ENEMIES[0];
          for (let i = 0; i < 7; i++) {
            const ga = (i / 7) * Math.PI * 2;
            const gx = this.px + Math.cos(ga) * 175;
            const gy = this.py + Math.sin(ga) * 175;
            this.spawnEnemy(risen, gx, gy);
            this.burst(gx, gy, 6, '#9be85e', 'smoke');
          }
          this.ring(this.px, this.py, '#9be85e', 180);
          sfx.zap();
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
          if (s.mods.has('barrage')) {
            const slot = this.weapons[i];
            deferred.push({ at: this.time + 0.18, fn: () => { if (this.weapons.includes(slot)) this.fireSpears(i, base + 0.15, slot); } });
          }
          s.cd = s.rcd;
          break;
        }
        case 'aura': {
          let hitAny = false;
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (dist2(e.x, e.y, this.px, this.py) < (R + e.r) * (R + e.r)) {
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
          this.pAtk = Math.max(this.pAtk, 0.3);
          break;
        }
        case 'blades': {
          s.cd = s.rcd;
          break;
        }
        case 'caltrops': {
          const back = this.facing < 0 ? 0 : Math.PI;
          for (let k = 0; k < s.proj; k++) {
            const a = back + rand(-1.1, 1.1);
            const dd = rand(40, 120) * s.area;
            this.spikes.push({
              x: this.px + Math.cos(a) * dd, y: this.py + Math.sin(a) * dd,
              t: 0, dur: 2.6 * (1 + (s.area - 1) * 0.5), dmg: s.dmg, slot: i,
            });
          }
          this.burst(this.px - this.facing * 40, this.py + 10, 6, '#b06cff', 'smoke');
          s.cd = s.rcd;
          sfx.bones();
          this.pAtk = Math.max(this.pAtk, 0.3);
          break;
        }
        case 'whirlwind': {
          const t = this.nearest(R * 1.6);
          if (!t) { s.cd = 0.2; break; }
          this.spinT = 1.15 * (1 + (s.area - 1) * 0.4);
          this.spinSlot = i;
          s.cd = s.rcd;
          sfx.explode();
          this.pAtk = Math.max(this.pAtk, 0.5);
          break;
        }
        case 'scythe': {
          const t = this.nearest(R * 2.2);
          if (!t) { s.cd = 0.2; break; }
          const dir = Math.atan2(t.y - this.py, t.x - this.px);
          this.sweep(dir, s, i);
          if (s.proj >= 2) {
            const slot = this.weapons[i];
            deferred.push({ at: this.time + 0.12, fn: () => { if (this.weapons.includes(slot)) this.sweep(dir + Math.PI, slot, i); } });
          }
          s.cd = s.rcd;
          break;
        }
        case 'throwaxe': {
          const t = this.nearest(620);
          if (!t) { s.cd = 0.15; break; }
          const base = Math.atan2(t.y - this.py, t.x - this.px);
          for (let k = 0; k < s.proj; k++) {
            const a = base + (k - (s.proj - 1) / 2) * 0.4;
            this.spawnProj(i, a, 390 * s.pspd, s, 'axe', 11, false);
          }
          sfx.bones();
          this.pAtk = Math.max(this.pAtk, 0.35);
          s.cd = s.rcd;
          break;
        }
        case 'corpses': {
          /* no ammo of the dead? desecrate fresh ground */
          if (this.bestCorpse() < 0) {
            const alive = this.enemies.filter((e) => !e.dead && e.bossIdx < 0 && dist2(e.x, e.y, this.px, this.py) < 460 * 460);
            const t = alive[Math.floor(Math.random() * alive.length)];
            if (t && this.corpses.length < 44) {
              this.corpses.push({ x: t.x + rand(-20, 20), y: t.y + rand(-20, 20), big: false, t: 0, dur: 6 });
              this.burst(t.x, t.y, 5, '#9be85e', 'smoke');
            }
            s.cd = 0.55;
            break;
          }
          const detonations = Math.max(1, s.proj);
          let done = 0;
          for (let dts = 0; dts < detonations; dts++) {
            const ci = this.bestCorpse();
            if (ci < 0) break;
            const cp = this.corpses[ci];
            this.corpses.splice(ci, 1);
            const rad = (95 + (cp.big ? 45 : 0)) * s.area * this.st.areaMul;
            this.explodeAt(cp.x, cp.y, rad, s.dmg * (cp.big ? 1.8 : 1), i, s);
            if (s.mods.has('bonenova')) {
              for (let k = 0; k < 8; k++) {
                this.spawnProjAt(cp.x, cp.y, i, (k / 8) * Math.PI * 2, 330, s, 'bone', 8, false);
              }
            }
            this.spawnSprite('soul-green', cp.x, cp.y - 10, 26, 0.5, 0, -60);
            done++;
          }
          s.cd = done > 0 ? s.rcd : 0.2;
          break;
        }
        case 'frostnova': {
          const Rf = 120 * s.area;
          const t = this.nearest(Rf * 1.3);
          if (!t) { s.cd = 0.2; break; }
          for (const e of this.enemies) {
            if (e.dead) continue;
            if (dist2(e.x, e.y, this.px, this.py) < (Rf + e.r) * (Rf + e.r)) {
              this.damageEnemy(e, s.dmg, i, 60);
              e.slow = Math.max(e.slow, 2.2 + (s.area - 1));
            }
          }
          this.ring(this.px, this.py, '#7fd4e8', Rf);
          this.spawnSprite('exp-frost', this.px, this.py, Rf * 1.9, 0.4, 0, 0);
          this.burst(this.px, this.py, 10, '#c0ecff', 'spark');
          sfx.freeze();
          this.pAtk = Math.max(this.pAtk, 0.4);
          s.cd = s.rcd;
          break;
        }
        case 'hammer': {
          const t = this.densestEnemy();
          if (!t || dist2(t.x, t.y, this.px, this.py) > 520 * 520) { s.cd = 0.2; break; }
          this.hammerQ.push({ x: t.x, y: t.y, t: 0.42, slot: i });
          sfx.telegraph();
          s.cd = s.rcd;
          break;
        }
      }
    }
    /* hammer slam queue */
    for (let hi = this.hammerQ.length - 1; hi >= 0; hi--) {
      const hq = this.hammerQ[hi];
      hq.t -= dt;
      if (hq.t > 0) continue;
      this.hammerQ.splice(hi, 1);
      const s = this.weapons[hq.slot];
      if (!s) continue;
      const R = 135 * s.area;
      for (const e of this.enemies) {
        if (e.dead) continue;
        const rr = R + e.r;
        if (dist2(e.x, e.y, hq.x, hq.y) < rr * rr) this.damageEnemy(e, s.dmg, hq.slot, 330);
      }
      this.spawnSprite('exp-holy', hq.x, hq.y, R * 2.1, 0.5, 0, 0);
      this.ring(hq.x, hq.y, '#ffc258', R);
      if (this.decals.length < 130) this.decals.push({ x: hq.x, y: hq.y, r: R * 0.55, a: 0.5, color: '#241a10', spr: Math.floor(rand(0, 3)) });
      this.shakeAt(9);
      sfx.slam();
      if (s.mods.has('shockwave')) {
        this.hammerQ.push({ x: hq.x, y: hq.y, t: 0.14, slot: hq.slot });
        this.ring(hq.x, hq.y, '#fff6dd', R * 1.5);
      }
      if (s.mods.has('seism')) {
        for (let k = 0; k < 4; k++) {
          const a = rand(0, Math.PI * 2);
          const dd = rand(90, 170);
          this.explodeAt(hq.x + Math.cos(a) * dd, hq.y + Math.sin(a) * dd, 60 * s.area, s.dmg * 0.5, hq.slot, s);
        }
      }
    }
    /* deferred micro-tasks */
    for (let i = deferred.length - 1; i >= 0; i--) {
      if (deferred[i].at <= this.time) {
        const d = deferred.splice(i, 1)[0];
        d.fn();
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
                const dd = Math.sqrt(d2) || 1;
                e.x -= ((e.x - this.px) / dd) * 480 * dt;
                e.y -= ((e.y - this.py) / dd) * 480 * dt;
              }
              if (s.mods.has('bloodthirst')) this.hp = clamp(this.hp + s.dmg * 0.05, 1, this.maxHp);
            }
          }
        }
        if (Math.random() < dt * 26) {
          const a = rand(0, Math.PI * 2);
          this.particles.push({ x: this.px + Math.cos(a) * R, y: this.py + Math.sin(a) * R, vx: -Math.sin(a) * 120, vy: Math.cos(a) * 120, life: 0.4, maxLife: 0.4, size: 4, color: '#e6404f', kind: 'spark' });
        }
      }
    }
  }

  private expElem(slot: number): string {
    const s = this.weapons[slot];
    if (!s) return 'fire';
    switch (s.id) {
      case 'hellfire':
      case 'whirlwind': return 'fire';
      case 'lightning':
      case 'blades':
      case 'frostnova': return 'frost';
      case 'caltrops': return 'arcane';
      case 'aura':
      case 'hammer': return 'holy';
      case 'bonespear':
      case 'scythe':
      case 'corpses': return 'poison';
      case 'throwaxe': return 'frost';
      default: return 'fire';
    }
  }

  private fireHellfire(i: number, base: number, s: WeaponSlot) {
    for (let k = 0; k < s.proj; k++) {
      const a = base + (k - (s.proj - 1) / 2) * 0.3;
      this.spawnProj(i, a, 300 * s.pspd, s, 'fire', 13, true);
    }
    this.spawnSprite('spark', this.px + Math.cos(base) * 26, this.py + Math.sin(base) * 26, 26, 0.18, 0, 0);
    sfx.shoot();
    this.pAtk = Math.max(this.pAtk, 0.35);
  }

  private fireSpears(i: number, base: number, s: WeaponSlot) {
    for (let k = 0; k < s.proj; k++) {
      const a = base + (k - (s.proj - 1) / 2) * 0.16;
      this.spawnProj(i, a, 430 * s.pspd, s, 'bone', 9, false);
    }
    this.burst(this.px, this.py, 3, '#d8cfae', 'smoke');
    sfx.bones();
    this.pAtk = Math.max(this.pAtk, 0.35);
  }

  private bestCorpse(): number {
    let best = -1;
    let bestScore = 0;
    for (let i = 0; i < this.corpses.length; i++) {
      const cp = this.corpses[i];
      let cnt = cp.big ? 3 : 0;
      for (const e of this.enemies) {
        if (e.dead) continue;
        if (dist2(e.x, e.y, cp.x, cp.y) < 150 * 150) cnt++;
      }
      if (cnt > bestScore) { bestScore = cnt; best = i; }
    }
    return bestScore >= 2 ? best : -1;
  }

  private spawnProjAt(x: number, y: number, i: number, ang: number, spd: number, s: WeaponSlot, kind: string, r: number, trail: boolean) {
    const p: Proj = {
      x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      r, dmg: s.dmg, pierce: s.pierce, hit: new Set(), life: 1.6, kind,
      color: WEAPONS[s.id].color, slot: i, knock: 90, trail,
    };
    this.projs.push(p);
  }

  private spawnProj(i: number, ang: number, spd: number, s: WeaponSlot, kind: string, r: number, trail: boolean) {
    const p: Proj = {
      x: this.px, y: this.py, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
      r, dmg: s.dmg, pierce: s.pierce, hit: new Set(), life: 2.2, kind,
      color: WEAPONS[s.id].color, slot: i, knock: s.mods.has('crush') ? 320 : 130, trail,
    };
    this.projs.push(p);
    if (s.mods.has('split') && Math.random() < 0.28) {
      const q = { ...p, hit: new Set<Enemy>() };
      const a2 = ang + (Math.random() < 0.5 ? 0.5 : -0.5);
      q.vx = Math.cos(a2) * spd; q.vy = Math.sin(a2) * spd;
      this.projs.push(q);
      this.puff(this.px, this.py, '#c07bff');
    }
    if (s.mods.has('echo') && Math.random() < 0.35) {
      const slot = this.weapons[i];
      deferred.push({ at: this.time + 0.2, fn: () => { if (this.weapons[i] === slot) this.spawnProj(i, ang + rand(-0.15, 0.15), spd, slot, kind, r, trail); } });
    }
  }

  private chainFrom(x: number, y: number, first: Enemy, jumps: number, s: WeaponSlot, slot: number) {
    let cx = x, cy = y;
    let cur: Enemy | null = first;
    const hitSet = new Set<Enemy>();
    for (let j = 0; j < jumps && cur; j++) {
      this.arcs.push({ x1: cx, y1: cy, x2: cur.x, y2: cur.y, t: 0.22, color: WEAPONS[s.id].color });
      hitSet.add(cur);
      this.damageEnemy(cur, s.dmg * (j === 0 ? 1 : 0.75), slot, 60);
      this.spawnSprite('spark', cur.x, cur.y, 22, 0.16, 0, 0);
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
    this.spawnSprite('slash-green', this.px + Math.cos(dir) * R * 0.5, this.py + Math.sin(dir) * R * 0.5, R * 1.9, 0.3, dir, 0);
    sfx.shoot();
    this.pAtk = Math.max(this.pAtk, 0.4);
  }

  /* --------------------------- projectile update -------------------------- */

  private updateProjs(dt: number) {
    for (const p of this.projs) {
      /* berserker axe: fly out, then reverse and carve home */
      if (p.kind === 'axe') {
        const age = 2.2 - p.life;
        if (age < 0.34) {
          p.vx *= 1 - 2.6 * dt;
          p.vy *= 1 - 2.6 * dt;
        } else {
          const dx = this.px - p.x, dy = this.py - p.y;
          const d = Math.hypot(dx, dy) || 1;
          p.vx += (dx / d) * 1900 * dt;
          p.vy += (dy / d) * 1900 * dt;
          const sp = Math.hypot(p.vx, p.vy);
          const maxSp = 540;
          if (sp > maxSp) { p.vx = (p.vx / sp) * maxSp; p.vy = (p.vy / sp) * maxSp; }
          if (d < 26) {
            p.life = 0;
            p.hit.clear();
            const s = this.weapons[p.slot];
            if (s && s.mods.has('fangs')) {
              const t = this.nearest(620);
              if (t) {
                const a = Math.atan2(t.y - this.py, t.x - this.px);
                this.spawnProj(p.slot, a, 420, s, 'axe', p.r, false);
              }
            }
            continue;
          }
        }
        if (Math.random() < dt * 30) this.puff(p.x, p.y, '#c9d4e4');
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.trail && Math.random() < dt * 40) {
        this.particles.push({ x: p.x, y: p.y, vx: rand(-15, 15), vy: rand(-30, -5), life: 0.35, maxLife: 0.35, size: p.r * 0.45, color: Math.random() < 0.5 ? '#ffc258' : '#ff8a3d', kind: 'dot' });
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
    if (e.skin === 'shieldkin' || (e.skin === 'knight' && e.ai.state === 0)) {
      const angIn = Math.atan2(p.y - e.y, p.x - e.x);
      let da = angIn - (e.skin === 'knight' ? Math.atan2(this.py - e.y, this.px - e.x) : e.ai.ang);
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      if (Math.abs(da) < 1.2 && p.pierce < 900) {
        this.floater(e.x, e.y - e.r, 'BLOCK', '#8fa3b8', 11);
        sfx.hit();
        p.pierce = Math.min(p.pierce, 0);
        if (p.kind !== 'bone' && p.kind !== 'axe') p.life = 0;
        return;
      }
    }
    this.damageEnemy(e, p.dmg, p.slot, p.knock);
    const m = s.mods;
    if (m.has('explode')) this.explodeAt(e.x, e.y, 75 * s.area, p.dmg * 0.5, p.slot, s);
    if (m.has('chain')) {
      const nt = this.nearestTo(e, 220 * s.area, e);
      if (nt) this.chainFrom(e.x, e.y, nt, 3, s, p.slot);
    }
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
          const dd = Math.sqrt(d2) || 1;
          o.x -= ((o.x - e.x) / dd) * 40;
          o.y -= ((o.y - e.y) / dd) * 40;
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
    const elem = this.expElem(slot);
    this.spawnSprite(`exp-${elem}`, x, y, r * 2.3, 0.5, 0, 0);
    this.ring(x, y, WEAPONS[s.id].color, r);
    this.burst(x, y, 8, WEAPONS[s.id].color, 'spark');
    for (let i = 0; i < 3; i++) this.puff(x + rand(-r, r) * 0.5, y + rand(-r, r) * 0.5, '#5c4460');
    if (this.decals.length < 130) this.decals.push({ x, y, r: r * 0.7, a: 0.4, color: '#120818' });
    if (s.mods.has('inferno')) {
      this.hazards.push({ kind: 'pool', x, y, x2: 0, y2: 0, r: r * 0.8, ang: 0, t: 0, dur: 2.4, dmg: dmg * 0.5, color: '#ff8a3d', slow: false, owner: 'p', slot });
    }
    sfx.explode();
    this.shakeAt(2.5);
  }

  /* ------------------------------ damage ---------------------------------- */

  private damageEnemy(e: Enemy, amount: number, slot: number, knock: number, critBonus = 0) {
    if (e.dead) return;
    /* grave worms are untouchable while burrowed or surfacing */
    if (e.skin === 'worm' && e.ai.state < 2) {
      this.floater(e.x, e.y - e.r, 'BURROWED', '#b08968', 10);
      return;
    }
    const s = this.weapons[slot];
    let critChance = (s ? s.crit : this.st.crit) + critBonus;
    if (this.st.flags.has('rage') && this.hp < this.maxHp * 0.5) critChance += 0.2;
    const crit = Math.random() < critChance;
    let dmg = amount * (crit ? 2 : 1) * rand(0.9, 1.1);
    if (this.st.flags.has('conviction') && dist2(e.x, e.y, this.px, this.py) < 150 * 150) dmg *= 1.2;
    if (e.slow > 0 && this.weapons.some((w) => w.mods.has('shatter'))) dmg *= 1.5;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 1;
    this.dmgDealt += dmg;
    this.floater(e.x + rand(-8, 8), e.y - e.r - 6, `${dmg}`, crit ? '#ffc258' : '#f4e8cf', crit ? 17 : 12);
    if (crit) {
      sfx.crit();
      this.freeze = Math.max(this.freeze, 0.03);
      this.spawnSprite('spark', e.x, e.y - e.r * 0.5, 26, 0.2, 0, 0);
    } else if (Math.random() < 0.2) sfx.hit();
    if (e.bossIdx < 0 && Math.random() < 0.35 && e.anim.clipName !== 'hurt') e.anim.play('hurt');
    if (knock > 0 && e.bossIdx < 0) {
      const dd = Math.hypot(e.x - this.px, e.y - this.py) || 1;
      e.x += ((e.x - this.px) / dd) * knock * 0.12;
      e.y += ((e.y - this.py) / dd) * knock * 0.12;
    }
    this.burst(e.x, e.y, crit ? 6 : 2, '#a01830', 'dot');
    if (this.st.lifeSteal > 0) this.hp = clamp(this.hp + dmg * this.st.lifeSteal, 1, this.maxHp);
    if (e.hp <= 0) this.killEnemy(e, slot);
  }

  private hasCorpses() {
    return this.classId === 'necromancer' || this.weapons.some((w) => w.id === 'corpses');
  }

  private killEnemy(e: Enemy, slot: number) {
    e.dead = true;
    e.dying = 0;
    e.anim.play('die', true);
    this.kills++;
    const s = this.weapons[slot];
    /* necromancy fuel */
    if (this.hasCorpses() && e.bossIdx < 0 && this.corpses.length < 44) {
      this.corpses.push({ x: e.x + rand(-6, 6), y: e.y + rand(-4, 4), big: e.elite, t: 0, dur: e.elite ? 9 : 6 });
    }
    /* cinder fiends detonate even when slain mid-fuse */
    if (e.skin === 'cinder' && e.ai.state === 1) {
      this.spawnSprite('exp-fire', e.x, e.y, 160, 0.4, 0, 0);
      if (dist2(e.x, e.y, this.px, this.py) < 80 * 80) this.hurtPlayer(e.dmg);
    }
    /* plague carriers burst into imps */
    if (e.skin === 'carrier' && e.bossIdx < 0) {
      const imp = ENEMIES.find((d) => d.skin === 'imp') ?? ENEMIES[0];
      for (let k = 0; k < 3; k++) {
        this.spawnEnemy(imp, e.x + rand(-46, 46), e.y + rand(-46, 46));
      }
      this.burst(e.x, e.y, 12, '#d8c04d', 'shard');
      sfx.explode();
    }
    /* grim harvest procs */
    if (this.st.flags.has('soulsiphon')) {
      const nt = this.nearestTo(e, 210, e);
      if (nt) {
        this.damageEnemy(nt, 18 + this.level * 2, slot, 40);
        this.arcs.push({ x1: e.x, y1: e.y, x2: nt.x, y2: nt.y, t: 0.22, color: '#9be85e' });
      }
    }
    if (this.st.flags.has('killheal')) this.hp = clamp(this.hp + 2, 1, this.maxHp);
    if (this.decals.length < 130) {
      this.decals.push({ x: e.x, y: e.y + e.r * 0.4, r: e.r * rand(0.9, 1.4), a: 0.55, color: '#5c1220', spr: Math.floor(rand(0, 3)) });
    }
    this.burst(e.x, e.y, e.elite ? 16 : 7, e.def.color, 'shard');
    this.spawnSprite('soul-green', e.x, e.y - e.r * 0.4, 22, 0.55, 0, -70);
    const xpVal = e.xp * (this.st.flags.has('erudite') && Math.random() < 0.12 ? 2 : 1);
    this.dropXp(e.x, e.y, xpVal);
    const goldChance = 0.28 + this.st.luck * 0.5 + (s && s.mods.has('gilded') ? 0.5 : 0);
    if (Math.random() < goldChance) {
      this.pickups.push({ x: e.x + rand(-10, 10), y: e.y + rand(-10, 10), kind: 'gold', v: Math.round((3 + Math.random() * 6) * this.st.goldMul), t: 0 });
    }
    if (s && s.mods.has('gilded')) this.burst(e.x, e.y, 5, '#ffc258', 'dot');
    if (e.elite) this.pickups.push({ x: e.x, y: e.y, kind: 'chest', v: 0, t: 0 });
    if (e.skin === 'goblin') {
      this.pickups.push({ x: e.x, y: e.y, kind: 'chest', v: 0, t: 0 });
      for (let i = 0; i < 6; i++) this.pickups.push({ x: e.x + rand(-40, 40), y: e.y + rand(-40, 40), kind: 'gold', v: Math.round(8 * this.st.goldMul), t: 0 });
      sfx.goblin();
    }
    if (e.bossIdx >= 0) {
      this.bossKills++;
      this.timeScale = 0.25;
      this.freeze = 0.1;
      this.shakeAt(18);
      this.ring(e.x, e.y, e.def.color, 260);
      this.burst(e.x, e.y, 40, e.def.color, 'shard');
      this.spawnSprite(`exp-${this.expElem(0)}`, e.x, e.y, e.r * 7, 0.9, 0, 0);
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
    let ti = 0;
    while (left > 0 && this.pickups.length < 320) {
      while (ti < tiers.length - 1 && left < tiers[ti]) ti++;
      const take = Math.min(left, tiers[ti]);
      this.pickups.push({ x: x + rand(-16, 16), y: y + rand(-16, 16), kind: 'xp', v: take, t: 0 });
      left -= take;
      if (take < tiers[ti]) ti++;
    }
  }

  private hurtPlayer(amount: number, src?: Enemy) {
    if (this.iframe > 0 || this.over || this.uiLock) return;
    /* paladin ward: one hit blocked every 10s */
    if (this.st.flags.has('blessed') && this.blessedT <= 0) {
      this.blessedT = 10;
      this.iframe = 0.4;
      this.ring(this.px, this.py, '#ffc258', 90);
      this.floater(this.px, this.py - 30, 'BLESSED', '#ffc258', 14);
      sfx.heal();
      return;
    }
    let dmg = Math.max(1, amount - this.st.armor);
    if (this.st.flags.has('warded')) dmg *= 0.92;
    dmg = Math.round(dmg);
    this.hp -= dmg;
    this.iframe = 0.55;
    this.redFlash = 0.5;
    this.shakeAt(7);
    sfx.hurt();
    this.panim.play('hurt');
    this.floater(this.px, this.py - 26, `-${dmg}`, '#e6404f', 14);
    if (this.st.flags.has('thorns') && src && src.bossIdx < 0) {
      src.hp -= 8 + this.level * 2;
      src.flash = 1;
      if (src.hp <= 0) this.killEnemy(src, 0);
    }
    if (this.st.flags.has('emberheart') && this.emberCd <= 0) {
      this.emberCd = 6;
      const fake = { ...this.mkSlot('hellfire'), dmg: 1, area: 1, mods: new Set<string>(['inferno']) } as WeaponSlot;
      this.explodeAt(this.px, this.py, 150, 40 + this.level * 4, 0, fake);
    }
    if (this.hp <= 0) {
      if (this.st.flags.has('phoenix') && !this.phoenixUsed) {
        this.phoenixUsed = true;
        this.hp = this.maxHp * 0.6;
        this.iframe = 2;
        this.flashT = 0.7;
        const fake = { ...this.mkSlot('hellfire'), dmg: 1, area: 1.5, mods: new Set<string>(['inferno']) } as WeaponSlot;
        this.explodeAt(this.px, this.py, 260, 120, 0, fake);
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
        const w0 = this.weapons[0] ?? ({ ...this.mkSlot('aura'), area: 1.2 } as WeaponSlot);
        this.explodeAt(this.px, this.py, 170 * this.st.areaMul, 25 + this.level * 3, 0, w0);
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
        const w0 = this.weapons[0] ?? ({ ...this.mkSlot('lightning'), area: 1.5 } as WeaponSlot);
        this.explodeAt(this.px, this.py, 240 * this.st.areaMul, 50 + this.level * 5, 0, w0);
        this.ring(this.px, this.py, '#7fd4e8', 240);
      }
    }
    if (hasMeteor) {
      this.meteorT -= dt;
      if (this.meteorT <= 0) {
        this.meteorT = 6 / this.st.cdMul;
        const targets = this.enemies.filter((e) => !e.dead).slice(0, 5);
        for (const t of targets) {
          this.hazards.push({ kind: 'warnc', x: t.x, y: t.y, x2: 0, y2: 0, r: 78, ang: 0, t: 0, dur: 0.8, dmg: 90 + this.level * 8, color: '#ff8a3d', slow: false, owner: 'p', slot: 0 });
        }
        if (targets.length) sfx.telegraph();
      }
    }
    if (hasErupt) {
      this.eruptionT -= dt;
      if (this.eruptionT <= 0) {
        this.eruptionT = 1.6 / this.st.cdMul;
        const alive = this.enemies.filter((e) => !e.dead);
        const t = alive[Math.floor(Math.random() * alive.length)];
        if (t) {
          for (let k = 0; k < 4; k++) this.spikes.push({ x: t.x + rand(-26, 26), y: t.y + rand(-26, 26), t: 0, dur: 2.2, dmg: 24 + this.level * 2, slot: 0 });
          this.ring(t.x, t.y, '#b06cff', 40);
        }
      }
    }
    /* corpses rot */
    for (const cp of this.corpses) cp.t += dt;
    this.corpses = this.corpses.filter((cp) => cp.t < cp.dur);
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
      let cnt = 0;
      for (const o of this.enemies) {
        if (o !== e && !o.dead && dist2(e.x, e.y, o.x, o.y) < 130 * 130) cnt++;
      }
      if (cnt > bc) { bc = cnt; best = e; }
    }
    return best ?? this.nearest(600);
  }

  /* ------------------------------ main update ----------------------------- */

  private update(dt: number) {
    if (this.over) {
      /* keep the world breathing behind the end card; let death anims finish */
      this.panim.update(dt);
      for (const e of this.enemies) {
        if (e.dead) {
          e.dying += dt;
          e.anim.update(dt);
          if (e.dying > 1.2) e.gone = true;
        }
      }
      this.enemies = this.enemies.filter((e) => !e.gone);
      this.stepFx(dt);
      return;
    }
    this.time += dt;
    this.iframe = Math.max(0, this.iframe - dt);
    this.pAtk = Math.max(0, this.pAtk - dt);
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
    this.pSlowT = Math.max(0, this.pSlowT - dt);
    this.blessedT = Math.max(0, this.blessedT - dt);
    if (this.moving) {
      const len = Math.hypot(mx, my);
      let spd = 185 * this.st.spdMul;
      if (this.spinT > 0) spd *= 0.55;
      if (this.pSlowT > 0) spd *= 0.6;
      if (this.st.flags.has('berserk') && this.hp < this.maxHp * 0.5) spd *= 1.18;
      this.px += (mx / len) * spd * dt;
      this.py += (my / len) * spd * dt;
      if (mx !== 0) this.facing = mx > 0 ? 1 : -1;
    }
    this.cam.x += (this.px - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (this.py - this.cam.y) * Math.min(1, dt * 6);

    /* player animator */
    const pa = this.panim;
    if (!(['attack', 'cast', 'hurt', 'die'].includes(pa.clipName) && !pa.done)) {
      pa.play(this.pAtk > 0 ? 'attack' : this.moving ? 'run' : 'idle');
    }
    pa.update(dt);

    this.updateSpawning(dt);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateProjs(dt);
    this.updateOrbitals(dt);
    this.updateProcs(dt);
    this.updateHazards(dt);
    this.updateBullets(dt);
    this.updatePickups(dt);

    /* ambient particles */
    if (this.particles.length < 520 && Math.random() < dt * 14) {
      this.particles.push({
        x: this.cam.x + rand(-this.W / 2, this.W / 2),
        y: this.cam.y + rand(-this.H / 2, this.H / 2),
        vx: rand(-6, 6), vy: rand(-16, -6),
        life: rand(1.5, 3), maxLife: 3, size: rand(1, 2.4),
        color: 'rgba(216,198,154,0.4)', kind: 'dot',
      });
    }

    this.stepFx(dt);
    this.enemies = this.enemies.filter((e) => !e.gone);

    if (this.time >= GAME_DURATION && !this.over) this.finish(true);

    this.snapT -= dt;
    if (this.snapT <= 0) {
      this.snapT = 0.1;
      this.cb.onSnapshot(this.snapshot());
    }
  }

  private stepFx(dt: number) {
    for (const p of this.particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind !== 'sprite') { p.vx *= 1 - 3 * dt; p.vy *= 1 - 3 * dt; }
      if (p.vr) p.rot = (p.rot ?? 0) + p.vr * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 640) this.particles.splice(0, this.particles.length - 640);
    for (const f of this.floaters) { f.y -= 34 * dt; f.t -= dt; }
    this.floaters = this.floaters.filter((f) => f.t > 0);
    for (const a of this.arcs) a.t -= dt;
    this.arcs = this.arcs.filter((a) => a.t > 0);
    for (const d of this.decals) d.a -= dt * 0.02;
    this.decals = this.decals.filter((d) => d.a > 0.05);
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
          const dd = Math.abs(Math.hypot(e.x - this.px, e.y - this.py) - R);
          if (dd < 26 + e.r * 0.5 && e.hurtT <= 0) {
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
            if (Math.random() < 0.4) this.spawnSprite('spark', ox, oy, 18, 0.15, 0, 0);
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
        if (h.t >= 0.8) {
          if (h.slow) {
            h.kind = 'pool';
            h.t = 0;
          } else {
            h.kind = 'burst';
            h.t = 0;
            h.dur = 0.3;
            if (h.owner === 'p') {
              for (const e of this.enemies) {
                if (e.dead) continue;
                if (dist2(e.x, e.y, h.x, h.y) < (h.r + e.r) * (h.r + e.r)) this.damageEnemy(e, h.dmg, h.slot, 80);
              }
              this.spawnSprite('exp-fire', h.x, h.y, h.r * 2.2, 0.45, 0, 0);
            }
            this.ring(h.x, h.y, h.color, h.r);
            this.shakeAt(4);
            sfx.explode();
          }
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
          if (h.color === '#ff8a3d' && Math.random() < dt * 12) {
            this.particles.push({
              x: h.x + rand(-h.r, h.r) * 0.6, y: h.y + rand(-h.r, h.r) * 0.4,
              vx: rand(-8, 8), vy: rand(-70, -35), life: rand(0.3, 0.7), maxLife: 0.7,
              size: rand(2, 4), color: Math.random() < 0.5 ? '#ffc258' : '#ff8a3d', kind: 'dot',
            });
          }
        }
        if (Math.random() < dt * 8) this.puff(h.x + rand(-h.r, h.r) * 0.7, h.y + rand(-h.r, h.r) * 0.7, h.color);
      } else if (h.kind === 'beam') {
        h.ang += dt * 1.1;
        const ex = h.x + Math.cos(h.ang) * h.r;
        const ey = h.y + Math.sin(h.ang) * h.r;
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
          this.spawnSprite('spark', e.x, e.y, 16, 0.14, 0, 0);
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
        const dd = Math.sqrt(d2) || 1;
        p.x -= ((p.x - this.px) / dd) * 700 * dt;
        p.y -= ((p.y - this.py) / dd) * 700 * dt;
      } else if (d2 < pr2 && p.kind !== 'chest') {
        const dd = Math.sqrt(d2) || 1;
        p.x -= ((p.x - this.px) / dd) * 520 * dt;
        p.y -= ((p.y - this.py) / dd) * 520 * dt;
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
      if (this.st.flags.has('overload')) {
        const fake = { ...this.mkSlot('lightning'), dmg: 1, area: 1.4 } as WeaponSlot;
        this.explodeAt(this.px, this.py, 210, 30 + this.level * 5, 0, fake);
        this.ring(this.px, this.py, '#7fd4e8', 210);
      }
      this.cb.onLevelUp(this.buildChoices());
    }
  }

  /* ------------------------------- finish --------------------------------- */

  private finish(victory: boolean) {
    if (this.over) return;
    this.over = true;
    this.victory = victory;
    if (victory) {
      sfx.victory();
      this.cb.onSnapshot(this.snapshot());
    } else {
      sfx.death();
      this.panim.play('die', true);
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
        { label: 'Bosses slain', value: `${this.bossKills} / 6` },
        { label: 'Evolutions', value: `${this.fusionNames.length}` },
      ],
    };
    setTimeout(() => this.cb.onEnd(stats), victory ? 900 : 1400);
  }

  /* ------------------------------- snapshot ------------------------------- */

  private snapshot(): Snapshot {
    const weapons: SnapshotWeapon[] = this.weapons.map((w) => ({
      id: w.id, lvl: w.lvl, fused: !!w.fused,
      fusedName: w.fused?.def.name, fusedWith: w.fused?.partner,
      cd: Math.max(0, Math.min(w.cd, w.rcd)), cdMax: w.rcd,
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
      muted: this.muted,
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

  private spawnSprite(spr: string, x: number, y: number, size: number, life: number, vx = 0, vy = 0, rot = 0, vr = 0) {
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color: '#fff', kind: 'sprite', spr, rot, vr });
  }

  private floater(x: number, y: number, txt: string, color: string, size: number) {
    if (this.floaters.length > 60) this.floaters.shift();
    this.floaters.push({ x, y, t: 0.8, txt, color, size });
  }

  /* ================================= DRAW ================================= */

  private errCount = 0;

  private loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let raw = (now - this.last) / 1000;
    this.last = now;
    raw = Math.min(raw, 0.05);
    try {
      if (!this.paused && !this.uiLock) {
        if (this.freeze > 0) {
          this.freeze -= raw;
        } else {
          this.timeScale += (1 - this.timeScale) * Math.min(1, raw * 2.2);
          this.update(raw * this.timeScale);
        }
      }
      this.draw();
    } catch (err) {
      /* keep the game alive across a bad frame; report once */
      this.errCount++;
      if (this.errCount <= 3) {
        const msg = err instanceof Error ? `${err.message}\n${err.stack?.split('\n')[1] ?? ''}` : String(err);
        this.cb.onError?.(msg);
        // eslint-disable-next-line no-console
        console.error('[Gloomfall] frame error:', err);
      }
    }
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

    this.drawGround(c, ox, oy);

    c.save();
    c.translate(ox, oy);

    /* decals */
    for (const d of this.decals) {
      if (d.spr !== undefined) {
        drawFx(c, 'gore', d.x, d.y, d.r * 2.6, d.spr / 2, 0, d.a * 1.4);
      } else {
        c.globalAlpha = d.a * 0.7;
        c.fillStyle = d.color;
        c.beginPath();
        c.ellipse(d.x, d.y, d.r, d.r * 0.65, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 1;
      }
    }

    this.drawHazardsUnder(c);

    for (const p of this.pickups) this.drawPickup(c, p);

    /* spikes */
    for (const sp of this.spikes) {
      const t01 = sp.t < 0.25 ? (sp.t / 0.25) * 0.3 : 0.3 + fxFrame('caltrop', this.time + sp.x * 0.13) * 0.6;
      drawFx(c, 'caltrop', sp.x, sp.y, 30, t01);
    }

    /* necromantic corpses awaiting detonation */
    for (const cp of this.corpses) {
      const fade = clamp(1 - cp.t / cp.dur, 0, 1);
      c.globalAlpha = 0.55 * fade + 0.15;
      c.fillStyle = '#3d4d2e';
      c.strokeStyle = 'rgba(24,10,34,0.8)';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(cp.x, cp.y, cp.big ? 17 : 11, cp.big ? 9 : 6, 0.4, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.globalAlpha = 0.35 + Math.sin(this.time * 6 + cp.x) * 0.15;
      c.fillStyle = '#9be85e';
      c.beginPath();
      c.arc(cp.x + 3, cp.y - 3, 2.4, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 1;
    }

    /* hammer-of-heaven telegraphs */
    for (const hq of this.hammerQ) {
      const p = clamp(1 - hq.t / 0.42, 0, 1);
      c.globalAlpha = 0.3 + Math.sin(this.time * 20) * 0.12;
      c.strokeStyle = '#ffc258';
      c.lineWidth = 3.5;
      c.beginPath();
      c.arc(hq.x, hq.y, 135 * (1.35 - p * 0.35), 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 0.85;
      drawFx(c, 'spark', hq.x, hq.y - 260 * (1 - p), 34, fxFrame('spark', this.time * 3), 0, p);
      c.globalAlpha = 1;
    }

    /* enemies sorted by y */
    const sorted = [...this.enemies].sort((a, b) => a.y - b.y);
    for (const e of sorted) this.drawEnemy(c, e);

    /* player */
    this.drawPlayer(c);

    /* orbitals */
    for (const o of this.orbitals) {
      const x = this.px + Math.cos(o.ang) * o.r;
      const y = this.py + Math.sin(o.ang) * o.r;
      if (o.kind === 'blade') drawFx(c, 'blade', x, y, 30, fxFrame('blade', this.time * 3 + o.ang), o.ang * 2);
      else drawFx(c, 'scytheorb', x, y, 42, fxFrame('scytheorb', this.time * 2 + o.ang), o.ang * 1.5);
    }

    /* aura rings */
    for (const s of this.weapons) {
      if (s.id === 'aura') {
        const R = 90 * s.area;
        c.globalAlpha = 0.10 + Math.sin(this.time * 5) * 0.03;
        const ag = c.createRadialGradient(this.px, this.py, R * 0.2, this.px, this.py, R);
        ag.addColorStop(0, 'rgba(255,194,88,0)');
        ag.addColorStop(1, 'rgba(255,194,88,0.55)');
        c.fillStyle = ag;
        c.beginPath(); c.arc(this.px, this.py, R, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        drawFx(c, 'auraring', this.px, this.py, R * 2.05, fxFrame('auraring', this.time * 1.5), 0, 0.8);
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
        c.globalAlpha = 0.16;
        c.fillStyle = '#e6404f';
        c.beginPath(); c.arc(this.px, this.py, R, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 1;
        drawFx(c, 'whirl', this.px, this.py, R * 2.15, fxFrame('whirl', this.time * 4), 0, 0.85);
      }
    }

    /* projectiles */
    for (const p of this.projs) this.drawProj(c, p);

    /* lightning arcs — jagged, glowing */
    for (const a of this.arcs) {
      const al = a.t / 0.22;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = al;
      const segs = 5;
      const pts: [number, number][] = [[a.x1, a.y1]];
      for (let i = 1; i < segs; i++) {
        const t = i / segs;
        pts.push([
          a.x1 + (a.x2 - a.x1) * t + rand(-13, 13),
          a.y1 + (a.y2 - a.y1) * t + rand(-13, 13),
        ]);
      }
      pts.push([a.x2, a.y2]);
      c.strokeStyle = a.color;
      c.lineWidth = 5;
      c.lineJoin = 'round';
      c.beginPath();
      c.moveTo(pts[0][0], pts[0][1]);
      for (const [qx, qy] of pts) c.lineTo(qx, qy);
      c.stroke();
      c.strokeStyle = '#ffffff';
      c.lineWidth = 2;
      c.stroke();
      c.restore();
    }

    /* enemy bullets */
    for (const b of this.ebullets) {
      const g = c.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r + 5);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.4, b.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = g;
      c.beginPath();
      c.arc(b.x, b.y, b.r + 5, 0, Math.PI * 2);
      c.fill();
      c.restore();
      c.fillStyle = b.color;
      c.strokeStyle = '#120a1c';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }

    /* particles */
    for (const p of this.particles) {
      const t = p.life / p.maxLife;
      if (p.kind === 'sprite' && p.spr) {
        drawFx(c, p.spr, p.x, p.y, p.size * (0.5 + t * 0.6), 1 - t, p.rot ?? 0, Math.min(1, t * 2));
      } else if (p.kind === 'ring') {
        c.globalAlpha = t;
        c.strokeStyle = p.color;
        c.lineWidth = 5 * t + 1;
        c.beginPath();
        c.arc(p.x, p.y, p.size * (1.6 - t * 0.6), 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
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
        c.globalAlpha = 1;
      }
    }
    c.globalAlpha = 1;

    /* beams & pillars over entities */
    for (const h of this.hazards) {
      if (h.kind === 'beam') {
        const ex = h.x + Math.cos(h.ang) * h.r;
        const ey = h.y + Math.sin(h.ang) * h.r;
        const g = c.createLinearGradient(h.x, h.y, ex, ey);
        g.addColorStop(0, h.color);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c.save();
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = 0.8;
        c.strokeStyle = g;
        c.lineWidth = 16;
        c.lineCap = 'round';
        c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(ex, ey); c.stroke();
        c.lineWidth = 6;
        c.strokeStyle = '#ffffff';
        c.beginPath(); c.moveTo(h.x, h.y); c.lineTo(ex, ey); c.stroke();
        c.restore();
      } else if (h.kind === 'pillar') {
        drawFx(c, 'pillar', h.x, h.y, h.r * 2.6, clamp(h.t / h.dur, 0, 1));
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

    /* fog layers */
    this.drawFog(c);
    /* dynamic lights */
    this.drawLights(c, ox, oy);
    /* cathedral light streaks */
    c.save();
    c.globalCompositeOperation = 'screen';
    c.rotate(-0.42);
    for (let i = 0; i < 3; i++) {
      const bx = ((i * 480 - this.cam.x * 0.08 + this.time * 6) % (this.W + 900)) - 450;
      const lg = c.createLinearGradient(bx, 0, bx + 200, 0);
      lg.addColorStop(0, 'rgba(255,214,150,0)');
      lg.addColorStop(0.5, 'rgba(255,214,150,0.045)');
      lg.addColorStop(1, 'rgba(255,214,150,0)');
      c.fillStyle = lg;
      c.fillRect(bx, -this.H, 200, this.H * 3);
    }
    c.restore();

    /* vignette */
    const vg = c.createRadialGradient(this.W / 2, this.H / 2, Math.min(this.W, this.H) * 0.35, this.W / 2, this.H / 2, Math.max(this.W, this.H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(5,2,12,0.66)');
    c.fillStyle = vg;
    c.fillRect(0, 0, this.W, this.H);

    /* color grade */
    c.save();
    c.globalCompositeOperation = 'overlay';
    const cg = c.createLinearGradient(0, 0, 0, this.H);
    cg.addColorStop(0, 'rgba(96,64,180,0.10)');
    cg.addColorStop(1, 'rgba(255,150,70,0.08)');
    c.fillStyle = cg;
    c.fillRect(0, 0, this.W, this.H);
    c.restore();

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

  private drawGround(c: CanvasRenderingContext2D, ox: number, oy: number) {
    const tile = getTileCanvas();
    if (!tile) return;
    const x0 = Math.floor(-ox / TILE) - 1;
    const y0 = Math.floor(-oy / TILE) - 1;
    const x1 = Math.ceil((this.W - ox) / TILE) + 1;
    const y1 = Math.ceil((this.H - oy) / TILE) + 1;
    /* props behind tiles? props sit on top of tiles but below entities: draw tiles then props */
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const v = tileVariant(tx, ty);
        c.drawImage(tile, v * TILE, 0, TILE, TILE, tx * TILE + ox, ty * TILE + oy, TILE, TILE);
      }
    }
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const pr = propAt(tx, ty);
        if (!pr) continue;
        const pd = getProp(pr.kind);
        if (!pd) continue;
        const px = tx * TILE + ox + TILE / 2 + pr.dx;
        const py = ty * TILE + oy + TILE / 2 + pr.dy;
        c.save();
        c.translate(px, py);
        c.scale(pr.flip ? -pr.s : pr.s, pr.s);
        c.drawImage(pd.canvas, -pd.canvas.width / 2, -pd.canvas.height / 2);
        c.restore();
      }
    }
  }

  private drawFog(c: CanvasRenderingContext2D) {
    const fogs = getFogs();
    for (let i = 0; i < fogs.length; i++) {
      const f = fogs[i];
      const speed = 10 + i * 7;
      const par = 0.3 + i * 0.18;
      const span = this.W + 960;
      for (let k = 0; k < 3; k++) {
        const base = k * (span / 3) + i * 210;
        const sx = (((base + this.time * speed - this.cam.x * par) % span) + span) % span - 480;
        const sy = this.H * (0.16 + i * 0.3) + Math.sin(this.time * 0.13 + i * 2 + k) * 46 + k * 30;
        c.globalAlpha = 0.75;
        c.drawImage(f, sx, sy, 960, 480);
      }
    }
    c.globalAlpha = 1;
  }

  private drawLights(c: CanvasRenderingContext2D, ox: number, oy: number) {
    c.save();
    c.globalCompositeOperation = 'lighter';
    const flick = Math.sin(this.time * 13) * 0.5 + Math.sin(this.time * 7.3) * 0.5;
    /* player torch */
    const pr = 250 + flick * 12;
    let g = c.createRadialGradient(this.px + ox, this.py + oy, 10, this.px + ox, this.py + oy, pr);
    g.addColorStop(0, `rgba(255,176,88,${0.13 + flick * 0.02})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(this.px + ox, this.py + oy, pr, 0, Math.PI * 2);
    c.fill();
    /* fire pools */
    for (const h of this.hazards) {
      if (h.kind === 'pool' && h.owner === 'p') {
        const hg = c.createRadialGradient(h.x + ox, h.y + oy, 4, h.x + ox, h.y + oy, h.r * 1.5);
        hg.addColorStop(0, 'rgba(255,150,60,0.14)');
        hg.addColorStop(1, 'rgba(255,120,40,0)');
        c.fillStyle = hg;
        c.beginPath();
        c.arc(h.x + ox, h.y + oy, h.r * 1.5, 0, Math.PI * 2);
        c.fill();
      }
    }
    /* boss auras */
    for (const e of this.enemies) {
      if (e.bossIdx >= 0 && !e.dead) {
        const bg = c.createRadialGradient(e.x + ox, e.y + oy, 10, e.x + ox, e.y + oy, e.r * 4);
        bg.addColorStop(0, `${e.def.color}33`);
        bg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = bg;
        c.beginPath();
        c.arc(e.x + ox, e.y + oy, e.r * 4, 0, Math.PI * 2);
        c.fill();
      }
    }
    /* glowing props */
    const x0 = Math.floor(-ox / TILE) - 1;
    const y0 = Math.floor(-oy / TILE) - 1;
    const x1 = Math.ceil((this.W - ox) / TILE) + 1;
    const y1 = Math.ceil((this.H - oy) / TILE) + 1;
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const pr = propAt(tx, ty);
        if (!pr || (pr.kind !== 'mushroom' && pr.kind !== 'candle')) continue;
        const px = tx * TILE + ox + TILE / 2 + pr.dx;
        const py = ty * TILE + oy + TILE / 2 + pr.dy;
        const col = pr.kind === 'mushroom' ? '192,123,255' : '255,190,90';
        const fl = Math.sin(this.time * 9 + tx * 3 + ty * 5) * 0.03;
        const lg = c.createRadialGradient(px, py, 2, px, py, 70);
        lg.addColorStop(0, `rgba(${col},${0.13 + fl})`);
        lg.addColorStop(1, `rgba(${col},0)`);
        c.fillStyle = lg;
        c.beginPath();
        c.arc(px, py, 70, 0, Math.PI * 2);
        c.fill();
      }
    }
    c.restore();
  }

  private drawHazardsUnder(c: CanvasRenderingContext2D) {
    for (const h of this.hazards) {
      if (h.kind === 'pool') {
        const a = clamp(1 - h.t / h.dur, 0, 1);
        c.globalAlpha = 0.42 * a + 0.1;
        const g = c.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r);
        g.addColorStop(0, h.color);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g;
        c.beginPath();
        c.ellipse(h.x, h.y, h.r, h.r * 0.72, 0, 0, Math.PI * 2);
        c.fill();
        c.globalAlpha = 0.65 * a;
        c.strokeStyle = h.color;
        c.lineWidth = 2.5;
        c.beginPath();
        c.ellipse(h.x, h.y, h.r * (0.7 + Math.sin(this.time * 6) * 0.06), h.r * 0.5, 0, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      } else if (h.kind === 'warnc') {
        const p = clamp(h.t / 0.8, 0, 1);
        c.globalAlpha = 0.22 + Math.sin(this.time * 16) * 0.1;
        c.fillStyle = h.color;
        c.beginPath(); c.arc(h.x, h.y, h.r, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.9;
        c.strokeStyle = h.color;
        c.lineWidth = 3;
        c.beginPath(); c.arc(h.x, h.y, h.r * (1 - p * 0.5), 0, Math.PI * 2); c.stroke();
        if (h.owner === 'p') {
          /* incoming meteor shadow */
          drawFx(c, 'meteor', h.x, h.y - 220 * (1 - p), 60, fxFrame('meteor', this.time * 2), 0, p);
        }
        c.globalAlpha = 1;
      }
    }
  }

  private drawPickup(c: CanvasRenderingContext2D, p: Pickup) {
    const bob = Math.sin(p.t * 5 + p.x) * 3;
    if (p.kind === 'xp') {
      const spr = p.v >= 30 ? 'soul-gold' : p.v >= 15 ? 'soul-purple' : p.v >= 5 ? 'soul-blue' : 'soul-green';
      const size = p.v >= 30 ? 30 : p.v >= 15 ? 27 : p.v >= 5 ? 23 : 19;
      drawFx(c, spr, p.x, p.y + bob, size, fxFrame(spr, this.time + p.x * 0.1));
    } else if (p.kind === 'gold') {
      drawFx(c, 'coin', p.x, p.y + bob, 24, fxFrame('coin', this.time + p.y * 0.1));
    } else if (p.kind === 'heal') {
      drawFx(c, 'heal', p.x, p.y + bob, 28, fxFrame('heal', this.time));
    } else {
      const wob = fxFrame('chest', p.t) * 0.3;
      drawFx(c, 'chest', p.x, p.y + bob * 0.5, 46, wob);
    }
  }

  private drawProj(c: CanvasRenderingContext2D, p: Proj) {
    if (p.kind === 'fire') {
      drawFx(c, 'fireball', p.x, p.y, p.r * 3.6, fxFrame('fireball', this.time * 2 + p.x * 0.02), Math.atan2(p.vy, p.vx));
    } else {
      drawFx(c, 'bonespear', p.x, p.y, p.r * 4.6, fxFrame('bonespear', this.time * 3 + p.y * 0.02), Math.atan2(p.vy, p.vx));
    }
  }

  private drawPlayer(c: CanvasRenderingContext2D) {
    const x = this.px, y = this.py;
    c.save();
    /* shadow */
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.ellipse(x, y + 20, 15, 6, 0, 0, Math.PI * 2);
    c.fill();
    let alpha = 1;
    if (this.iframe > 0 && Math.floor(this.time * 18) % 2 === 0) alpha = 0.55;
    if (getSheet(`player-${this.classId}`)) {
      this.panim.draw(c, x, y + 4, 1.06, this.facing < 0, alpha);
    } else {
      /* emergency vector fallback so the hero is never invisible */
      c.globalAlpha = alpha;
      c.fillStyle = CLASSES[this.classId].color;
      c.strokeStyle = '#120a1c';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(x, y, 17, 0, Math.PI * 2);
      c.fill();
      c.stroke();
      c.fillStyle = '#fff';
      c.beginPath();
      c.arc(x + this.facing * 4 - 3, y - 3, 2.6, 0, Math.PI * 2);
      c.arc(x + this.facing * 4 + 3, y - 3, 2.6, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  private drawEnemy(c: CanvasRenderingContext2D, e: Enemy) {
    const x = e.x;
    let y = e.y;
    const isBoss = e.bossIdx >= 0;
    let alpha = 1;
    let sink = 0;

    /* burrowed ghoul */
    if (e.skin === 'ghoul' && !e.dead && e.ai.state < 2) {
      c.fillStyle = 'rgba(138,115,85,0.75)';
      c.strokeStyle = 'rgba(24,10,34,0.8)';
      c.lineWidth = 2;
      c.beginPath();
      c.ellipse(x, y + e.r * 0.3, e.r * 1.1, e.r * 0.55, 0, Math.PI, 0);
      c.fill();
      c.stroke();
      return;
    }
    /* grave worm: hidden mound, telegraph ring, then it surfaces */
    if (e.skin === 'worm' && !e.dead && e.ai.state < 2) {
      c.fillStyle = 'rgba(138,115,85,0.8)';
      c.strokeStyle = 'rgba(24,10,34,0.85)';
      c.lineWidth = 2.4;
      c.beginPath();
      c.ellipse(x, y + e.r * 0.35, e.r * 1.15, e.r * 0.6, 0, Math.PI, 0);
      c.fill();
      c.stroke();
      if (e.ai.state === 1) {
        const p = 1 - e.ai.t / 0.75;
        c.globalAlpha = 0.5 + Math.sin(this.time * 18) * 0.25;
        c.strokeStyle = '#b08968';
        c.lineWidth = 3.5;
        c.beginPath();
        c.arc(x, y, e.r * (1.8 - p * 0.7), 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 1;
      }
      return;
    }

    if (e.dead) {
      const dur = isBoss ? 1.15 : 0.62;
      const t = clamp(e.dying / dur, 0, 1);
      alpha = 1 - t * t;
      sink = t * 14;
    }

    /* shadow */
    c.fillStyle = 'rgba(0,0,0,0.38)';
    c.beginPath();
    c.ellipse(x, y + e.r * 0.85, e.r * 0.95, e.r * 0.34, 0, 0, Math.PI * 2);
    c.fill();

    if (e.elite && !e.dead) {
      c.strokeStyle = '#ffc258';
      c.lineWidth = 3;
      c.globalAlpha = 0.65 + Math.sin(this.time * 6 + e.seed) * 0.3;
      c.beginPath(); c.arc(x, y, e.r + 7, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    /* frost shade chill aura */
    if (e.skin === 'shade' && !e.dead) {
      c.globalAlpha = 0.16 + Math.sin(this.time * 4 + e.seed) * 0.06;
      const cg = c.createRadialGradient(x, y, 10, x, y, 135);
      cg.addColorStop(0, 'rgba(127,212,232,0.5)');
      cg.addColorStop(1, 'rgba(127,212,232,0)');
      c.fillStyle = cg;
      c.beginPath(); c.arc(x, y, 135, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.5;
      c.strokeStyle = '#7fd4e8';
      c.lineWidth = 2;
      c.setLineDash([8, 10]);
      c.lineDashOffset = this.time * 30;
      c.beginPath(); c.arc(x, y, 135, 0, Math.PI * 2); c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }
    /* knight dash telegraph line */
    if (e.skin === 'knight' && !e.dead && e.ai.state === 1) {
      c.globalAlpha = 0.45 + Math.sin(this.time * 20) * 0.25;
      c.strokeStyle = '#e6404f';
      c.lineWidth = 4;
      c.setLineDash([12, 10]);
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(e.ai.ang) * 300, y + Math.sin(e.ai.ang) * 300);
      c.stroke();
      c.setLineDash([]);
      c.globalAlpha = 1;
    }

    const scale = (e.r / (SPR_R[e.skin] ?? 15)) * (1 + e.flash * 0.07);
    e.anim.draw(c, x, y + sink + (e.anim.clipName === 'walk' ? 0 : 0), scale, e.face < 0, alpha);

    /* slow tint */
    if (e.slow > 0 && !e.dead) {
      c.globalAlpha = 0.4;
      c.strokeStyle = '#7fd4e8';
      c.lineWidth = 2.5;
      c.beginPath(); c.arc(x, y, e.r + 3, 0.5, 2.6); c.stroke();
      c.globalAlpha = 1;
    }

    /* hit flash */
    if (e.flash > 0 && !e.dead) {
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = e.flash * 0.5;
      c.fillStyle = '#ffffff';
      c.beginPath();
      c.arc(x, y, e.r, 0, Math.PI * 2);
      c.fill();
      c.restore();
    }
    /* cinder fiend fuse: pulsing molten glow as it's about to blow */
    if (e.skin === 'cinder' && !e.dead && e.ai.state === 1) {
      const fp = 1 - e.ai.t / 0.85;
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.4 + fp * 0.5 + Math.sin(this.time * 26) * 0.15;
      const fg = c.createRadialGradient(x, y, 2, x, y, e.r * (1.4 + fp));
      fg.addColorStop(0, '#fff3c4');
      fg.addColorStop(0.5, '#ff8a3d');
      fg.addColorStop(1, 'rgba(230,64,79,0)');
      c.fillStyle = fg;
      c.beginPath();
      c.arc(x, y, e.r * (1.4 + fp), 0, Math.PI * 2);
      c.fill();
      c.restore();
    }

    /* elite hp bar */
    if (e.elite && !e.dead && e.hp < e.maxHp) {
      const w = e.r * 2;
      c.fillStyle = '#120a1c';
      c.fillRect(x - w / 2, y - e.r - 14, w, 5);
      c.fillStyle = '#e6404f';
      c.fillRect(x - w / 2 + 1, y - e.r - 13, (w - 2) * clamp(e.hp / e.maxHp, 0, 1), 3);
    }
    /* boss telegraph ring while winding attacks */
    if (isBoss && !e.dead && e.atk && ['charge', 'spin'].includes(e.atk.type) && e.atk.t < 0.55) {
      c.globalAlpha = 0.5 + Math.sin(this.time * 18) * 0.25;
      c.strokeStyle = '#e6404f';
      c.lineWidth = 3.5;
      c.beginPath(); c.arc(x, y, e.r + 12, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
  }
}

/* deferred micro-tasks scheduled on game time */
const deferred: { at: number; fn: () => void }[] = [];

export { isWeapon };
