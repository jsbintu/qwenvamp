import { useEffect, useState } from 'react';
import type { BossSnap, ChestReward, Choice, ClassId, EndStats, Snapshot } from '../game/types';
import { CLASSES, PASSIVES, WEAPONS, fmtTime } from '../game/data';
import { resolveFusion } from '../game/fusions';
import { CompIcon, ClassIcon, FusionSigil, UiIcon } from './icons';
import { sfx } from '../game/audio';

/* ------------------------------ shared bits ------------------------------- */

export function EmberField({ n = 26 }: { n?: number }) {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full animate-ember"
          style={{
            left: `${(i * 137) % 100}%`,
            bottom: '-3vh',
            width: 2 + (i % 4),
            height: 2 + (i % 4),
            background: i % 3 === 0 ? '#c07bff' : i % 3 === 1 ? '#ffc258' : '#ff8a3d',
            boxShadow: `0 0 ${6 + (i % 5) * 2}px currentColor`,
            animationDelay: `${(i * 0.53) % 7}s`,
            animationDuration: `${6 + (i % 5)}s`,
            opacity: 0,
          }}
        />
      ))}
    </div>
  );
}

function GothicButton({ children, onClick, primary = false, className = '' }: {
  children: React.ReactNode;
  onClick: () => void;
  primary?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={() => { sfx.click(); onClick(); }}
      className={`pixel-corners font-display tracking-widest text-lg px-7 py-2.5 border-2 transition-all duration-150 cursor-pointer
        hover:-translate-y-0.5 active:translate-y-0.5 active:scale-95 ${
        primary
          ? 'bg-gradient-to-b from-[#ffc258] to-[#d8842e] border-[#7a4a12] text-[#2a1204] hover:shadow-[0_0_26px_rgba(255,194,88,0.55)]'
          : 'bg-panel border-line text-parch hover:text-ember hover:border-ember'
      } ${className}`}
    >
      {children}
    </button>
  );
}

/* --------------------------------- start ---------------------------------- */

export function StartScreen({ onStart }: { onStart: (cls: ClassId) => void }) {
  const [sel, setSel] = useState<ClassId>('barbarian');
  return (
    <div className="absolute inset-0 z-30 bg-ink overflow-hidden no-select">
      {/* layered backdrop */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(1200px 700px at 50% 118%, #4d1220 0%, #2a1038 45%, #120a1c 100%)' }} />
      <div className="absolute inset-0 opacity-40" style={{ background: 'radial-gradient(700px 400px at 18% 10%, rgba(192,123,255,0.14), transparent 70%), radial-gradient(700px 400px at 84% 18%, rgba(255,138,61,0.12), transparent 70%)' }} />
      <EmberField n={34} />

      <div className="relative h-full flex flex-col items-center justify-center gap-5 px-4 overflow-y-auto py-6">
        <div className="text-center animate-cardin">
          <div className="flex items-center justify-center gap-3 text-parch/70 font-black tracking-[0.5em] text-xs mb-1">
            <span className="h-px w-14 bg-line" /> SURVIVORS OF SANCTUARY <span className="h-px w-14 bg-line" />
          </div>
          <h1 className="font-display font-black text-[clamp(3.4rem,9vw,6.5rem)] leading-[0.9] text-bone text-outline animate-flicker">
            GLOOM<span className="text-blood">FALL</span>
          </h1>
          <p className="text-parch/80 font-bold text-sm mt-2 max-w-md mx-auto">
            The Prime Evils pour from the rift. Stand for ten minutes — or mount Diablo's skull on a spike.
          </p>
        </div>

        {/* class select */}
        <div className="grid grid-cols-3 gap-3 w-full max-w-3xl animate-cardin" style={{ animationDelay: '0.1s' }}>
          {Object.values(CLASSES).map((c) => (
            <button
              key={c.id}
              onClick={() => { sfx.click(); setSel(c.id); }}
              className={`gothic-frame pixel-corners bg-panel/90 p-4 text-left transition-all duration-150 cursor-pointer hover:-translate-y-1 group ${
                sel === c.id ? 'outline outline-2 outline-ember shadow-[0_0_30px_rgba(255,194,88,0.25)]' : 'opacity-80 hover:opacity-100'
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-12 h-12 pixel-corners border-2 flex items-center justify-center bg-ink shrink-0 ${sel === c.id ? 'border-ember' : 'border-line'} group-hover:animate-bob`}>
                  <ClassIcon id={c.id} size={30} />
                </div>
                <div>
                  <div className="font-display font-bold text-xl leading-none" style={{ color: c.color }}>{c.name}</div>
                  <div className="text-[10px] font-black tracking-wider text-parch/60 uppercase">{c.title}</div>
                </div>
              </div>
              <p className="text-[12px] text-parch/85 leading-snug min-h-[42px]">{c.desc}</p>
              <div className="mt-2 text-[11px] font-black text-ember">{c.bonus}</div>
              <div className="mt-1 flex items-center gap-1.5 text-[11px] text-parch/70 font-bold">
                Starts with <span style={{ color: WEAPONS[c.startWeapon].color }}>{WEAPONS[c.startWeapon].name}</span>
              </div>
            </button>
          ))}
        </div>

        <div className="flex flex-col items-center gap-3 animate-cardin" style={{ animationDelay: '0.2s' }}>
          <GothicButton primary onClick={() => onStart(sel)} className="text-2xl px-12 py-3">
            DESCEND INTO TRISTRAM
          </GothicButton>
          <div className="flex gap-4 text-[11px] font-bold text-parch/60">
            <span className="flex items-center gap-1.5"><UiIcon name="keys" size={13} /> WASD / arrows to move</span>
            <span className="flex items-center gap-1.5"><UiIcon name="flame" size={13} /> weapons fire on their own</span>
            <span className="flex items-center gap-1.5"><UiIcon name="chest" size={13} /> rank both parts to V → fuse</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- loading --------------------------------- */

const TIPS = [
  'Rank a weapon and a passive to V, then open any chest to fuse them.',
  'Grave Shieldbearers block frontal shots — arc around their shield.',
  'Every fusion is unique: 8 weapons × 9 relics × each other.',
  'Treasure Goblins flee. Catch one for a chest and a pile of gold.',
  'Gorvash charges at 2:30. Andariel at 5:00. Baal at 7:30. Diablo at 9:10.',
  'Slows stack on demons; Windrunner Boots Rank III makes you immune.',
  'The Phoenix Feather is one rank, one life, one glorious fireball.',
];

export function LoadingScreen({ progress }: { progress: number }) {
  const [tip, setTip] = useState(0);
  useEffect(() => {
    const iv = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 2600);
    return () => clearInterval(iv);
  }, []);
  const pct = Math.round(progress * 100);
  return (
    <div className="absolute inset-0 z-40 bg-ink flex flex-col items-center justify-center gap-6 no-select">
      <div className="absolute inset-0" style={{ background: 'radial-gradient(900px 500px at 50% 110%, #3d1230 0%, #120a1c 70%)' }} />
      <EmberField n={20} />
      <div className="relative flex flex-col items-center gap-5 px-6 w-full max-w-lg">
        <div className="flex items-center gap-3 animate-swing origin-top">
          <UiIcon name="flame" size={34} className="text-ember animate-glowpulse" />
          <span className="font-display font-black text-4xl text-bone text-outline">THE FORGE AWAKENS</span>
        </div>
        <div className="w-full">
          <div className="h-[18px] pixel-corners bg-[#120a1c] border-2 border-line overflow-hidden relative">
            <div
              className="h-full transition-[width] duration-200 relative overflow-hidden"
              style={{ width: `${pct}%`, background: 'linear-gradient(90deg,#7d3a12,#ff8a3d 55%,#ffc258)' }}
            >
              <div className="absolute inset-0 animate-shimmer" style={{ background: 'linear-gradient(90deg,transparent,rgba(255,255,255,0.4),transparent)', backgroundSize: '200% 100%' }} />
            </div>
          </div>
          <div className="flex justify-between mt-1.5 text-[11px] font-black text-parch/70 tracking-wider">
            <span>PAINTING SPRITE ATLASES…</span>
            <span className="text-ember">{pct}%</span>
          </div>
        </div>
        <div key={tip} className="animate-fadein text-center text-[13px] text-parch/85 font-bold min-h-[2.4em]">
          <span className="text-ember font-black">TIP · </span>
          {TIPS[tip]}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- level up -------------------------------- */

export function LevelUpScreen({ choices, onPick, pending }: {
  choices: Choice[];
  onPick: (c: Choice) => void;
  pending: number;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0 && choices[i]) onPick(choices[i]);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [choices, onPick]);

  return (
    <div className="absolute inset-0 z-30 bg-[#120a1c]/78 backdrop-blur-[2px] flex flex-col items-center justify-center gap-6 no-select animate-fadein px-4">
      <div className="text-center">
        <div className="font-display font-black text-5xl text-ember text-outline animate-popin">LEVEL UP</div>
        <div className="text-parch/70 font-black tracking-[0.3em] text-xs mt-1">CHOOSE YOUR DARK BOON{pending > 0 ? ` · ${pending + 1} MORE AFTER THIS` : ''}</div>
      </div>
      <div className="flex gap-4 flex-wrap justify-center">
        {choices.map((c, i) => {
          const isW = c.kind === 'weapon';
          const name = isW ? WEAPONS[c.id as keyof typeof WEAPONS].name : PASSIVES[c.id as keyof typeof PASSIVES].name;
          const color = isW ? WEAPONS[c.id as keyof typeof WEAPONS].color : PASSIVES[c.id as keyof typeof PASSIVES].color;
          return (
            <button
              key={`${c.id}${i}`}
              onClick={() => { sfx.click(); onPick(c); }}
              className="gothic-frame pixel-corners w-[240px] bg-panel/95 p-5 text-left cursor-pointer transition-all duration-150 hover:-translate-y-1.5 hover:shadow-[0_10px_40px_rgba(0,0,0,0.6)] group animate-cardin"
              style={{ animationDelay: `${i * 0.07}s` }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="w-14 h-14 pixel-corners border-2 border-line bg-ink flex items-center justify-center group-hover:border-ember group-hover:animate-bob transition-colors">
                  <CompIcon id={c.id} size={34} />
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-black tracking-widest text-parch/50">{isW ? 'ABILITY' : 'RELIC'}</div>
                  <div className="font-display font-bold text-2xl leading-none" style={{ color: c.isNew ? color : '#ffc258' }}>
                    {c.isNew ? 'NEW' : `RANK ${'I II III IV V'.split(' ')[c.level - 1]}`}
                  </div>
                </div>
              </div>
              <div className="font-display font-bold text-xl leading-tight" style={{ color }}>{name}</div>
              <div className="text-[12.5px] text-parch/90 leading-snug mt-1.5 min-h-[3.4em]">{c.rankText}</div>
              <div className="mt-3 flex items-center gap-2 text-[10px] font-black tracking-wider text-parch/45">
                <span className="pixel-corners border border-line px-1.5 py-0.5">{i + 1}</span> PRESS KEY OR CLICK
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* --------------------------------- chest ---------------------------------- */

export function ChestScreen({ rewards, onClaim }: { rewards: ChestReward[]; onClaim: () => void }) {
  return (
    <div className="absolute inset-0 z-30 bg-[#120a1c]/78 backdrop-blur-[2px] flex flex-col items-center justify-center gap-6 no-select animate-fadein px-4">
      <div className="font-display font-black text-5xl text-ember text-outline animate-popin flex items-center gap-4">
        <UiIcon name="chest" size={44} className="animate-chestshake text-ember" /> HORADRIC CACHE
      </div>
      <div className="flex gap-4 flex-wrap justify-center">
        {rewards.map((r, i) => {
          let icon: React.ReactNode = null;
          let title = '';
          let desc = '';
          let color = '#ffc258';
          if (r.kind === 'fusion' && r.id && r.pairWith) {
            const f = resolveFusion(r.id, r.pairWith);
            title = f.name;
            desc = f.desc;
            color = f.color;
            icon = <FusionSigil size={40} className="animate-glowpulse" />;
          } else if (r.kind === 'heal') {
            title = 'Healing Draught';
            desc = `Restores ${r.amount} life.`;
            color = '#e6404f';
            icon = <UiIcon name="heart" size={38} className="text-blood" />;
          } else if (r.kind === 'gold') {
            title = 'Gold';
            desc = `+${r.amount} gold for your troubles.`;
            icon = <UiIcon name="coin" size={38} className="text-ember" />;
          } else if (r.kind === 'weapon' && r.id) {
            title = `${WEAPONS[r.id as keyof typeof WEAPONS].name} — upranked`;
            desc = WEAPONS[r.id as keyof typeof WEAPONS].desc;
            color = WEAPONS[r.id as keyof typeof WEAPONS].color;
            icon = <CompIcon id={r.id} size={38} />;
          } else if (r.kind === 'passive' && r.id) {
            title = `${PASSIVES[r.id as keyof typeof PASSIVES].name} — upranked`;
            desc = PASSIVES[r.id as keyof typeof PASSIVES].desc;
            color = PASSIVES[r.id as keyof typeof PASSIVES].color;
            icon = <CompIcon id={r.id} size={38} />;
          }
          return (
            <div
              key={i}
              className="gothic-frame pixel-corners w-[250px] bg-panel/95 p-5 text-center animate-cardin"
              style={{ animationDelay: `${0.15 + i * 0.14}s` }}
            >
              <div className="flex justify-center mb-3">{icon}</div>
              <div className="font-display font-bold text-lg leading-tight" style={{ color }}>{title}</div>
              <div className="text-[12px] text-parch/85 leading-snug mt-1.5 min-h-[3em]">{desc}</div>
            </div>
          );
        })}
      </div>
      <GothicButton primary onClick={onClaim} className="text-xl">CLAIM THE SPOILS</GothicButton>
    </div>
  );
}

/* ------------------------------ fusion flash ------------------------------ */

export function FusionFlash({ name, desc, flagship }: { name: string; desc: string; flagship: boolean }) {
  return (
    <div className="absolute inset-0 z-40 pointer-events-none flex flex-col items-center justify-center no-select">
      <div className="absolute inset-0 animate-fusionflash" style={{ background: flagship ? 'radial-gradient(circle, rgba(255,246,221,0.95) 0%, rgba(255,194,88,0.5) 35%, transparent 70%)' : 'radial-gradient(circle, rgba(255,246,221,0.85) 0%, rgba(192,123,255,0.4) 40%, transparent 72%)' }} />
      <div className="animate-cardin text-center px-6">
        <div className={`font-black tracking-[0.4em] text-sm ${flagship ? 'text-blood' : 'text-arcane'}`}>
          {flagship ? '◆ FLAGSHIP EVOLUTION ◆' : '◆ DARK FUSION ◆'}
        </div>
        <div className="font-display font-black text-[clamp(2.6rem,7vw,4.6rem)] text-bone text-outline leading-none mt-1 animate-glowpulse">
          {name.toUpperCase()}
        </div>
        <div className="text-parch font-bold text-sm max-w-md mx-auto mt-2 text-outline">{desc}</div>
      </div>
    </div>
  );
}

/* --------------------------------- banner --------------------------------- */

export function BossBanner({ text, sub }: { text: string; sub?: string }) {
  return (
    <div className="absolute inset-x-0 top-[24%] z-20 pointer-events-none flex flex-col items-center no-select">
      <div className="animate-bannerin text-center">
        <div className="font-display font-black text-[clamp(2rem,6vw,3.6rem)] text-blood text-outline leading-none tracking-wide">{text}</div>
        {sub && <div className="font-display text-xl text-parch text-outline mt-1">{sub}</div>}
      </div>
    </div>
  );
}

/* --------------------------------- pause ---------------------------------- */

export function PauseScreen({ onResume, onQuit, muted, onMute }: {
  onResume: () => void;
  onQuit: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-30 bg-[#120a1c]/82 backdrop-blur-[3px] flex flex-col items-center justify-center gap-7 no-select animate-fadein px-4">
      <div className="font-display font-black text-6xl text-bone text-outline">SANCTUARY WAITS</div>
      <div className="flex gap-3 flex-wrap justify-center">
        <GothicButton primary onClick={onResume} className="text-xl">RESUME</GothicButton>
        <GothicButton onClick={onMute}>{muted ? 'UNMUTE' : 'MUTE'}</GothicButton>
        <GothicButton onClick={onQuit}>ABANDON RUN</GothicButton>
      </div>
      <div className="text-parch/60 text-sm font-bold">ESC to resume · M to mute</div>
    </div>
  );
}

/* ---------------------------------- end ----------------------------------- */

export function EndScreen({ stats, onRetry, onMenu }: { stats: EndStats; onRetry: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-30 overflow-hidden no-select">
      <div className="absolute inset-0" style={{ background: stats.victory ? 'radial-gradient(1000px 600px at 50% 115%, #4d3a12 0%, #241238 50%, #120a1c 100%)' : 'radial-gradient(1000px 600px at 50% 115%, #4d1220 0%, #241238 50%, #120a1c 100%)' }} />
      <EmberField n={30} />
      <div className="relative h-full flex flex-col items-center justify-center gap-5 px-4 overflow-y-auto py-6">
        <div className="text-center animate-cardin">
          <div className={`font-display font-black text-[clamp(2.8rem,8vw,5.2rem)] leading-none text-outline ${stats.victory ? 'text-ember' : 'text-blood'}`}>
            {stats.victory ? 'SANCTUARY ENDURES' : 'YOU HAVE FALLEN'}
          </div>
          <div className="text-parch/80 font-bold mt-2 text-sm">
            {stats.victory
              ? stats.bossKills >= 4
                ? 'All four Prime Evils lie broken. The angels owe you a drink.'
                : 'You outlasted the siege until dawn. The horde recedes… for now.'
              : 'The horde closes over your bones. Sanctuary remembers its heroes.'}
          </div>
        </div>

        <div className="gothic-frame pixel-corners bg-panel/92 p-5 w-full max-w-xl animate-cardin" style={{ animationDelay: '0.12s' }}>
          <div className="grid grid-cols-2 gap-x-8 gap-y-2.5">
            {stats.stats.map((s) => (
              <div key={s.label} className="flex items-baseline justify-between border-b border-line/40 pb-1">
                <span className="text-[12px] font-black tracking-wider text-parch/60 uppercase">{s.label}</span>
                <span className="font-display font-bold text-xl text-bone">{s.value}</span>
              </div>
            ))}
          </div>
          {stats.fusions.length > 0 && (
            <div className="mt-4">
              <div className="text-[11px] font-black tracking-widest text-ember mb-1.5">EVOLUTIONS FORGED</div>
              <div className="flex flex-wrap gap-1.5">
                {stats.fusions.map((f, i) => (
                  <span key={i} className="pixel-corners bg-ink border border-line px-2 py-0.5 text-[11px] font-bold text-parch flex items-center gap-1">
                    <FusionSigil size={12} /> {f}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-3 animate-cardin" style={{ animationDelay: '0.2s' }}>
          <GothicButton primary onClick={onRetry} className="text-xl">DESCEND AGAIN</GothicButton>
          <GothicButton onClick={onMenu}>RETURN TO CAMP</GothicButton>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- boss bar HUD ------------------------------ */

export function BossBar({ boss }: { boss: BossSnap }) {
  return (
    <div className="w-[min(620px,86vw)]">
      <div className="flex items-end justify-between mb-0.5 px-1">
        <span className="font-display text-blood text-lg leading-none tracking-wide text-outline">{boss.name}</span>
        <div className="flex gap-1 items-center">
          {Array.from({ length: boss.phases }).map((_, i) => (
            <div
              key={i}
              className="w-2.5 h-2.5 rotate-45 border border-ink"
              style={{ background: i < boss.phase ? '#e6404f' : '#3a2354' }}
            />
          ))}
        </div>
      </div>
      <div className="h-[13px] pixel-corners bg-[#120a1c] border-2 border-[#7d2733] overflow-hidden">
        <div className="h-full" style={{ width: `${boss.hpPct * 100}%`, background: 'linear-gradient(90deg,#7d1220,#e6404f 45%,#ff8a3d)' }} />
      </div>
    </div>
  );
}

/* keep snapshot type referenced for consumers */
export type { Snapshot };
export { fmtTime };
