import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AlphabetCodexModal} from './components/AlphabetCodexModal';
import {GameHud} from './components/GameHud';
import {OverlayModals} from './components/OverlayModals';
import {TitleScreen} from './components/TitleScreen';
import {STAGES} from './game/alphabetData';
import {gameAudio} from './game/audio';
import {DedaEnaGameEngine} from './game/engine';
import type {HudSnapshot} from './game/types';

const STORAGE_KEY = 'nela_iakob_unlocked_v1';

const INITIAL_HUD: HudSnapshot = {
  screen: 'TITLE_MENU',
  stageIndex: 0,
  totalStages: STAGES.length,
  stageTitle: STAGES[0].title,
  hp: 3,
  maxHp: 3,
  unlockedIndices: [],
  stageCollectedCount: 0,
  stageTotalLetters: STAGES[0].letters.length,
  nextAlphabetIndex: 0,
  activeSpeech: null,
  waveCooldownRatio: 0,
  elapsedStageSeconds: 0,
  totalRunSeconds: 0,
  score: 0,
  missingLetterHint: null,
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<DedaEnaGameEngine | null>(null);

  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [selectedStage, setSelectedStage] = useState(0);
  const [codexOpen, setCodexOpen] = useState(false);
  const [muted, setMuted] = useState(false);
  const [persistentUnlocked, setPersistentUnlocked] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed)
        ? parsed.filter((n): n is number => typeof n === 'number')
        : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new DedaEnaGameEngine(canvas, (snapshot) => {
      setHud(snapshot);
    });
    engineRef.current = engine;
    engine.startLoop();

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);

  // Merge newly discovered letters into persistent codex archive
  useEffect(() => {
    if (hud.unlockedIndices.length === 0) return;
    setPersistentUnlocked((prev) => {
      const merged = Array.from(new Set([...prev, ...hud.unlockedIndices])).sort(
        (a, b) => a - b
      );
      if (merged.length === prev.length) return prev;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      } catch {
        // Ignore storage errors
      }
      return merged;
    });
  }, [hud.unlockedIndices]);

  const combinedCodexIndices = useMemo(() => {
    return Array.from(
      new Set([...persistentUnlocked, ...hud.unlockedIndices])
    ).sort((a, b) => a - b);
  }, [persistentUnlocked, hud.unlockedIndices]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      gameAudio.setMuted(next);
      return next;
    });
  }, []);

  const handleStartGame = useCallback((stageIdx: number) => {
    setCodexOpen(false);
    engineRef.current?.startNewGame(stageIdx);
  }, []);

  const handleOpenCodex = useCallback(() => {
    if (hud.screen === 'PLAYING') {
      engineRef.current?.setScreen('PAUSED');
    }
    setCodexOpen(true);
  }, [hud.screen]);

  const handlePause = useCallback(() => {
    engineRef.current?.setScreen('PAUSED');
  }, []);

  const handleResume = useCallback(() => {
    engineRef.current?.setScreen('PLAYING');
  }, []);

  const handleRetryStage = useCallback(() => {
    engineRef.current?.retryCurrentStage();
  }, []);

  const handleNextStage = useCallback(() => {
    engineRef.current?.advanceToNextStage();
  }, []);

  const handleRestartFull = useCallback(() => {
    engineRef.current?.startNewGame(0);
  }, []);

  const handleReturnTitle = useCallback(() => {
    setCodexOpen(false);
    engineRef.current?.setScreen('TITLE_MENU');
  }, []);

  return (
    <main className="relative h-screen w-screen overflow-hidden bg-[#1b140f]">
      {/* Isolated Canvas Layer */}
      <div className="absolute inset-0">
        <canvas
          ref={canvasRef}
          className="block h-full w-full"
          aria-label="ნელა, იაკობ! თამაშის არენა"
        />
      </div>

      {/* Title Screen */}
      {hud.screen === 'TITLE_MENU' && (
        <div className="absolute inset-0 z-20">
          <TitleScreen
            selectedStage={selectedStage}
            onSelectStage={setSelectedStage}
            onStartGame={handleStartGame}
            onOpenCodex={handleOpenCodex}
            unlockedCount={combinedCodexIndices.length}
            muted={muted}
            onToggleMute={handleToggleMute}
          />
        </div>
      )}

      {/* Active Play Perimeter HUD */}
      {hud.screen !== 'TITLE_MENU' && (
        <GameHud
          hud={hud}
          muted={muted}
          onToggleMute={handleToggleMute}
          onOpenCodex={handleOpenCodex}
          onPause={handlePause}
          onTouchMove={(dir, active) =>
            engineRef.current?.setTouchMove(dir, active)
          }
          onTouchJump={(active) => engineRef.current?.triggerTouchJump(active)}
          onTriggerWave={() => engineRef.current?.triggerWordWave()}
        />
      )}

      {/* Pause / Stage Clear / Game Over / Victory Modals */}
      <OverlayModals
        hud={hud}
        onResume={handleResume}
        onRetryStage={handleRetryStage}
        onNextStage={handleNextStage}
        onRestartFull={handleRestartFull}
        onOpenCodex={handleOpenCodex}
        onReturnTitle={handleReturnTitle}
      />

      {/* Alphabet A-H Codex Modal */}
      {codexOpen && (
        <AlphabetCodexModal
          unlockedIndices={combinedCodexIndices}
          onClose={() => setCodexOpen(false)}
        />
      )}
    </main>
  );
}
