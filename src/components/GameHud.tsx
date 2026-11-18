import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Pause,
  Sparkles,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {ALPHABET_ENTRIES} from '../game/alphabetData';
import type {HudSnapshot} from '../game/types';

interface GameHudProps {
  hud: HudSnapshot;
  muted: boolean;
  onToggleMute: () => void;
  onOpenCodex: () => void;
  onPause: () => void;
  onTouchMove: (dir: 'left' | 'right', active: boolean) => void;
  onTouchJump: (active: boolean) => void;
  onTriggerWave: () => void;
}

export function GameHud({
  hud,
  muted,
  onToggleMute,
  onOpenCodex,
  onPause,
  onTouchMove,
  onTouchJump,
  onTriggerWave,
}: GameHudProps) {
  const nextEntry =
    hud.nextAlphabetIndex !== null
      ? ALPHABET_ENTRIES[hud.nextAlphabetIndex]
      : null;

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-4 md:p-5 select-none">
      {/* Top Perimeter Cluster — zero backdrop-filter over active canvas */}
      <div className="flex items-start justify-between gap-4">
        {/* Top-Left Status Cluster */}
        <div className="flex flex-col gap-1.5 rounded-xl border border-[#5c4228]/25 bg-[#faf4e4]/95 px-4 py-2.5 text-[#291e14] shadow-sm">
          <div className="flex items-center gap-2 text-xs font-semibold text-[#6b4f35]">
            <span className="font-mono-num">
              საფეხური {hud.stageIndex + 1}/{hud.totalStages}
            </span>
            <span aria-hidden="true">·</span>
            <span>{hud.stageTitle}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num">
              {formatSeconds(hud.elapsedStageSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-4">
            {/* Hearts / Ink Integrity */}
            <div
              className="flex items-center gap-1"
              aria-label={`სიცოცხლე: ${hud.hp} / ${hud.maxHp}`}
            >
              {Array.from({length: hud.maxHp}).map((_, idx) => {
                const filled = idx < hud.hp;
                return (
                  <svg
                    key={idx}
                    viewBox="0 0 24 24"
                    className={`h-5 w-5 transition-opacity duration-150 ${
                      filled ? 'text-[#b91c1c]' : 'text-[#b91c1c]/20'
                    }`}
                    fill="currentColor"
                  >
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                  </svg>
                );
              })}
            </div>

            <span className="h-4 w-px bg-[#5c4228]/20" aria-hidden="true" />

            {/* Collected Letters Counter */}
            <div className="flex items-center gap-1.5 text-sm font-bold text-[#291e14]">
              <span>ანბანი:</span>
              <span className="font-mono-num text-[#991b1b]">
                {hud.unlockedIndices.length}/33
              </span>
            </div>

            <span className="h-4 w-px bg-[#5c4228]/20" aria-hidden="true" />

            {/* Word Wave Readiness */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold">
              <Sparkles
                className={`h-3.5 w-3.5 ${
                  hud.waveCooldownRatio <= 0.01
                    ? 'text-[#b45309]'
                    : 'text-[#8b735b]'
                }`}
              />
              <span
                className={
                  hud.waveCooldownRatio <= 0.01
                    ? 'text-[#92400e]'
                    : 'text-[#8b735b]'
                }
              >
                E: {hud.waveCooldownRatio <= 0.01 ? 'მზადაა' : 'იტენება'}
              </span>
            </div>
          </div>
        </div>

        {/* Top-Right Next Letter Target & Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Next Expected Letter Indicator */}
          <div className="flex h-11 items-center gap-2.5 rounded-xl border border-[#5c4228]/25 bg-[#faf4e4]/95 px-3.5 text-[#291e14] shadow-sm">
            {nextEntry ? (
              <>
                <span className="text-xs font-semibold text-[#6b4f35] whitespace-nowrap">
                  შემდეგი ასო:
                </span>
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#991b1b] font-display-ka text-base font-bold text-[#fffbeb]">
                  {nextEntry.letter}
                </span>
              </>
            ) : (
              <span className="text-xs font-bold text-[#166534] whitespace-nowrap">
                ყველა ასო აღებულია · თაღისკენ!
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenCodex}
            title="ანბანის წიგნი"
            className="pointer-events-auto flex h-11 items-center gap-1.5 rounded-xl border border-[#5c4228]/25 bg-[#faf4e4]/95 px-3.5 text-xs font-semibold text-[#291e14] shadow-sm transition-colors duration-150 hover:bg-[#ffffff] whitespace-nowrap shrink-0 cursor-pointer"
          >
            <BookOpen className="h-4 w-4 text-[#b45309]" />
            <span className="hidden md:inline">წიგნი</span>
          </button>

          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? 'ხმის ჩართვა' : 'ხმის გამორთვა'}
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#5c4228]/25 bg-[#faf4e4]/95 text-[#291e14] shadow-sm transition-colors duration-150 hover:bg-[#ffffff] shrink-0 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="h-4 w-4 text-[#991b1b]" />
            ) : (
              <Volume2 className="h-4 w-4 text-[#92400e]" />
            )}
          </button>

          <button
            type="button"
            onClick={onPause}
            aria-label="პაუზა"
            className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-xl border border-[#5c4228]/25 bg-[#faf4e4]/95 text-[#291e14] shadow-sm transition-colors duration-150 hover:bg-[#ffffff] shrink-0 cursor-pointer"
          >
            <Pause className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bottom Area: Active Proverb Subtitle Bar + Mobile Touch Controls */}
      <div className="flex flex-col items-center gap-3">
        {hud.activeSpeech && (
          <div
            className={`max-w-2xl rounded-xl border px-4 py-2.5 shadow-sm transition-opacity duration-150 ${
              hud.activeSpeech.isWarning
                ? 'border-[#dc2626]/40 bg-[#fef2f2]/95 text-[#7f1d1d]'
                : 'border-[#b45309]/35 bg-[#fffdf7]/95 text-[#291e14]'
            }`}
          >
            <div className="flex items-center gap-3">
              {hud.activeSpeech.letter && (
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#991b1b] font-display-ka text-lg font-bold text-[#fffbeb]">
                  {hud.activeSpeech.letter}
                </span>
              )}
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">
                  {hud.activeSpeech.speaker}
                </div>
                <div className="text-sm font-semibold leading-snug">
                  {hud.activeSpeech.text}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Touch Controls for Mobile / Tablet */}
        <div className="flex w-full items-center justify-between md:hidden">
          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="მარცხნივ"
              onPointerDown={() => onTouchMove('left', true)}
              onPointerUp={() => onTouchMove('left', false)}
              onPointerLeave={() => onTouchMove('left', false)}
              onPointerCancel={() => onTouchMove('left', false)}
              className="flex h-12 w-14 items-center justify-center rounded-xl border border-[#5c4228]/30 bg-[#faf4e4]/90 text-[#291e14] active:bg-[#e8d7b3]"
            >
              <ArrowLeft className="h-6 w-6" />
            </button>
            <button
              type="button"
              aria-label="მარჯვნივ"
              onPointerDown={() => onTouchMove('right', true)}
              onPointerUp={() => onTouchMove('right', false)}
              onPointerLeave={() => onTouchMove('right', false)}
              onPointerCancel={() => onTouchMove('right', false)}
              className="flex h-12 w-14 items-center justify-center rounded-xl border border-[#5c4228]/30 bg-[#faf4e4]/90 text-[#291e14] active:bg-[#e8d7b3]"
            >
              <ArrowRight className="h-6 w-6" />
            </button>
          </div>

          <div className="pointer-events-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="სიტყვის ტალღა"
              onPointerDown={onTriggerWave}
              className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#b45309]/40 bg-[#fffbeb]/90 font-bold text-[#b45309] active:bg-[#fef3c7]"
            >
              <Sparkles className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="ნახტომი"
              onPointerDown={() => onTouchJump(true)}
              onPointerUp={() => onTouchJump(false)}
              onPointerLeave={() => onTouchJump(false)}
              onPointerCancel={() => onTouchJump(false)}
              className="flex h-12 w-16 items-center justify-center rounded-xl bg-[#991b1b]/95 text-[#fffbeb] shadow active:bg-[#7f1d1d]"
            >
              <ArrowUp className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
