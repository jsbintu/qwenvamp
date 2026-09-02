export type WeaponId =
  | 'hellfire'
  | 'bonespear'
  | 'aura'
  | 'lightning'
  | 'blades'
  | 'caltrops'
  | 'whirlwind'
  | 'scythe';

export type PassiveId =
  | 'vitality'
  | 'boots'
  | 'greed'
  | 'might'
  | 'tome'
  | 'hourglass'
  | 'whetstone'
  | 'armor'
  | 'phoenix';

export type ClassId = 'barbarian' | 'necromancer' | 'sorceress';

export type SkinId =
  | 'risen' | 'clatter' | 'imp' | 'spitter' | 'goatkin' | 'archer' | 'wraith'
  | 'brute' | 'shieldkin' | 'hexer' | 'ghoul' | 'bat' | 'goblin'
  | 'butcher' | 'andariel' | 'baal' | 'terrorlord';

export type CompId = WeaponId | PassiveId;

export const WEAPON_IDS: WeaponId[] = [
  'hellfire', 'bonespear', 'aura', 'lightning', 'blades', 'caltrops', 'whirlwind', 'scythe',
];

export const PASSIVE_IDS: PassiveId[] = [
  'vitality', 'boots', 'greed', 'might', 'tome', 'hourglass', 'whetstone', 'armor', 'phoenix',
];

export function isWeapon(id: CompId): id is WeaponId {
  return (WEAPON_IDS as string[]).includes(id);
}

/* A rank effect: each numeric field is an additive delta applied at that rank. */
export interface RankDef {
  text: string;
  dmg?: number;
  cd?: number;
  area?: number;
  proj?: number;
  pierce?: number;
  pspd?: number;
  flag?: string;
  hp?: number;
  regen?: number;
  spd?: number;
  gold?: number;
  luck?: number;
  xp?: number;
  armor?: number;
  crit?: number;
  pickup?: number;
}

export type FusionMod =
  | 'explode' | 'inferno' | 'barrage' | 'judgment' | 'tempest' | 'cyclone'
  | 'eruption' | 'bloodthirst' | 'pull' | 'reaper' | 'chain' | 'gilded'
  | 'orbitals' | 'crush' | 'spikes' | 'swift' | 'split' | 'echo' | 'vorpal'
  | 'lifesteal' | 'critplus' | 'pierceplus' | 'ring' | 'ward' | 'meteorRain'
  | 'trail' | 'magnet' | 'noslow' | 'erudite' | 'thorns';

export type RelicProc =
  | 'bloodpact' | 'midas' | 'chronoshift' | 'bulwark' | 'warmonger'
  | 'swiftfortune' | 'omniscience' | 'razorwind' | 'ironblood' | 'emberheart';

export interface SnapshotWeapon {
  id: WeaponId;
  lvl: number;
  fused: boolean;
  fusedName?: string;
  fusedWith?: CompId;
}

export interface SnapshotPassive {
  id: PassiveId;
  lvl: number;
  fused: boolean;
  fusedName?: string;
  proc?: RelicProc;
}

export interface BossSnap {
  name: string;
  hpPct: number;
  phase: number;
  phases: number;
}

export interface Snapshot {
  hp: number;
  maxHp: number;
  level: number;
  xp: number;
  xpNeed: number;
  time: number;
  duration: number;
  kills: number;
  gold: number;
  weapons: SnapshotWeapon[];
  passives: SnapshotPassive[];
  boss: BossSnap | null;
  muted: boolean;
}

export interface StatLine { label: string; value: string; }

export interface EndStats {
  victory: boolean;
  time: number;
  level: number;
  kills: number;
  gold: number;
  dmgDealt: number;
  evolutions: number;
  fusions: string[];
  bossKills: number;
  stats: StatLine[];
}

export interface Choice {
  kind: 'weapon' | 'passive' | 'fusion';
  id: CompId;
  pairWith?: CompId;
  level: number;
  isNew: boolean;
  rankText: string;
}

export interface ChestReward {
  kind: 'fusion' | 'heal' | 'gold' | 'weapon' | 'passive';
  id?: CompId;
  pairWith?: CompId;
  amount?: number;
}
