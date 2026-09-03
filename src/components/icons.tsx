import type { ClassId, CompId, PassiveId, WeaponId } from '../game/types';
import { isWeapon } from '../game/types';
import { WEAPONS, PASSIVES, CLASSES } from '../game/data';

export interface IconProps {
  id?: string;
  size?: number;
  color?: string;
  className?: string;
}

function Wrap({ size = 24, color = '#f4e8cf', className = '', children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} fill="none" aria-hidden>
      <g stroke="#120a1c" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill={color}>
        {children}
      </g>
    </svg>
  );
}

function WeaponGlyph({ id, ...p }: IconProps & { id: WeaponId }) {
  const c = p.color ?? WEAPONS[id].color;
  switch (id) {
    case 'hellfire':
      return (
        <Wrap {...p} color={c}>
          <circle cx={16} cy={16} r={11} />
          <path d="M16 8c3 3-2 5 1 9s-1 6-1 6-6-2-4-7c1.4-3.4-1-4 4-8z" fill="#ffc258" />
        </Wrap>
      );
    case 'bonespear':
      return (
        <Wrap {...p} color={c}>
          <path d="M6 26L22 10" />
          <path d="M22 10l4-4-1 6-5-1z" fill="#fff" />
          <circle cx={9} cy={23} r={2.4} fill="#fff" />
        </Wrap>
      );
    case 'aura':
      return (
        <Wrap {...p} color={c}>
          <circle cx={16} cy={16} r={10} fill="none" stroke={c} strokeWidth={3.4} />
          <circle cx={16} cy={16} r={3.4} fill="#fff" />
        </Wrap>
      );
    case 'lightning':
      return (
        <Wrap {...p} color={c}>
          <path d="M18 4L8 18h6l-2 10 12-15h-7l1-9z" />
        </Wrap>
      );
    case 'blades':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 4l3 8-3 3-3-3 3-8z" />
          <path d="M26 20l-8 1-2 4 6 3 4-8z" />
          <path d="M6 20l8 1 2 4-6 3-4-8z" fill="#fff" />
          <circle cx={16} cy={16} r={2} fill="#120a1c" />
        </Wrap>
      );
    case 'caltrops':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 5l2.5 8.5L27 16l-8.5 2.5L16 27l-2.5-8.5L5 16l8.5-2.5L16 5z" />
        </Wrap>
      );
    case 'whirlwind':
      return (
        <Wrap {...p} color={c}>
          <path d="M6 12c6-6 14-4 18 0" fill="none" stroke={c} strokeWidth={3.4} />
          <path d="M5 17c7-4 15-3 20 1" fill="none" stroke="#fff" strokeWidth={2.6} />
          <path d="M7 22c5-3 12-3 16 0" fill="none" stroke={c} strokeWidth={3} />
        </Wrap>
      );
    case 'scythe':
      return (
        <Wrap {...p} color={c}>
          <path d="M8 26L22 12" />
          <path d="M10 8c8-4 14 0 15 7-4-4-9-5-13-2l-2-5z" />
        </Wrap>
      );
    case 'throwaxe':
      return (
        <Wrap {...p} color={c}>
          <path d="M10 24L20 14" />
          <path d="M14 6c5-3 11-1 13 4-4-1-7 0-9 3l-6-2 2-5z" />
          <path d="M22 22l4 4" stroke="#fff" strokeWidth={2} />
        </Wrap>
      );
    case 'corpses':
      return (
        <Wrap {...p} color={c}>
          <ellipse cx={16} cy={20} rx={11} ry={6} />
          <path d="M16 4v6M13 7h6" stroke="#fff" strokeWidth={2.4} />
          <circle cx={11} cy={17} r={1.6} fill="#120a1c" />
          <circle cx={21} cy={17} r={1.6} fill="#120a1c" />
        </Wrap>
      );
    case 'frostnova':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 3v26M5 9.5l22 13M27 9.5l-22 13" stroke={c} strokeWidth={2.6} fill="none" />
          <path d="M16 10l2 4-2 4-2-4 2-4z" fill="#fff" />
          <circle cx={16} cy={16} r={3} fill="#fff" />
        </Wrap>
      );
    case 'hammer':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 14v14" />
          <rect x={8} y={5} width={16} height={10} rx={2.5} />
          <path d="M16 7.5v5" stroke="#fff" strokeWidth={2} />
        </Wrap>
      );
  }
}

function PassiveGlyph({ id, ...p }: IconProps & { id: PassiveId }) {
  const c = p.color ?? PASSIVES[id].color;
  switch (id) {
    case 'vitality':
      return (
        <Wrap {...p} color={c}>
          <circle cx={16} cy={14} r={9} fill="#f4e8cf" />
          <circle cx={12.5} cy={12} r={2.6} fill="#120a1c" />
          <circle cx={19.5} cy={12} r={2.6} fill="#120a1c" />
          <path d="M12 18h8l-1.5 3h-5L12 18z" fill="#120a1c" />
          <path d="M13 23l3 5 3-5" fill="#e6404f" />
        </Wrap>
      );
    case 'boots':
      return (
        <Wrap {...p} color={c}>
          <path d="M10 5h7v10l6 5v5H10l-2-4V9l2-4z" />
          <path d="M8 25h17" stroke="#fff" strokeWidth={2.4} />
        </Wrap>
      );
    case 'greed':
      return (
        <Wrap {...p} color={c}>
          <circle cx={16} cy={16} r={11} />
          <circle cx={16} cy={16} r={7} fill="#120a1c" strokeWidth={0} />
          <path d="M16 11v10M13 13.5c0-1.4 1.3-2.2 3-2.2s3 .8 3 2.2c0 3-6 2-6 5 0 1.4 1.3 2.2 3 2.2s3-.8 3-2.2" stroke={c} strokeWidth={2} fill="none" />
        </Wrap>
      );
    case 'might':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 4l3 6 7 1-5 5 1.2 7L16 19.6 9.8 23 11 16 6 11l7-1 3-6z" />
        </Wrap>
      );
    case 'tome':
      return (
        <Wrap {...p} color={c}>
          <rect x={6} y={5} width={20} height={22} rx={2} />
          <path d="M16 5v22" stroke="#120a1c" />
          <path d="M16 13l1.5 3h3l-2.4 2 1 3.2-3.1-2-3.1 2 1-3.2-2.4-2h3L16 13z" fill="#ffc258" strokeWidth={1.4} />
        </Wrap>
      );
    case 'hourglass':
      return (
        <Wrap {...p} color={c}>
          <path d="M8 4h16v4l-5.5 8L24 24v4H8v-4l5.5-8L8 8V4z" />
          <path d="M12 24h8l-4-6-4 6z" fill="#fff" />
        </Wrap>
      );
    case 'whetstone':
      return (
        <Wrap {...p} color={c}>
          <path d="M6 22L20 8l6 2-4 4 2 6-14 4-4-2z" />
          <path d="M10 20l8-8" stroke="#120a1c" />
        </Wrap>
      );
    case 'armor':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 4l10 4v8c0 6-4.5 10-10 12C10.5 26 6 22 6 16V8l10-4z" />
          <path d="M16 9v16" stroke="#120a1c" />
        </Wrap>
      );
    case 'phoenix':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 4c2 5 8 6 8 13a8 8 0 01-16 0c0-4 2-6 3-9 1 2 2 3 2 5 2-2 3-5 3-9z" />
          <circle cx={16} cy={17} r={3} fill="#fff" />
        </Wrap>
      );
    case 'wrath':
      return (
        <Wrap {...p} color={c}>
          <path d="M6 20c2-8 6-12 10-14 4 2 8 6 10 14-3-2-5-2-7-1 1 3 0 6-3 8-3-2-4-5-3-8-2-1-4-1-7 1z" />
          <circle cx={13} cy={16} r={1.8} fill="#120a1c" />
          <circle cx={19} cy={16} r={1.8} fill="#120a1c" />
        </Wrap>
      );
    case 'harvest':
      return (
        <Wrap {...p} color={c}>
          <circle cx={16} cy={11} r={6} fill="#f4e8cf" />
          <circle cx={14} cy={10} r={1.5} fill="#120a1c" />
          <circle cx={18} cy={10} r={1.5} fill="#120a1c" />
          <path d="M12 28V16h8v12" fill="none" />
          <path d="M16 17v8" stroke="#fff" strokeWidth={1.8} />
        </Wrap>
      );
    case 'archon':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 4l2.2 6.8L25 13l-6.8 2.2L16 22l-2.2-6.8L7 13l6.8-2.2L16 4z" />
          <path d="M16 22v6M11 26h10" stroke={c} strokeWidth={2.4} fill="none" />
        </Wrap>
      );
    case 'conviction':
      return (
        <Wrap {...p} color={c}>
          <path d="M16 4l9 3.5v7c0 5.5-4 9.5-9 11.5-5-2-9-6-9-11.5v-7L16 4z" />
          <path d="M16 9v12M11.5 13.5h9" stroke="#fff" strokeWidth={2.6} fill="none" />
        </Wrap>
      );
  }
}

export function CompIcon({ id, ...p }: IconProps & { id: CompId }) {
  return isWeapon(id) ? <WeaponGlyph id={id} {...p} /> : <PassiveGlyph id={id} {...p} />;
}

export function ClassIcon({ id, ...p }: IconProps & { id: ClassId }) {
  const c = p.color ?? CLASSES[id].color;
  if (id === 'barbarian')
    return (
      <Wrap {...p} color={c}>
        <path d="M16 4c6 0 10 5 10 11v9l-4-3-2 4-4-3-4 3-2-4-4 3v-9C6 9 10 4 16 4z" />
        <circle cx={12} cy={15} r={2} fill="#120a1c" />
        <circle cx={20} cy={15} r={2} fill="#120a1c" />
        <path d="M12 21h8" stroke="#120a1c" />
      </Wrap>
    );
  if (id === 'necromancer')
    return (
      <Wrap {...p} color={c}>
        <path d="M16 3l9 10-3 16H10L7 13 16 3z" />
        <circle cx={16} cy={14} r={4.5} fill="#f4e8cf" />
        <circle cx={14.5} cy={13.5} r={1.2} fill="#120a1c" />
        <circle cx={17.5} cy={13.5} r={1.2} fill="#120a1c" />
        <path d="M14.8 16.5h2.4" stroke="#120a1c" />
      </Wrap>
    );
  if (id === 'paladin')
    return (
      <Wrap {...p} color={c}>
        <path d="M8 12a8 8 0 0116 0v10l-3-2-2 4-3-2.5L13 24l-2-4-3 2V12z" fill="#aebfd2" />
        <rect x={7} y={13} width={18} height={3.4} fill={c} />
        <path d="M16 5c1.5 2 1.5 4 0 6-1.5-2-1.5-4 0-6z" fill={c} />
        <circle cx={12.5} cy={19.5} r={1.4} fill="#120a1c" />
        <circle cx={19.5} cy={19.5} r={1.4} fill="#120a1c" />
      </Wrap>
    );
  return (
    <Wrap {...p} color={c}>
      <path d="M16 3l2.4 7.6L26 13l-7.6 2.4L16 23l-2.4-7.6L6 13l7.6-2.4L16 3z" />
      <circle cx={16} cy={24} r={4} />
      <path d="M16 19v-3" stroke="#120a1c" />
    </Wrap>
  );
}

export function FusionSigil({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className={className} aria-hidden>
      <g stroke="#120a1c" strokeWidth={2} strokeLinejoin="round">
        <circle cx={11} cy={16} r={8} fill="#ff8a3d" />
        <circle cx={21} cy={16} r={8} fill="#c07bff" fillOpacity={0.92} />
        <path d="M16 10.5a8 8 0 010 11 8 8 0 010-11z" fill="#ffc258" />
      </g>
    </svg>
  );
}

export function UiIcon({ name, size = 18, className = '' }: { name: 'pause' | 'play' | 'sound' | 'mute' | 'skull' | 'clock' | 'coin' | 'heart' | 'chest' | 'keys' | 'flame'; size?: number; className?: string }) {
  const stroke = 'currentColor';
  const common = { stroke, strokeWidth: 2.4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden {...common}>
      {name === 'pause' && <><rect x={6} y={4} width={4} height={16} fill="currentColor" stroke="none" /><rect x={14} y={4} width={4} height={16} fill="currentColor" stroke="none" /></>}
      {name === 'play' && <path d="M7 4l13 8-13 8V4z" fill="currentColor" stroke="none" />}
      {name === 'sound' && <><path d="M4 9v6h4l6 5V4L8 9H4z" fill="currentColor" stroke="none" /><path d="M17 8a6 6 0 010 8M19.5 5.5a10 10 0 010 13" /></>}
      {name === 'mute' && <><path d="M4 9v6h4l6 5V4L8 9H4z" fill="currentColor" stroke="none" /><path d="M17 9l5 6M22 9l-5 6" /></>}
      {name === 'skull' && <><circle cx={12} cy={10} r={7} /><circle cx={9.2} cy={9.5} r={1.8} fill="currentColor" stroke="none" /><circle cx={14.8} cy={9.5} r={1.8} fill="currentColor" stroke="none" /><path d="M9.5 17l.8 4h5.4l.8-4M10.5 14h3" /></>}
      {name === 'clock' && <><circle cx={12} cy={12} r={8} /><path d="M12 7v5l3.5 2" /></>}
      {name === 'coin' && <><circle cx={12} cy={12} r={8} /><circle cx={12} cy={12} r={4.5} /><path d="M12 9.5v5" /></>}
      {name === 'heart' && <path d="M12 20s-7-4.6-9-9c-1.3-3 1-7 4.5-7C9.8 4 11.5 6 12 7c.5-1 2.2-3 4.5-3C20 4 22.3 8 21 11c-2 4.4-9 9-9 9z" fill="currentColor" stroke="none" />}
      {name === 'chest' && <><rect x={3} y={7} width={18} height={13} rx={2} /><path d="M3 12h18M12 10v4" /><path d="M5 7c0-2 3-4 7-4s7 2 7 4" /></>}
      {name === 'keys' && <><rect x={3} y={6} width={7} height={7} rx={1.5} /><rect x={14} y={6} width={7} height={7} rx={1.5} /><rect x={8.5} y={13} width={7} height={7} rx={1.5} /></>}
      {name === 'flame' && <path d="M12 2c2 4-3 6 0 10s6 3 5 8a8 8 0 01-14-3c0-3 2-5 3-8 1 2 2 3 2 4 1-3 0-7 4-11z" fill="currentColor" stroke="none" />}
    </svg>
  );
}
