import { PASSIVES, WEAPONS } from './data';
import type { CompId, FusionMod, PassiveId, RelicProc, WeaponId } from './types';
import { isWeapon, PASSIVE_IDS, WEAPON_IDS } from './types';

export interface FusionDef {
  key: string;
  kind: 'weapon' | 'relic';
  a: CompId;
  b: CompId;
  name: string;
  desc: string;
  color: string;
  base?: WeaponId;
  mods: FusionMod[];
  dmgMul: number;
  cdMul: number;
  areaMul: number;
  projBonus: number;
  flagship?: boolean;
  proc?: RelicProc;
  statText?: string;
}

/* ------------------------------ name crafting ----------------------------- */

const W_PREFIX: Record<WeaponId, string> = {
  hellfire: 'Cinder', bonespear: 'Bone', aura: 'Halo', lightning: 'Storm',
  blades: 'Blade', caltrops: 'Spike', whirlwind: 'Gore', scythe: 'Grim',
};
const W_SUFFIX: Record<WeaponId, string> = {
  hellfire: 'Pyre', bonespear: 'Barrage', aura: 'Verdict', lightning: 'Tempest',
  blades: 'Whirl', caltrops: 'Field', whirlwind: 'Vortex', scythe: 'Reaping',
};
const P_PREFIX: Record<PassiveId, string> = {
  vitality: 'Blood', boots: 'Wind', greed: 'Midas', might: 'War', tome: 'Arcane',
  hourglass: 'Time', whetstone: 'Keen', armor: 'Iron', phoenix: 'Ember',
};
const P_SUFFIX: Record<PassiveId, string> = {
  vitality: 'Pact', boots: 'Stride', greed: 'Hoarde', might: 'Fury', tome: 'Grimoire',
  hourglass: 'Chrono', whetstone: 'Edge', armor: 'Bulwark', phoenix: 'Dawn',
};

/* ------------------------- weapon-intrinsic modifiers --------------------- */

const W_MOD: Record<WeaponId, { mod: FusionMod; verb: string }> = {
  hellfire: { mod: 'explode', verb: 'impacts explode' },
  bonespear: { mod: 'pierceplus', verb: 'pierces through the horde' },
  aura: { mod: 'ring', verb: 'a burning ring orbits you' },
  lightning: { mod: 'chain', verb: 'hits arc to nearby foes' },
  blades: { mod: 'orbitals', verb: 'extra blades join the orbit' },
  caltrops: { mod: 'spikes', verb: 'hits erupt spike clusters' },
  whirlwind: { mod: 'pull', verb: 'dragging foes into its teeth' },
  scythe: { mod: 'critplus', verb: 'devastating critical reaps' },
};

const P_MOD: Record<PassiveId, { mod: FusionMod; verb: string }> = {
  vitality: { mod: 'lifesteal', verb: 'wounds feed you life' },
  boots: { mod: 'swift', verb: 'blinding velocity' },
  greed: { mod: 'gilded', verb: 'kills burst with gold' },
  might: { mod: 'crush', verb: 'crushing knockback' },
  tome: { mod: 'split', verb: 'shots splinter in two' },
  hourglass: { mod: 'echo', verb: 'time echoes every volley' },
  whetstone: { mod: 'vorpal', verb: 'pierces everything' },
  armor: { mod: 'ward', verb: 'wards of thorns pulse outward' },
  phoenix: { mod: 'inferno', verb: 'all is set ablaze' },
};

/* --------------------------- relic fusion procs --------------------------- */

const PROCS: { id: RelicProc; name: string; desc: string; color: string }[] = [
  { id: 'bloodpact', name: 'Blood Pact', desc: '+3 life regen, 4% of damage dealt returns as life.', color: '#e6404f' },
  { id: 'midas', name: 'Midas Touch', desc: '+30% gold; every coin you touch mends 2 life.', color: '#ffc258' },
  { id: 'chronoshift', name: 'Chrono Shift', desc: '15% faster cooldowns and +8% move speed.', color: '#9be85e' },
  { id: 'bulwark', name: 'Iron Bulwark', desc: '+6 armor and a thorn nova every 7s.', color: '#8d7ba8' },
  { id: 'warmonger', name: 'War Monger', desc: '+25% damage; a war-aura pulses damage every 4s.', color: '#ff8a3d' },
  { id: 'swiftfortune', name: 'Swift Fortune', desc: '+12% speed and +25% luck for finer chests.', color: '#7fd4e8' },
  { id: 'omniscience', name: 'Omniscience', desc: '+40% experience and +50% pickup range.', color: '#c07bff' },
  { id: 'razorwind', name: 'Razor Wind', desc: '+20% projectile speed and +1 pierce everywhere.', color: '#c9d4e4' },
  { id: 'ironblood', name: 'Iron Blood', desc: '+30% max life and +3 armor.', color: '#d95f4d' },
  { id: 'emberheart', name: 'Ember Heart', desc: '+10% damage; being struck erupts in fire (6s).', color: '#ffb03d' },
];

export function procInfo(p: RelicProc) {
  return PROCS.find((x) => x.id === p)!;
}

/* --------------------------- flagship evolutions --------------------------- */

const FLAGSHIPS: Record<string, { name: string; desc: string; mods: FusionMod[] }> = {
  'hellfire+tome': {
    name: 'Cinderfall Meteor', mods: ['explode', 'inferno', 'meteorRain', 'split'],
    desc: 'Orbs grow monstrous and meteors rain from the burning sky, leaving pools of fire.',
  },
  'bonespear+whetstone': {
    name: 'Storm of a Thousand Bones', mods: ['pierceplus', 'vorpal', 'barrage'],
    desc: 'Spears volley from both flanks and pierce through everything they meet.',
  },
  'aura+armor': {
    name: 'Heaven’s Verdict', mods: ['ring', 'ward', 'judgment'],
    desc: 'The halo widens into a fortress of light; pillars smite the densest crowds.',
  },
  'lightning+greed': {
    name: 'Stormlord’s Wrath', mods: ['chain', 'gilded', 'tempest'],
    desc: 'Chains arc wider and every storm-slain demon bursts with gold.',
  },
  'blades+might': {
    name: 'Whirl of Blades', mods: ['orbitals', 'crush', 'cyclone'],
    desc: 'A storm of eight blades surges outward and flattens anything in its orbit.',
  },
  'caltrops+boots': {
    name: 'Spikewrought Tempest', mods: ['spikes', 'swift', 'eruption'],
    desc: 'The earth itself rebels — spikes erupt beneath demons wherever they stand.',
  },
  'whirlwind+vitality': {
    name: 'Blood Vortex', mods: ['pull', 'bloodthirst', 'lifesteal'],
    desc: 'The vortex drags enemies into its teeth and drinks their life for yours.',
  },
  'scythe+hourglass': {
    name: 'Reaper’s Cyclone', mods: ['critplus', 'echo', 'reaper'],
    desc: 'Twin scythes orbit forever while every sweep echoes through time.',
  },
};

/* -------------------------------- resolver -------------------------------- */

function pairKey(a: CompId, b: CompId): string {
  return [a, b].sort().join('+');
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

const cache = new Map<string, FusionDef>();

export function resolveFusion(a: CompId, b: CompId): FusionDef {
  const key = pairKey(a, b);
  const hit = cache.get(key);
  if (hit) return hit;

  const aw = isWeapon(a);
  const bw = isWeapon(b);
  let def: FusionDef;

  if (aw && bw) {
    const [w1, w2] = [a as WeaponId, b as WeaponId];
    const primary = WEAPONS[w1].baseDmg >= WEAPONS[w2].baseDmg ? w1 : w2;
    const m1 = W_MOD[w1];
    const m2 = W_MOD[w2];
    def = {
      key, kind: 'weapon', a, b,
      name: `${W_PREFIX[w1]} ${W_SUFFIX[w2]}`,
      desc: `The ${WEAPONS[w1].name} devours the ${WEAPONS[w2].name}: ${m1.verb} while ${m2.verb}.`,
      color: WEAPONS[primary].color,
      base: primary,
      mods: [m1.mod, m2.mod],
      dmgMul: 2.1, cdMul: 0.82, areaMul: 1.4, projBonus: 1,
    };
  } else if (aw !== bw) {
    const w = (aw ? a : b) as WeaponId;
    const p = (aw ? b : a) as PassiveId;
    const pm = P_MOD[p];
    const flagship = FLAGSHIPS[key];
    def = {
      key, kind: 'weapon', a, b,
      name: flagship ? flagship.name : `${W_PREFIX[w]} ${P_SUFFIX[p]}`,
      desc: flagship ? flagship.desc : `The ${WEAPONS[w].name} is forged with the ${PASSIVES[p].name}: ${pm.verb}.`,
      color: WEAPONS[w].color,
      base: w,
      mods: flagship ? flagship.mods : [W_MOD[w].mod, pm.mod],
      dmgMul: flagship ? 2.4 : 1.8,
      cdMul: flagship ? 0.78 : 0.88,
      areaMul: flagship ? 1.5 : 1.25,
      projBonus: flagship ? 2 : 1,
      flagship: !!flagship,
    };
  } else {
    const [p1, p2] = [a as PassiveId, b as PassiveId];
    const proc = PROCS[hashStr(key) % PROCS.length];
    def = {
      key, kind: 'relic', a, b,
      name: `${P_PREFIX[p1]}${P_SUFFIX[p2]}`,
      desc: `The ${PASSIVES[p1].name} fuses with the ${PASSIVES[p2].name}. ${proc.name}: ${proc.desc}`,
      color: proc.color,
      mods: [],
      dmgMul: 1, cdMul: 1, areaMul: 1, projBonus: 0,
      proc: proc.id,
      statText: `${PASSIVES[p1].name} & ${PASSIVES[p2].name} effects ×1.5`,
    };
  }

  cache.set(key, def);
  return def;
}

export function allFusionKeys(): string[] {
  const keys: string[] = [];
  for (let i = 0; i < WEAPON_IDS.length; i++)
    for (let j = i + 1; j < WEAPON_IDS.length; j++) keys.push(pairKey(WEAPON_IDS[i], WEAPON_IDS[j]));
  for (const w of WEAPON_IDS) for (const p of PASSIVE_IDS) keys.push(pairKey(w, p));
  for (let i = 0; i < PASSIVE_IDS.length; i++)
    for (let j = i + 1; j < PASSIVE_IDS.length; j++) keys.push(pairKey(PASSIVE_IDS[i], PASSIVE_IDS[j]));
  return keys;
}

export function isFlagship(a: CompId, b: CompId): boolean {
  return !!FLAGSHIPS[pairKey(a, b)];
}
