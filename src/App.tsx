import { useCallback, useEffect, useRef, useState } from 'react';
import { GloomfallEngine } from './game/engine';
import type { Choice, ChestReward, ClassId, EndStats, Snapshot } from './game/types';
import HUD from './components/HUD';
import { BannerLayer, ChestModal, EndScreen, LevelUpModal, PauseScreen, StartScreen, type BannerData } from './components/Overlays';
import { sfx, setMuted } from './game/audio';

type Ov = 'none' | 'levelup' | 'chest' | 'pause' | 'end';

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GloomfallEngine | null>(null);
  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [classId, setClassId] = useState<ClassId>('barbarian');
  const [runKey, setRunKey] = useState(0);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [ov, setOv] = useState<Ov>('none');
  const ovRef = useRef<Ov>('none');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [rewards, setRewards] = useState<ChestReward[]>([]);
  const [end, setEnd] = useState<EndStats | null>(null);
  const [banners, setBanners] = useState<BannerData[]>([]);
  const [muted, setMutedState] = useState(false);
  const bannerId = useRef(0);

  useEffect(() => {
    ovRef.current = ov;
    engineRef.current?.setPaused(ov !== 'none');
  }, [ov]);

  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSnap(null);
    setOv('none');
    setEnd(null);
    setBanners([]);
    const engine = new GloomfallEngine(
      canvas,
      {
        onSnapshot: (s) => setSnap(s),
        onEnd: (e) => {
          setEnd(e);
          setOv('end');
        },
        onLevelUp: (c) => {
          setChoices(c);
          setOv('levelup');
        },
        onChest: (r) => {
          setRewards(r);
          setOv('chest');
        },
        onEvolve: (name) => {
          pushBanner(`${name.toUpperCase()} FORGED`);
        },
        onBanner: (t, sub) => pushBanner(t, sub),
      },
      classId,
    );
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, runKey, classId]);

  const pushBanner = useCallback((title: string, sub?: string) => {
    const id = ++bannerId.current;
    setBanners((b) => [...b.slice(-1), { id, title, sub }]);
    setTimeout(() => setBanners((b) => b.filter((x) => x.id !== id)), 3000);
  }, []);

  /* keyboard shortcuts */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screen !== 'game') return;
      const k = e.key.toLowerCase();
      if (k === 'm') {
        setMutedState((m) => {
          setMuted(!m);
          engineRef.current?.setMutedState(!m);
          return !m;
        });
      }
      if (k === 'escape' || k === 'p') {
        if (ovRef.current === 'pause') setOv('none');
        else if (ovRef.current === 'none') {
          setOv('pause');
          sfx.click();
        }
      }
      if (ovRef.current === 'levelup' && ['1', '2', '3'].includes(k)) {
        const c = choicesRef.current[parseInt(k, 10) - 1];
        if (c) pick(c);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const choicesRef = useRef<Choice[]>([]);
  choicesRef.current = choices;

  const pick = useCallback(
    (c: Choice) => {
      const more = engineRef.current?.choose(c);
      if (!more) setOv('none');
      sfx.click();
    },
    [],
  );

  const claim = useCallback(() => {
    engineRef.current?.claimChest(rewards);
    setOv('none');
    sfx.click();
  }, [rewards]);

  const startRun = useCallback((c: ClassId) => {
    setClassId(c);
    setRunKey((k) => k + 1);
    setScreen('game');
    sfx.click();
  }, []);

  return (
    <div className="fixed inset-0 bg-ink overflow-hidden no-select">
      {screen === 'menu' && <StartScreen onStart={startRun} />}
      {screen === 'game' && (
        <>
          <canvas ref={canvasRef} className="absolute inset-0" />
          {snap && <HUD snap={snap} muted={muted} onPause={() => setOv('pause')} onMute={() => {
            setMutedState((m) => {
              setMuted(!m);
              engineRef.current?.setMutedState(!m);
              return !m;
            });
          }} />}
          <BannerLayer banners={banners} />
          {ov === 'levelup' && <LevelUpModal choices={choices} onPick={pick} level={snap?.level ?? 1} />}
          {ov === 'chest' && <ChestModal rewards={rewards} onClaim={claim} />}
          {ov === 'pause' && (
            <PauseScreen
              onResume={() => setOv('none')}
              onQuit={() => setScreen('menu')}
              muted={muted}
              onMute={() => {
                setMutedState((m) => {
                  setMuted(!m);
                  engineRef.current?.setMutedState(!m);
                  return !m;
                });
              }}
            />
          )}
          {ov === 'end' && end && (
            <EndScreen stats={end} onRestart={() => setRunKey((k) => k + 1)} onMenu={() => setScreen('menu')} />
          )}
        </>
      )}
    </div>
  );
}
