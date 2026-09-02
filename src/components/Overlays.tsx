import { useMemo, useState } from 'react';
import type { ChestReward, Choice, ClassId, EndStats } from '../game/types';
import { isWeapon } from '../game/types';
import { BOSSES, CLASSES, MAX_RANK, PASSIVES, WEAPONS, fmtTime } from '../game/data';
import { resolveFusion, procInfo } from '../game/fusions';
import { ClassIcon, CompIcon, FusionSigil, UiIcon } from './icons';
import { sfx } from '../game/audio';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

function Embers({ n = 22 }: { n?: number }) {
  const embers = useMemo(
    () =>
      Array.from({ length: n }).map((_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 7,
        dur: 5 + Math.random() * 5,
        size: 2 + Math.random() * 4,
        color: ['#ff8a3d', '#ffc258', '#c07bff', '#e6404f'][i % 4],
      })),
    [n],
  );
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      {embers.map((e, i) => (
        <div
          key={i}
          className="absolute bottom-[-10px] rounded-full animate-ember"
          style={{
            left: `${e.left}%`,
            width: e.size,
            height: e.size,
            background: e.color,
            boxShadow: `0 0 ${e.size * 2.5}px ${e.color}`,
            animationDelay: `${e.delay}s`,
            animationDuration: `${e.dur}s`,
          }}
        />
      ))}
    </div>
  );
}

function GothicButton({ children, onClick, color = '#ff8a3d', big = false }: {
  children: React.ReactNode;
  onClick: () => void;
  color?: string;
  big?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`pixel-corners relative font-display font-bold tracking-wider text-ink transition-transform duration-100 hover:scale-[1.04] active:scale-95 cursor-pointer ${
        big ? 'px-10 py-3 text-2xl' : 'px-6 py-2 text-lg'
      }`}
      style={{
        background: `linear-gradient(180deg, ${color} 0%, ${color} 55%, rgba(0,0,0,0.25) 130%), ${color}`,
        boxShadow: `0 0 0 2px #120a1c, 0 0 0 4px ${color}66, 0 8px 24px rgba(0,0,0,0.5), 0 0 26px ${color}44`,
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------- start screen ------------------------------ */

export function StartScreen({ onStart }: { onStart: (c: ClassId) => void }) {
  const [sel, setSel] = useState<ClassId>('barbarian');
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_35%,#2f1b46_0%,#1a0f28_55%,#0d0716_100%)] no-select overflow-hidden">
      <Embers />
      <div className="relative z-10 flex flex-col items-center gap-6 px-4 w-full max-w-5xl animate-fadein">
        <div className="text-center">
          <div className="font-display text-parch/70 tracking-[0.5em] text-sm mb-1">SURVIVORS OF SANCTUARY</div>
          <h1
            className="font-display font-black text-[clamp(56px,11vw,110px)] leading-[0.9] text-outline"
            style={{ color: '#ff8a3d', textShadow: '0 0 40px rgba(255,138,61,0.5), 0 4px 0 #120a1c, 0 8px 24px rgba(0,0,0,0.9)' }}
          >
            GLOOMFALL
          </h1>
          <p className="font-body text-parch font-bold mt-2 max-w-xl mx-auto">
            The gates of the Burning Hells have burst. Survive <span className="text-ember">10 minutes</span>, forge{' '}
            <span className="text-arcane">evolutions</span>, and slay the <span className="text-blood">Prime Evils</span>.
          </p>
        </div>

        {/* class select */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full">
          {(Object.keys(CLASSES) as ClassId[]).map((id) => {
            const c = CLASSES[id];
            const active = sel === id;
            return (
              <button
                key={id}
                onClick={() => {
                  setSel(id);
                  sfx.click();
                }}
                className={`pixel-corners gothic-frame text-left p-4 transition-all duration-150 cursor-pointer bg-panel/90 hover:bg-panel2 ${
                  active ? 'scale-[1.03] -translate-y-1' : 'opacity-75 hover:opacity-100'
                }`}
                style={active ? { borderColor: c.color, boxShadow: `0 0 0 2px #120a1c, 0 0 0 4px ${c.color}88, 0 0 30px ${c.color}44` } : undefined}
              >
                <div className="flex items-center gap-3">
                  <div className={active ? 'animate-bob' : ''}>
                    <ClassIcon id={id} size={44} />
                  </div>
                  <div>
                    <div className="font-display font-bold text-xl leading-none" style={{ color: c.color }}>
                      {c.name}
                    </div>
                    <div className="text-[11px] font-black tracking-widest text-parch/70 uppercase">{c.title}</div>
                  </div>
                </div>
                <p className="text-[12px] text-parch/85 font-semibold mt-2 leading-snug">{c.desc}</p>
                <div className="mt-2 text-[11px] font-black text-ember tracking-wide">{c.bonus}</div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] font-bold text-parch/70">
                  <CompIcon id={c.startWeapon} size={15} /> starts with {WEAPONS[c.startWeapon].name}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-4">
          <GothicButton big onClick={() => onStart(sel)}>
            DESCEND INTO THE GLOOM
          </GothicButton>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 w-full text-[12px] font-bold text-parch/80">
          <div className="pixel-corners bg-panel/70 border-2 border-line p-3 flex items-start gap-2.5">
            <FusionSigil size={26} className="shrink-0 mt-0.5" />
            <span>
              <span className="text-ember font-black">EVOLUTIONS —</span> rank any two abilities or relics to V, then open a
              chest to fuse them into one of <span className="text-arcane">120 unique powers</span>.
            </span>
          </div>
          <div className="pixel-corners bg-panel/70 border-2 border-line p-3 flex items-start gap-2.5">
            <UiIcon name="skull" size={24} className="shrink-0 text-blood mt-0.5" />
            <span>
              <span className="text-blood font-black">PRIME EVILS —</span>
              {BOSSES.map((b, i) => (
                <span key={b.skin}>
                  {i > 0 && ' · '}
                  {b.name} {fmtTime(b.at)}
                </span>
              ))}
              . Slay Diablo — or outlast the night.
            </span>
          </div>
          <div className="pixel-corners bg-panel/70 border-2 border-line p-3 flex items-start gap-2.5">
            <UiIcon name="keys" size={24} className="shrink-0 text-frost mt-0.5" />
            <span>
              <span className="text-frost font-black">CONTROLS —</span> WASD / arrows to move. Weapons fire on their own.
              1·2·3 pick upgrades. ESC pauses. M mutes.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- level up ---------------------------------- */

export function LevelUpModal({ choices, onPick, level }: { choices: Choice[]; onPick: (c: Choice) => void; level: number }) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink/70 backdrop-blur-[2px] no-select animate-fadein">
      <div className="font-display text-ember text-3xl font-bold tracking-[0.25em] text-outline animate-cardin">
        LEVEL {level}
      </div>
      <div className="font-display text-bone text-xl mb-5 text-outline tracking-widest">CHOOSE YOUR DARK BOON</div>
      <div className="flex flex-col sm:flex-row gap-4 px-4">
        {choices.map((c, i) => {
          const def = isWeapon(c.id) ? WEAPONS[c.id] : PASSIVES[c.id];
          const curLvl = c.isNew ? 0 : c.level - 1;
          const maxLvl = isWeapon(c.id) ? MAX_RANK : PASSIVES[c.id].ranks.length;
          return (
            <button
              key={`${c.id}${i}`}
              onClick={() => onPick(c)}
              className="pixel-corners gothic-frame w-[250px] bg-panel/95 p-4 text-left transition-all duration-150 hover:-translate-y-2 hover:bg-panel2 cursor-pointer animate-cardin group"
              style={{ animationDelay: `${i * 0.07}s`, borderColor: def.color + '99' }}
            >
              <div className="flex items-center justify-between">
                <span
                  className="text-[10px] font-black tracking-[0.2em] pixel-corners px-2 py-0.5"
                  style={{ background: c.isNew ? def.color : '#3a2354', color: c.isNew ? '#120a1c' : '#d8c69a' }}
                >
                  {c.isNew ? 'NEW' : `RANK ${ROMAN[curLvl - 1] ?? 'I'} → ${ROMAN[c.level - 1]}`}
                </span>
                <span className="text-[10px] font-black text-parch/60 tracking-widest">[{i + 1}]</span>
              </div>
              <div className="flex items-center gap-3 mt-3">
                <div className="transition-transform group-hover:scale-110 group-hover:rotate-3">
                  <CompIcon id={c.id} size={42} />
                </div>
                <div>
                  <div className="font-display font-bold text-lg leading-tight" style={{ color: def.color }}>
                    {def.name}
                  </div>
                  <div className="text-[10px] font-black tracking-widest text-parch/60 uppercase">
                    {isWeapon(c.id) ? 'Ability' : 'Relic'}
                  </div>
                </div>
              </div>
              <p className="mt-2.5 text-[13px] font-bold text-bone leading-snug min-h-[38px]">{c.rankText}</p>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: maxLvl }).map((_, k) => (
                  <div
                    key={k}
                    className="h-1.5 flex-1 pixel-corners"
                    style={{
                      background: k < c.level ? def.color : 'rgba(18,10,28,0.9)',
                      boxShadow: k < c.level ? `0 0 6px ${def.color}` : 'none',
                    }}
                  />
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- chest ------------------------------------ */

export function ChestModal({ rewards, onClaim }: { rewards: ChestReward[]; onClaim: () => void }) {
  const [opened, setOpened] = useState(false);
  const fusion = rewards.find((r) => r.kind === 'fusion');
  const fuseDef = fusion && fusion.id && fusion.pairWith ? resolveFusion(fusion.id, fusion.pairWith) : null;

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink/70 backdrop-blur-[2px] no-select animate-fadein">
      {!opened ? (
        <>
          <div className="animate-chestshake mb-6">
            <svg width={130} height={110} viewBox="0 0 130 110" className="drop-shadow-[0_10px_30px_rgba(255,194,88,0.35)]">
              <g stroke="#120a1c" strokeWidth={4} strokeLinejoin="round">
                <rect x={15} y={38} width={100} height={60} fill="#8a5a2b" />
                <path d="M15 38c0-16 22-26 50-26s50 10 50 26v6H15v-6z" fill="#b07a3d" />
                <rect x={55} y={48} width={20} height={26} fill="#ffc258" />
                <circle cx={65} cy={58} r={4} fill="#120a1c" />
                <rect x={28} y={38} width={8} height={60} fill="#6b4420" />
                <rect x={94} y={38} width={8} height={60} fill="#6b4420" />
              </g>
            </svg>
          </div>
          <div className="font-display text-ember text-3xl font-bold text-outline tracking-widest animate-popin">
            TREASURE OF THE DAMNED
          </div>
          {fuseDef && (
            <div className="mt-1 font-display text-arcane text-lg text-outline animate-popin" style={{ animationDelay: '0.15s' }}>
              something inside is <span className="text-ember">FUSING</span>...
            </div>
          )}
          <div className="mt-7">
            <GothicButton
              big
              onClick={() => {
                setOpened(true);
                sfx.chest();
              }}
            >
              PRY IT OPEN
            </GothicButton>
          </div>
        </>
      ) : (
        <div className="flex flex-col items-center gap-5 animate-fadein px-4">
          <div className="font-display text-ember text-3xl font-bold text-outline tracking-widest">SPOILS CLAIMED</div>
          <div className="flex flex-col sm:flex-row gap-4">
            {rewards.map((r, i) => {
              if (r.kind === 'fusion' && fuseDef) {
                const aDef = isWeapon(fuseDef.a) ? WEAPONS[fuseDef.a] : PASSIVES[fuseDef.a];
                const bDef = isWeapon(fuseDef.b) ? WEAPONS[fuseDef.b] : PASSIVES[fuseDef.b];
                return (
                  <div
                    key={i}
                    className="pixel-corners w-[300px] p-5 text-center animate-cardin relative overflow-hidden"
                    style={{
                      animationDelay: `${i * 0.1}s`,
                      background: 'linear-gradient(160deg,#3a2318 0%,#231234 60%,#33203a 100%)',
                      border: `3px solid ${fuseDef.color}`,
                      boxShadow: `0 0 0 2px #120a1c, 0 0 40px ${fuseDef.color}66`,
                    }}
                  >
                    <div className="absolute inset-0 animate-fusionflash" style={{ background: `radial-gradient(circle, ${fuseDef.color}55 0%, transparent 70%)` }} />
                    <div className="text-[10px] font-black tracking-[0.3em] text-ember mb-2">
                      {fuseDef.flagship ? 'FLAGSHIP EVOLUTION' : 'EVOLUTION FORGED'}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <CompIcon id={fuseDef.a} size={34} />
                      <span className="font-display text-parch text-xl">×</span>
                      <CompIcon id={fuseDef.b} size={34} />
                      <span className="font-display text-ember text-2xl">→</span>
                      <div className="animate-glowpulse">
                        <CompIcon id={fuseDef.kind === 'weapon' ? (fuseDef.base ?? fuseDef.a) : fuseDef.a} size={40} color={fuseDef.color} />
                      </div>
                    </div>
                    <div className="font-display font-black text-2xl mt-2 leading-tight" style={{ color: fuseDef.color, textShadow: '0 2px 0 #120a1c' }}>
                      {fuseDef.name}
                    </div>
                    <p className="text-[12px] font-bold text-parch mt-1.5 leading-snug">{fuseDef.desc}</p>
                    <div className="text-[10px] font-black text-parch/60 mt-2 tracking-wide">
                      {aDef.name} + {bDef.name}
                    </div>
                  </div>
                );
              }
              const label =
                r.kind === 'heal' ? `Healing Rite +${r.amount}` :
                r.kind === 'gold' ? `${r.amount} Gold` :
                r.kind === 'weapon' ? `${WEAPONS[r.id as keyof typeof WEAPONS].name} +1 Rank` :
                r.kind === 'passive' ? `${PASSIVES[r.id as keyof typeof PASSIVES].name} +1 Rank` : '';
              return (
                <div
                  key={i}
                  className="pixel-corners gothic-frame w-[200px] p-4 text-center bg-panel/95 animate-cardin"
                  style={{ animationDelay: `${i * 0.1}s` }}
                >
                  <div className="flex justify-center text-ember">
                    <UiIcon name={r.kind === 'heal' ? 'heart' : r.kind === 'gold' ? 'coin' : 'chest'} size={34} />
                  </div>
                  <div className="font-display font-bold text-lg mt-2 text-bone">{label}</div>
                </div>
              );
            })}
          </div>
          <GothicButton onClick={onClaim} color="#9be85e">
            CONTINUE THE HUNT
          </GothicButton>
        </div>
      )}
    </div>
  );
}

/* --------------------------------- pause ----------------------------------- */

export function PauseScreen({ onResume, onQuit, muted, onMute }: {
  onResume: () => void;
  onQuit: () => void;
  muted: boolean;
  onMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-ink/80 backdrop-blur-[3px] no-select animate-fadein">
      <div className="font-display font-black text-6xl text-outline text-parch tracking-widest">PAUSED</div>
      <div className="text-parch/70 font-bold text-sm mt-2 mb-8">The hells wait for no one... except now.</div>
      <div className="flex flex-col gap-3 w-64">
        <GothicButton onClick={onResume} color="#9be85e">RESUME (ESC)</GothicButton>
        <GothicButton onClick={onMute} color="#7fd4e8">{muted ? 'UNMUTE (M)' : 'MUTE (M)'}</GothicButton>
        <GothicButton onClick={onQuit} color="#e6404f">ABANDON RUN</GothicButton>
      </div>
      <div className="mt-8 max-w-md text-center text-[12px] font-bold text-parch/60 leading-relaxed">
        Rank an ability and a relic to <span className="text-ember">V</span>, then open any chest — the two will fuse into an
        evolution. Treasure Goblins and elites drop chests.
      </div>
    </div>
  );
}

/* ---------------------------------- end ------------------------------------ */

export function EndScreen({ stats, onRestart, onMenu }: { stats: EndStats; onRestart: () => void; onMenu: () => void }) {
  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_50%_40%,#2f1b46_0%,#150c22_60%,#0d0716_100%)] no-select overflow-hidden animate-fadein">
      <Embers n={stats.victory ? 30 : 10} />
      <div className="relative z-10 flex flex-col items-center px-4 w-full max-w-2xl">
        <div
          className="font-display font-black text-[clamp(48px,8vw,84px)] leading-none text-outline animate-popin"
          style={{ color: stats.victory ? '#ffc258' : '#e6404f', textShadow: `0 0 40px ${stats.victory ? 'rgba(255,194,88,0.5)' : 'rgba(230,64,79,0.5)'}` }}
        >
          {stats.victory ? 'SANCTUARY ENDURES' : 'YOU HAVE FALLEN'}
        </div>
        <div className="font-body font-bold text-parch/80 mt-2 mb-6 text-sm tracking-wide">
          {stats.victory
            ? stats.bossKills >= 4
              ? 'All four Prime Evils lie broken. The Heavens sing your name.'
              : 'You outlasted the night. The horde recedes... for now.'
            : `The horde claimed you at ${fmtTime(stats.time)}. The Gloom deepens.`}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 w-full mb-5">
          {stats.stats.map((s, i) => (
            <div key={i} className="pixel-corners gothic-frame bg-panel/90 px-3 py-2.5 animate-cardin" style={{ animationDelay: `${i * 0.05}s` }}>
              <div className="text-[10px] font-black tracking-widest text-parch/60 uppercase">{s.label}</div>
              <div className="font-display font-bold text-xl text-ember leading-tight">{s.value}</div>
            </div>
          ))}
        </div>

        {stats.fusions.length > 0 && (
          <div className="w-full pixel-corners gothic-frame bg-panel/80 p-3 mb-6 animate-cardin" style={{ animationDelay: '0.3s' }}>
            <div className="flex items-center gap-2 mb-1.5">
              <FusionSigil size={18} />
              <span className="text-[10px] font-black tracking-[0.25em] text-arcane">EVOLUTIONS FORGED</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {stats.fusions.map((f, i) => (
                <span key={i} className="pixel-corners bg-[#33203a] border border-arcane/50 px-2 py-0.5 text-[11px] font-black text-arcane">
                  {f}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-3">
          <GothicButton big onClick={onRestart}>RISE AGAIN</GothicButton>
          <GothicButton big onClick={onMenu} color="#8d7ba8">MAIN MENU</GothicButton>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------- banner ---------------------------------- */

export interface BannerData {
  id: number;
  title: string;
  sub?: string;
}

export function BannerLayer({ banners }: { banners: BannerData[] }) {
  return (
    <div className="absolute inset-x-0 top-[22%] z-20 flex flex-col items-center gap-2 pointer-events-none no-select">
      {banners.map((b) => (
        <div key={b.id} className="text-center animate-bannerin">
          <div
            className="font-display font-black text-[clamp(30px,5vw,52px)] leading-none text-outline text-blood"
            style={{ textShadow: '0 0 30px rgba(230,64,79,0.55), 0 3px 0 #120a1c' }}
          >
            {b.title}
          </div>
          {b.sub && <div className="font-display text-parch text-lg tracking-[0.3em] text-outline mt-1">{b.sub}</div>}
        </div>
      ))}
    </div>
  );
}
