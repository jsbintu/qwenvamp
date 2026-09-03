import { useCallback, useEffect, useRef, useState } from 'react';
import { GloomfallEngine } from './game/engine';
import type { Callbacks } from './game/engine';
import type { Choice, ChestReward, ClassId, EndStats, Snapshot } from './game/types';
import { bakeAll } from './game/sprites';
import { sfx, setMuted } from './game/audio';
import HUD from './components/HUD';
import {
  BossBanner, ChestScreen, EndScreen, FusionFlash, LevelUpScreen, LoadingScreen,
  PauseScreen, StartScreen,
} from './components/Overlays';

type Ov = 'menu' | 'loading' | 'none' | 'levelup' | 'chest' | 'pause' | 'end';

interface Banner { text: string; sub?: string; id: number }
interface Fusion { name: string; desc: string; flagship: boolean; id: number }

const DEFAULT_SNAP: Snapshot = {
  hp: 100, maxHp: 100, level: 1, xp: 0, xpNeed: 10, time: 0, duration: 600,
  kills: 0, gold: 0, weapons: [], passives: [], boss: null, muted: false,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GloomfallEngine | null>(null);
  const classRef = useRef<ClassId>('barbarian');

  const [ov, setOv] = useState<Ov>('menu');
  const [progress, setProgress] = useState(0);
  const [snap, setSnap] = useState<Snapshot>(DEFAULT_SNAP);
  const [choices, setChoices] = useState<Choice[]>([]);
  const [rewards, setRewards] = useState<ChestReward[]>([]);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [fusion, setFusion] = useState<Fusion | null>(null);
  const [end, setEnd] = useState<EndStats | null>(null);
  const [muted, setMutedState] = useState(false);
  const [runId, setRunId] = useState(0);

  /* auto-clear transient overlays */
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(null), 3000);
    return () => clearTimeout(t);
  }, [banner]);
  useEffect(() => {
    if (!fusion) return;
    const t = setTimeout(() => setFusion(null), fusion.flagship ? 2800 : 2200);
    return () => clearTimeout(t);
  }, [fusion]);

  const startingRef = useRef(false);
  const startRun = useCallback(async (cls: ClassId) => {
    if (startingRef.current) return;
    startingRef.current = true;
    classRef.current = cls;
    setOv('loading');
    setProgress(0);
    try {
      await bakeAll((p) => setProgress(p));
    } finally {
      startingRef.current = false;
    }
    setRunId((r) => r + 1);
    setOv('none');
  }, []);

  /* spawn engine after loading */
  useEffect(() => {
    if (ov !== 'none' || !canvasRef.current) return;
    const cb: Callbacks = {
      onSnapshot: (s) => setSnap(s),
      onEnd: (s) => { setEnd(s); setOv('end'); },
      onLevelUp: (c) => { setChoices(c); setOv('levelup'); },
      onChest: (r) => { setRewards(r); setOv('chest'); },
      onEvolve: (name, desc, flagship) => setFusion({ name, desc, flagship, id: Date.now() }),
      onBanner: (text, sub) => setBanner({ text, sub, id: Date.now() }),
    };
    const engine = new GloomfallEngine(canvasRef.current, cb, classRef.current);
    engine.setMutedState(muted);
    engineRef.current = engine;
    setSnap(DEFAULT_SNAP);
    setEnd(null);
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ov, runId]);

  const pick = useCallback((c: Choice) => {
    const more = engineRef.current?.choose(c);
    if (!more) setOv('none');
  }, []);

  const claim = useCallback(() => {
    engineRef.current?.claimChest(rewards);
    setOv('none');
    sfx.click();
  }, [rewards]);

  const pause = useCallback(() => {
    setOv((cur) => {
      if (cur !== 'none') return cur;
      engineRef.current?.setPaused(true);
      return 'pause';
    });
  }, []);
  const resume = useCallback(() => {
    engineRef.current?.setPaused(false);
    setOv('none');
  }, []);
  const quit = useCallback(() => {
    engineRef.current?.setPaused(false);
    setOv('menu');
    setEnd(null);
  }, []);
  const toggleMute = useCallback(() => {
    setMutedState((m) => {
      const next = !m;
      setMuted(next);
      engineRef.current?.setMutedState(next);
      return next;
    });
  }, []);

  /* hotkeys */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (ov === 'pause') resume();
        else if (ov === 'none') pause();
      }
      if (e.key.toLowerCase() === 'm') toggleMute();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [ov, pause, resume, toggleMute]);

  const inGame = ov !== 'menu' && ov !== 'loading' && ov !== 'end';

  return (
    <div className="fixed inset-0 bg-ink overflow-hidden font-body">
      {inGame && (
        <>
          <canvas ref={canvasRef} className="absolute inset-0" />
          <HUD snap={snap} muted={muted} onPause={pause} onMute={toggleMute} />
        </>
      )}

      {ov === 'menu' && <StartScreen onStart={startRun} />}
      {ov === 'loading' && <LoadingScreen progress={progress} />}
      {ov === 'levelup' && <LevelUpScreen choices={choices} onPick={pick} pending={0} />}
      {ov === 'chest' && <ChestScreen rewards={rewards} onClaim={claim} />}
      {ov === 'pause' && <PauseScreen onResume={resume} onQuit={quit} muted={muted} onMute={toggleMute} />}
      {ov === 'end' && end && (
        <EndScreen stats={end} onRetry={() => startRun(classRef.current)} onMenu={() => { setOv('menu'); setEnd(null); }} />
      )}

      {banner && inGame && <BossBanner key={banner.id} text={banner.text} sub={banner.sub} />}
      {fusion && inGame && <FusionFlash key={fusion.id} name={fusion.name} desc={fusion.desc} flagship={fusion.flagship} />}
    </div>
  );
}
