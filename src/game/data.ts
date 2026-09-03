import type { ClassId, PassiveId, RankDef, SkinId, WeaponId } from './types';

/* ------------------------------- abilities ------------------------------ */

export interface WeaponDef {
  id: WeaponId;
  name: string;
  desc: string;
  color: string;
  baseDmg: number;
  baseCd: number;
  ranks: RankDef[]; // 5 ranks, index 0 = Rank I
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  hellfire: {
    id: 'hellfire', name: 'Hellfire Orb', color: '#ff8a3d', baseDmg: 12, baseCd: 1.15,
    desc: 'Hurls a blazing orb that bursts into hellish flame on impact.',
    ranks: [
      { text: 'Hurl a blazing orb that bursts on impact.' },
      { text: '+1 orb. +20% damage.', proj: 1, dmg: 0.2 },
      { text: 'Explosions 35% wider. +15% damage.', area: 0.35, dmg: 0.15 },
      { text: 'Orbs pierce 2 foes. 15% faster hurling.', pierce: 2, cd: -0.15 },
      { text: 'INFERNO — bursts leave pools of burning ground.', dmg: 0.2, flag: 'inferno' },
    ],
  },
  bonespear: {
    id: 'bonespear', name: 'Bone Spear', color: '#f4e8cf', baseDmg: 11, baseCd: 1.3,
    desc: 'Launches a spear of ancient bone that pierces the horde.',
    ranks: [
      { text: 'A spear of bone that pierces 2 foes.' },
      { text: '+1 spear per volley.', proj: 1 },
      { text: '+2 pierce. Spears fly 15% faster.', pierce: 2, pspd: 0.15 },
      { text: '+1 spear. +20% damage.', proj: 1, dmg: 0.2 },
      { text: 'BONE BARRAGE — every volley fires twice.', dmg: 0.15, flag: 'barrage' },
    ],
  },
  aura: {
    id: 'aura', name: 'Halo of Sanctuary', color: '#ffc258', baseDmg: 5, baseCd: 0.4,
    desc: 'A consecrated ring scorches all evil that draws near.',
    ranks: [
      { text: 'A holy ring burns nearby demons.' },
      { text: 'The ring widens by 25%.', area: 0.25 },
      { text: '+20% damage. +15% radius.', dmg: 0.2, area: 0.15 },
      { text: 'Consecration ticks 25% faster.', cd: -0.25 },
      { text: 'JUDGMENT — light pillars smite the densest crowds.', dmg: 0.2, flag: 'judgment' },
    ],
  },
  lightning: {
    id: 'lightning', name: 'Chain Lightning', color: '#7fd4e8', baseDmg: 15, baseCd: 1.7,
    desc: 'Arcs of storm-fire leap from fiend to fiend.',
    ranks: [
      { text: 'Lightning chains between 3 demons.' },
      { text: '+2 chain jumps.', proj: 2 },
      { text: '+25% damage.', dmg: 0.25 },
      { text: '+2 chain jumps. +20% arc area.', proj: 2, area: 0.2 },
      { text: 'TEMPEST — a storm nova wrecks the field periodically.', dmg: 0.15, flag: 'tempest' },
    ],
  },
  blades: {
    id: 'blades', name: 'Blade Sentinels', color: '#c9d4e4', baseDmg: 7, baseCd: 0.45,
    desc: 'Enchanted blades orbit you, carving anything foolish enough to approach.',
    ranks: [
      { text: 'Two blades orbit and carve.' },
      { text: '+1 blade.', proj: 1 },
      { text: '+1 blade. +10% damage.', proj: 1, dmg: 0.1 },
      { text: 'Orbit widens 25%.', area: 0.25 },
      { text: 'CYCLONE — blades periodically surge outward.', dmg: 0.2, flag: 'cyclone' },
    ],
  },
  caltrops: {
    id: 'caltrops', name: 'Demon Caltrops', color: '#b06cff', baseDmg: 16, baseCd: 2.3,
    desc: 'Scatters cursed iron behind you; demons that tread on it get skewered.',
    ranks: [
      { text: 'Scatter 6 cursed spikes behind you.' },
      { text: '+3 spikes per scatter.', proj: 3 },
      { text: '+20% damage. Spikes last longer.', dmg: 0.2, area: 0.2 },
      { text: '+4 spikes. 15% wider scatter.', proj: 4, area: 0.15 },
      { text: 'ERUPTION — spikes erupt beneath random demons.', dmg: 0.15, flag: 'eruption' },
    ],
  },
  whirlwind: {
    id: 'whirlwind', name: 'Whirlwind', color: '#e6404f', baseDmg: 11, baseCd: 3.4,
    desc: 'Spin like a meat grinder of the old tribes, mauling everything close.',
    ranks: [
      { text: 'Spin, mauling all nearby foes.' },
      { text: 'The spin reaches 25% farther.', area: 0.25 },
      { text: '+20% damage. Spins last longer.', dmg: 0.2, area: 0.15 },
      { text: 'The spin drags enemies into its teeth.', flag: 'pull' },
      { text: 'BLOODTHIRST — spinning drinks life from wounds.', dmg: 0.15, flag: 'bloodthirst' },
    ],
  },
  scythe: {
    id: 'scythe', name: 'Grim Scythe', color: '#9be85e', baseDmg: 19, baseCd: 2.1,
    desc: 'A sweeping arc of death in front of you. Loves a crowd. Crits often.',
    ranks: [
      { text: 'Sweep an arc of death. +10% crit.' },
      { text: 'The arc widens 30%.', area: 0.3 },
      { text: '+25% damage.', dmg: 0.25 },
      { text: 'The sweep strikes twice, both directions.', proj: 1 },
      { text: 'REAPING — a scythe orbits you forever.', dmg: 0.15, flag: 'reaper' },
    ],
  },
};

export const WEAPON_LIST: WeaponDef[] = Object.values(WEAPONS);
export const MAX_RANK = 5;

/* -------------------------------- passives ------------------------------ */

export interface PassiveDef {
  id: PassiveId;
  name: string;
  desc: string;
  color: string;
  ranks: RankDef[];
}

export const PASSIVES: Record<PassiveId, PassiveDef> = {
  vitality: {
    id: 'vitality', name: 'Skull of Vitality', color: '#e6404f', desc: 'Max life and regeneration.',
    ranks: [
      { text: '+20% maximum life.', hp: 0.2 },
      { text: 'Regenerate 1 life per second.', regen: 1 },
      { text: '+30% maximum life.', hp: 0.3 },
      { text: 'Regenerate 2 more life per second.', regen: 2 },
      { text: '+40% life and +2 armor.', hp: 0.4, armor: 2 },
    ],
  },
  boots: {
    id: 'boots', name: 'Windrunner Boots', color: '#7fd4e8', desc: 'Movement speed.',
    ranks: [
      { text: '+8% movement speed.', spd: 0.08 },
      { text: '+10% movement speed.', spd: 0.1 },
      { text: 'Ignore slows. +12% speed.', spd: 0.12, flag: 'noslow' },
      { text: '+15% movement speed.', spd: 0.15 },
      { text: 'AFTERIMAGE — running scorches the ground behind you.', spd: 0.2, flag: 'trail' },
    ],
  },
  greed: {
    id: 'greed', name: 'Band of Avarice', color: '#ffc258', desc: 'Pickup range, gold and luck.',
    ranks: [
      { text: '+40% pickup range.', pickup: 0.4 },
      { text: '+25% gold from slain demons.', gold: 0.25 },
      { text: '+10% luck for finer loot.', luck: 0.1 },
      { text: '+60% pickup range.', pickup: 0.6 },
      { text: 'MAGNET PULSE — periodically drag all loot to you.', luck: 0.15, flag: 'magnet' },
    ],
  },
  might: {
    id: 'might', name: 'Bloodstone Amulet', color: '#ff8a3d', desc: 'Raw damage.',
    ranks: [
      { text: '+10% damage.', dmg: 0.1 },
      { text: '+12% damage.', dmg: 0.12 },
      { text: '+10% area of effect.', area: 0.1 },
      { text: '+15% damage.', dmg: 0.15 },
      { text: '+20% damage and +10% crit.', dmg: 0.2, crit: 0.1 },
    ],
  },
  tome: {
    id: 'tome', name: 'Forbidden Tome', color: '#c07bff', desc: 'Experience gained.',
    ranks: [
      { text: '+12% experience.', xp: 0.12 },
      { text: '+15% experience.', xp: 0.15 },
      { text: '+15% experience.', xp: 0.15 },
      { text: '+20% experience.', xp: 0.2 },
      { text: 'ERUDITION — souls are often worth double.', xp: 0.25, flag: 'erudite' },
    ],
  },
  hourglass: {
    id: 'hourglass', name: 'Witching Hourglass', color: '#9be85e', desc: 'Weapon cooldowns.',
    ranks: [
      { text: '6% faster weapon cooldowns.', cd: -0.06 },
      { text: '8% faster cooldowns.', cd: -0.08 },
      { text: '+10% projectile speed.', pspd: 0.1 },
      { text: '10% faster cooldowns.', cd: -0.1 },
      { text: 'TIMEWARP — 12% faster, +15% projectile speed.', cd: -0.12, pspd: 0.15 },
    ],
  },
  whetstone: {
    id: 'whetstone', name: 'Savage Whetstone', color: '#c9d4e4', desc: 'Projectile speed and pierce.',
    ranks: [
      { text: '+10% projectile speed.', pspd: 0.1 },
      { text: '+1 pierce on all projectiles.', pierce: 1 },
      { text: '+15% projectile speed.', pspd: 0.15 },
      { text: '+1 pierce on all projectiles.', pierce: 1 },
      { text: '+25% speed and +15% crit.', pspd: 0.25, crit: 0.15 },
    ],
  },
  armor: {
    id: 'armor', name: 'Gravemail Plate', color: '#8d7ba8', desc: 'Flat damage reduction.',
    ranks: [
      { text: '+2 armor.', armor: 2 },
      { text: '+2 armor.', armor: 2 },
      { text: 'Take 8% less damage.', flag: 'warded' },
      { text: '+3 armor.', armor: 3 },
      { text: 'THORNS — melee attackers bleed for it.', armor: 4, flag: 'thorns' },
    ],
  },
  phoenix: {
    id: 'phoenix', name: 'Phoenix Feather', color: '#ffb03d', desc: 'Cheat death itself.',
    ranks: [{ text: 'Return from death ONCE, erupting in cleansing fire.', flag: 'phoenix' }],
  },
};

export const PASSIVE_LIST: PassiveDef[] = Object.values(PASSIVES);

/* -------------------------------- classes ------------------------------- */

export interface ClassDef {
  id: ClassId;
  name: string;
  title: string;
  desc: string;
  bonus: string;
  color: string;
  hpMul: number;
  dmgMul: number;
  spdMul: number;
  startWeapon: WeaponId;
}

export const CLASSES: Record<ClassId, ClassDef> = {
  barbarian: {
    id: 'barbarian', name: 'Korgath', title: 'Barbarian of Arreat',
    desc: 'A mountain of muscle and bad temper. Walks into the horde and laughs.',
    bonus: '+40% max life · +15% damage', color: '#e6404f',
    hpMul: 1.4, dmgMul: 1.15, spdMul: 0.97, startWeapon: 'whirlwind',
  },
  necromancer: {
    id: 'necromancer', name: 'Vexis', title: 'Necromancer of Rathma',
    desc: 'Death is merely a resource. The bones of the fallen serve twice.',
    bonus: '+15% area · +10% experience', color: '#9be85e',
    hpMul: 1.0, dmgMul: 1.0, spdMul: 1.0, startWeapon: 'bonespear',
  },
  sorceress: {
    id: 'sorceress', name: 'Lyandra', title: 'Sorceress of the Clans',
    desc: 'Fragile as parchment, hits like a meteor. Exactly the trade she wanted.',
    bonus: '+28% damage · −20% max life', color: '#7fd4e8',
    hpMul: 0.8, dmgMul: 1.28, spdMul: 1.05, startWeapon: 'hellfire',
  },
};

/* -------------------------------- enemies ------------------------------- */

export interface EnemyDef {
  skin: SkinId;
  name: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  color: string;
  minTime: number;
  weight: number;
  boss?: boolean;
}

export const ENEMIES: EnemyDef[] = [
  { skin: 'risen', name: 'The Risen', hp: 12, speed: 56, dmg: 8, r: 14, xp: 1, color: '#7cb356', minTime: 0, weight: 10 },
  { skin: 'clatter', name: 'Clatterling', hp: 8, speed: 90, dmg: 6, r: 12, xp: 1, color: '#e8e0cc', minTime: 0, weight: 9 },
  { skin: 'imp', name: 'Fallen Imp', hp: 10, speed: 124, dmg: 7, r: 11, xp: 2, color: '#ff9d4d', minTime: 25, weight: 8 },
  { skin: 'bat', name: 'Plague Bat', hp: 6, speed: 150, dmg: 5, r: 9, xp: 1, color: '#9b7bd8', minTime: 45, weight: 8 },
  { skin: 'spitter', name: 'Bile Spitter', hp: 24, speed: 70, dmg: 9, r: 14, xp: 4, color: '#a4d94e', minTime: 75, weight: 6 },
  { skin: 'goatkin', name: 'Goatkin Ravager', hp: 32, speed: 96, dmg: 12, r: 15, xp: 5, color: '#c9803f', minTime: 105, weight: 6 },
  { skin: 'shieldkin', name: 'Grave Shieldbearer', hp: 46, speed: 62, dmg: 12, r: 16, xp: 7, color: '#8fa3b8', minTime: 140, weight: 5 },
  { skin: 'archer', name: 'Marrow Archer', hp: 20, speed: 82, dmg: 10, r: 13, xp: 5, color: '#d8cfae', minTime: 165, weight: 5 },
  { skin: 'ghoul', name: 'Dust Ghoul', hp: 30, speed: 110, dmg: 11, r: 13, xp: 6, color: '#c9a86b', minTime: 200, weight: 5 },
  { skin: 'wraith', name: 'Hollow Wraith', hp: 38, speed: 145, dmg: 14, r: 13, xp: 8, color: '#9fd8e8', minTime: 235, weight: 5 },
  { skin: 'hexer', name: 'Coven Hexer', hp: 34, speed: 74, dmg: 12, r: 14, xp: 9, color: '#c07bff', minTime: 280, weight: 4 },
  { skin: 'brute', name: 'Pit Brute', hp: 140, speed: 46, dmg: 22, r: 24, xp: 20, color: '#d95f4d', minTime: 320, weight: 4 },
  { skin: 'goblin', name: 'Treasure Goblin', hp: 26, speed: 175, dmg: 0, r: 12, xp: 10, color: '#ffd23d', minTime: 60, weight: 2 },
];

/* ----------------------------- boss encounters --------------------------- */

export type BossPattern =
  | 'charge' | 'spin' | 'summon' | 'spit' | 'pool' | 'dash' | 'spray'
  | 'frostbolt' | 'nova' | 'blink' | 'beams' | 'meteors' | 'firebolt' | 'ring';

export interface BossPhase {
  at: number;
  spdMul: number;
  cdMul: number;
  patterns: BossPattern[];
  msg: string;
}

export interface BossDef {
  skin: SkinId;
  name: string;
  title: string;
  hp: number;
  speed: number;
  dmg: number;
  r: number;
  xp: number;
  color: string;
  at: number;
  weight: number;
  boss: true;
  phases: BossPhase[];
}

export const BOSSES: BossDef[] = [
  {
    skin: 'butcher', name: 'Gorvash', title: 'The Flayed Butcher', hp: 2300, speed: 92, dmg: 26, r: 34, xp: 220,
    color: '#e05a6a', at: 150, weight: 0, boss: true,
    phases: [
      { at: 1, spdMul: 1, cdMul: 1, patterns: ['charge'], msg: 'Gorvash the Flayed awakens...' },
      { at: 0.6, spdMul: 1.3, cdMul: 0.85, patterns: ['spin', 'summon'], msg: 'Gorvash froths with rage!' },
      { at: 0.25, spdMul: 1.65, cdMul: 0.6, patterns: ['charge', 'spin', 'charge'], msg: 'FRESH MEAT!' },
    ],
  },
  {
    skin: 'andariel', name: 'Andariel', title: 'Maiden of Anguish', hp: 5200, speed: 104, dmg: 30, r: 36, xp: 320,
    color: '#8fd94e', at: 300, weight: 0, boss: true,
    phases: [
      { at: 1, spdMul: 1, cdMul: 1, patterns: ['spit', 'pool'], msg: 'Andariel rises from the depths...' },
      { at: 0.6, spdMul: 1.25, cdMul: 0.8, patterns: ['dash', 'pool', 'spit'], msg: 'Her venom floods the earth!' },
      { at: 0.25, spdMul: 1.55, cdMul: 0.55, patterns: ['spray', 'pool', 'dash'], msg: 'The Maiden shrieks in anguish!' },
    ],
  },
  {
    skin: 'baal', name: 'Baal', title: 'Lord of Destruction', hp: 8200, speed: 96, dmg: 34, r: 40, xp: 450,
    color: '#7fd4e8', at: 450, weight: 0, boss: true,
    phases: [
      { at: 1, spdMul: 1, cdMul: 1, patterns: ['frostbolt', 'nova'], msg: 'Baal, Lord of Destruction, descends...' },
      { at: 0.65, spdMul: 1.2, cdMul: 0.8, patterns: ['blink', 'nova', 'frostbolt'], msg: 'He bends cold to his will!' },
      { at: 0.3, spdMul: 1.45, cdMul: 0.6, patterns: ['beams', 'meteors'], msg: 'DESTRUCTION REIGNS!' },
    ],
  },
  {
    skin: 'terrorlord', name: 'Diablo', title: 'The Lord of Terror', hp: 11500, speed: 112, dmg: 40, r: 44, xp: 700,
    color: '#c04de0', at: 550, weight: 0, boss: true,
    phases: [
      { at: 1, spdMul: 1, cdMul: 1, patterns: ['firebolt', 'summon'], msg: 'The Lord of Terror manifests...' },
      { at: 0.65, spdMul: 1.25, cdMul: 0.8, patterns: ['blink', 'ring', 'firebolt'], msg: 'Hellfire engulfs Sanctuary!' },
      { at: 0.3, spdMul: 1.5, cdMul: 0.55, patterns: ['beams', 'meteors', 'ring'], msg: 'TERROR ETERNAL!' },
    ],
  },
];

/* ---------------------------------- misc --------------------------------- */

export const GAME_DURATION = 600;
export const MAX_WEAPONS = 5;
export const MAX_PASSIVES = 5;

export function xpForLevel(level: number): number {
  return Math.floor(5 + level * 6 + Math.pow(level, 2.05) * 0.9);
}

export function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
