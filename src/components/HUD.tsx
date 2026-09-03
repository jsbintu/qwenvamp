import type { Snapshot, SnapshotPassive, SnapshotWeapon } from '../game/types';
import { MAX_RANK, PASSIVES, WEAPONS, fmtTime } from '../game/data';
import { CompIcon, FusionSigil, UiIcon } from './icons';

function RankPips({ lvl, max = MAX_RANK, color = '#ffc258' }: { lvl: number; max?: number; color?: string }) {
  return (
    <div className="flex gap-[2px] justify-center">
      {Array.from({ length: max }).map((_, i) => (
        <div
          key={i}
          className="h-[5px] w-[7px] pixel-corners transition-all duration-200"
          style={{
            background: i < lvl ? color : 'rgba(18,10,28,0.85)',
            boxShadow: i < lvl ? `0 0 5px ${color}` : 'none',
          }}
        />
      ))}
    </div>
  );
}

function WeaponSlotView({ w }: { w: SnapshotWeapon }) {
  const def = WEAPONS[w.id];
  const cdPct = w.cdMax > 0 ? Math.min(1, w.cd / w.cdMax) : 0;
  const ready = cdPct <= 0.02;
  return (
    <div
      className={`relative w-[54px] h-[54px] pixel-corners border-2 p-1 flex flex-col items-center justify-center gap-[2px] transition-transform hover:scale-110 overflow-hidden ${
        w.fused ? 'border-ember animate-glowpulse bg-[#3a2318]' : 'border-line bg-panel/90'
      }`}
      title={w.fused ? `${w.fusedName} (EVOLVED)` : def.name}
    >
      {w.fused && (
        <div className="absolute -top-2 -right-2 z-20">
          <FusionSigil size={18} />
        </div>
      )}
      <CompIcon id={w.id} size={26} />
      <RankPips lvl={w.lvl} color={w.fused ? '#ff8a3d' : def.color} />
      {w.fused && <div className="text-[7px] font-black text-ember leading-none tracking-wider">FUSED</div>}
      {/* radial cooldown swipe */}
      {!ready && (
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background: `conic-gradient(rgba(8,4,16,0.78) ${cdPct * 360}deg, rgba(8,4,16,0) 0deg)`,
          }}
        />
      )}
      {ready && (
        <div className="absolute inset-0 z-0 pixel-corners" style={{ boxShadow: `inset 0 0 8px ${def.color}55` }} />
      )}
    </div>
  );
}

function PassiveSlotView({ p }: { p: SnapshotPassive }) {
  const def = PASSIVES[p.id];
  const max = def.ranks.length;
  return (
    <div
      className={`relative w-[46px] pixel-corners border-2 p-1 flex flex-col items-center gap-[2px] transition-transform hover:scale-110 ${
        p.fused ? 'border-ember animate-glowpulse bg-[#33203a]' : 'border-line bg-panel/90'
      }`}
      title={p.fused ? `${p.fusedName} (FUSED RELIC)` : def.name}
    >
      {p.fused && (
        <div className="absolute -top-2 -right-2 z-10">
          <FusionSigil size={16} />
        </div>
      )}
      <CompIcon id={p.id} size={22} />
      <RankPips lvl={p.lvl} max={max} color={def.color} />
    </div>
  );
}

export default function HUD({ snap, muted, onPause, onMute }: {
  snap: Snapshot;
  muted: boolean;
  onPause: () => void;
  onMute: () => void;
}) {
  const hpPct = Math.max(0, snap.hp / snap.maxHp);
  const xpPct = Math.min(1, snap.xp / snap.xpNeed);
  const lowHp = hpPct < 0.3;

  return (
    <div className="absolute inset-0 pointer-events-none no-select font-body">
      {/* top bar */}
      <div className="absolute top-0 left-0 right-0 flex flex-col items-center pt-2 gap-1">
        {/* xp bar */}
        <div className="relative w-[min(760px,90vw)] h-[16px] pixel-corners bg-[#120a1c] border-2 border-line overflow-hidden">
          <div
            className="absolute inset-y-0 left-0 transition-[width] duration-300"
            style={{ width: `${xpPct * 100}%`, background: 'linear-gradient(180deg,#d8a0ff 0%,#8a3dd8 60%,#5c2496 100%)' }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-bone text-outline tracking-widest">
            LEVEL {snap.level}
          </div>
        </div>

        <div className="w-[min(760px,90vw)] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="pixel-corners bg-panel/95 border-2 border-line px-3 py-1 flex items-center gap-2 text-ember font-black text-lg leading-none">
              <UiIcon name="clock" size={15} />
              {fmtTime(snap.time)}
              <span className="text-parch/50 text-[11px] font-bold">/ {fmtTime(snap.duration)}</span>
            </span>
            <span className="pixel-corners bg-panel/95 border-2 border-line px-2.5 py-1 flex items-center gap-1.5 text-blood font-black text-sm leading-none">
              <UiIcon name="skull" size={14} />
              {snap.kills}
            </span>
            <span className="pixel-corners bg-panel/95 border-2 border-line px-2.5 py-1 flex items-center gap-1.5 text-ember font-black text-sm leading-none">
              <UiIcon name="coin" size={14} />
              {snap.gold}
            </span>
          </div>
          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              onClick={onMute}
              className="pixel-corners bg-panel/95 border-2 border-line w-9 h-9 flex items-center justify-center text-parch hover:text-ember hover:border-ember transition-colors cursor-pointer"
              title="Mute (M)"
            >
              <UiIcon name={muted ? 'mute' : 'sound'} size={16} />
            </button>
            <button
              onClick={onPause}
              className="pixel-corners bg-panel/95 border-2 border-line w-9 h-9 flex items-center justify-center text-parch hover:text-ember hover:border-ember transition-colors cursor-pointer"
              title="Pause (Esc)"
            >
              <UiIcon name="pause" size={16} />
            </button>
          </div>
        </div>

        {/* boss bar */}
        {snap.boss && (
          <div className="w-[min(620px,86vw)] mt-1 animate-fadein">
            <div className="flex items-end justify-between mb-0.5 px-1">
              <span className="font-display text-blood text-lg leading-none tracking-wide text-outline">{snap.boss.name}</span>
              <div className="flex gap-1 items-center">
                {Array.from({ length: snap.boss.phases }).map((_, i) => (
                  <div
                    key={i}
                    className="w-2.5 h-2.5 rotate-45 border border-ink"
                    style={{ background: i < snap.boss!.phase ? '#e6404f' : '#3a2354', boxShadow: i < snap.boss!.phase ? '0 0 6px #e6404f' : 'none' }}
                  />
                ))}
              </div>
            </div>
            <div className="h-[13px] pixel-corners bg-[#120a1c] border-2 border-[#7d2733] overflow-hidden">
              <div
                className="h-full transition-[width] duration-200"
                style={{
                  width: `${snap.boss.hpPct * 100}%`,
                  background: 'linear-gradient(90deg,#7d1220,#e6404f 45%,#ff8a3d)',
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* health globe */}
      <div className="absolute bottom-4 left-5">
        <div className="relative w-[104px] h-[104px]">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-[0_6px_16px_rgba(0,0,0,0.7)]">
            <defs>
              <clipPath id="globeclip">
                <circle cx={50} cy={50} r={38} />
              </clipPath>
              <radialGradient id="globeshine" cx="35%" cy="30%">
                <stop offset="0%" stopColor="rgba(255,255,255,0.35)" />
                <stop offset="45%" stopColor="rgba(255,255,255,0.05)" />
                <stop offset="100%" stopColor="rgba(0,0,0,0.4)" />
              </radialGradient>
            </defs>
            <circle cx={50} cy={50} r={46} fill="#231234" stroke="#4d2f6b" strokeWidth={3} />
            <circle cx={50} cy={50} r={38} fill="#160b22" />
            <g clipPath="url(#globeclip)">
              <rect
                x={0}
                y={100 - hpPct * 76 - 12}
                width={100}
                height={100}
                fill={lowHp ? '#ff3d3d' : '#c02438'}
                className={lowHp ? 'hp-low' : ''}
              />
              <rect x={0} y={100 - hpPct * 76 - 16} width={100} height={5} fill="#ff6b7d" opacity={0.8} />
            </g>
            <circle cx={50} cy={50} r={38} fill="url(#globeshine)" />
            <circle cx={50} cy={50} r={38} fill="none" stroke="#8d7ba8" strokeWidth={2.5} />
            <circle cx={50} cy={50} r={43} fill="none" stroke="#120a1c" strokeWidth={2} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-display font-bold text-[22px] text-bone text-outline leading-none">{snap.hp}</span>
            <span className="text-[9px] font-black text-parch/80 text-outline leading-none mt-0.5">/ {snap.maxHp}</span>
          </div>
        </div>
      </div>

      {/* weapon & passive racks */}
      <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2">
        <div className="flex gap-1.5">
          {snap.weapons.map((w, i) => (
            <WeaponSlotView key={`${w.id}${i}`} w={w} />
          ))}
          {Array.from({ length: Math.max(0, 5 - snap.weapons.length) }).map((_, i) => (
            <div key={`ew${i}`} className="w-[54px] h-[54px] pixel-corners border-2 border-dashed border-line/50 bg-ink/40" />
          ))}
        </div>
        <div className="flex gap-1.5">
          {snap.passives.map((p, i) => (
            <PassiveSlotView key={`${p.id}${i}`} p={p} />
          ))}
          {Array.from({ length: Math.max(0, 5 - snap.passives.length) }).map((_, i) => (
            <div key={`ep${i}`} className="w-[46px] h-[42px] pixel-corners border-2 border-dashed border-line/50 bg-ink/40" />
          ))}
        </div>
      </div>

      {/* control hint */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-parch/60 text-[11px] font-bold">
        <UiIcon name="keys" size={14} />
        <span>WASD move · ESC pause · chests evolve maxed gear</span>
      </div>
    </div>
  );
}
