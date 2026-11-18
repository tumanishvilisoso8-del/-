import {ArrowRight, Award, BookOpen, Home, Play, RotateCcw} from 'lucide-react';
import {STAGES} from '../game/alphabetData';
import type {HudSnapshot} from '../game/types';

interface OverlayModalsProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRetryStage: () => void;
  onNextStage: () => void;
  onRestartFull: () => void;
  onOpenCodex: () => void;
  onReturnTitle: () => void;
}

export function OverlayModals({
  hud,
  onResume,
  onRetryStage,
  onNextStage,
  onRestartFull,
  onOpenCodex,
  onReturnTitle,
}: OverlayModalsProps) {
  if (hud.screen === 'PLAYING' || hud.screen === 'TITLE_MENU') {
    return null;
  }

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-[#18110b]/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#8b5e34]/35 bg-[#faf4e4] p-7 text-[#291e14] shadow-2xl">
        {hud.screen === 'PAUSED' && (
          <>
            <div className="mb-1 text-xs font-semibold text-[#7c2d12]">
              საფეხური {hud.stageIndex + 1}/{hud.totalStages} · {hud.stageTitle}
            </div>
            <h2 className="font-display-ka mb-5 text-2xl font-bold text-[#291e14]">
              თამაში დაპაუზებულია
            </h2>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onResume}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#991b1b] px-5 text-sm font-bold text-[#fffbeb] hover:bg-[#7f1d1d] whitespace-nowrap cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>გაგრძელება</span>
              </button>
              <button
                type="button"
                onClick={onOpenCodex}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#5c4228]/25 bg-[#fffdf7] px-5 text-sm font-semibold text-[#291e14] hover:bg-[#f2e6cc] whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-[#b45309]" />
                <span>ანბანის წიგნი ({hud.unlockedIndices.length}/33)</span>
              </button>
              <button
                type="button"
                onClick={onRetryStage}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#5c4228]/25 bg-[#fffdf7] px-5 text-sm font-semibold text-[#291e14] hover:bg-[#f2e6cc] whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>საფეხურის თავიდან დაწყება</span>
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#5c4228]/20 bg-transparent px-5 text-sm font-semibold text-[#574230] hover:bg-[#efe4cc] whitespace-nowrap cursor-pointer"
              >
                <Home className="h-4 w-4" />
                <span>მთავარი მენიუ</span>
              </button>
            </div>
          </>
        )}

        {hud.screen === 'STAGE_CLEAR' && (
          <>
            <div className="mb-1 text-xs font-semibold text-[#166534]">
              საფეხური {hud.stageIndex + 1} დასრულებულია
            </div>
            <h2 className="font-display-ka mb-2 text-2xl font-bold text-[#291e14]">
              {hud.stageTitle} გავლილია!
            </h2>
            <p className="mb-5 text-sm text-[#574230]">
              ამ საფეხურის ყველა ასო ({STAGES[hud.stageIndex].letterRangeLabel})
              წარმატებით შეგროვდა.
            </p>

            <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border border-[#5c4228]/15 bg-[#fffdf7] p-3.5 text-center">
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">ასოები</div>
                <div className="font-mono-num text-lg font-bold text-[#991b1b]">
                  {hud.unlockedIndices.length}/33
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">დრო</div>
                <div className="font-mono-num text-lg font-bold text-[#291e14]">
                  {formatSeconds(hud.elapsedStageSeconds)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">ქულა</div>
                <div className="font-mono-num text-lg font-bold text-[#b45309]">
                  {hud.score}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onNextStage}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#991b1b] px-5 text-sm font-bold text-[#fffbeb] hover:bg-[#7f1d1d] whitespace-nowrap cursor-pointer"
              >
                <span>
                  შემდეგი საფეხური ({STAGES[hud.stageIndex + 1]?.letterRangeLabel})
                </span>
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onOpenCodex}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#5c4228]/25 bg-[#fffdf7] px-5 text-sm font-semibold text-[#291e14] hover:bg-[#f2e6cc] whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="h-4 w-4 text-[#b45309]" />
                <span>წაიკითხე შეგროვებული გამონათქვამები</span>
              </button>
            </div>
          </>
        )}

        {hud.screen === 'GAME_OVER' && (
          <>
            <div className="mb-1 text-xs font-semibold text-[#b91c1c]">
              ნელა, იაკობ!
            </div>
            <h2 className="font-display-ka mb-2 text-2xl font-bold text-[#291e14]">
              მელანი დაიღვარა...
            </h2>
            <p className="mb-5 text-sm text-[#574230]">
              დაბრკოლებებმა შეგვაჩერა, მაგრამ ნამდვილი მასწავლებელი გზას თავიდან
              იწყებს!
            </p>
            <div className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-[#5c4228]/15 bg-[#fffdf7] p-3.5 text-center">
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">
                  შეგროვებული ასო
                </div>
                <div className="font-mono-num text-lg font-bold text-[#991b1b]">
                  {hud.unlockedIndices.length}/33
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">ქულა</div>
                <div className="font-mono-num text-lg font-bold text-[#b45309]">
                  {hud.score}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onRetryStage}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#991b1b] px-5 text-sm font-bold text-[#fffbeb] hover:bg-[#7f1d1d] whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>საფეხურის ხელახლა ცდა</span>
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#5c4228]/25 bg-[#fffdf7] px-5 text-sm font-semibold text-[#291e14] hover:bg-[#f2e6cc] whitespace-nowrap cursor-pointer"
              >
                <Home className="h-4 w-4" />
                <span>მთავარი მენიუ</span>
              </button>
            </div>
          </>
        )}

        {hud.screen === 'VICTORY' && (
          <>
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-[#fef3c7] text-[#b45309]">
              <Award className="h-7 w-7" />
            </div>
            <div className="mb-1 text-xs font-semibold text-[#166534]">
              დედა ენა სრულადაა აწყობილი!
            </div>
            <h2 className="font-display-ka mb-2 text-2xl font-bold text-[#991b1b]">
              გილოცავ! ა-დან ჰ-მდე!
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-[#423224]">
              იაკობ გოგებაშვილმა ყველა საფეხური გაიარა და ქართული ანბანის 33-ვე
              სიბრძნე გააცოცხლა.
            </p>
            <div className="mb-6 grid grid-cols-3 gap-3 rounded-xl border border-[#5c4228]/15 bg-[#fffdf7] p-3.5 text-center">
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">ასოები</div>
                <div className="font-mono-num text-lg font-bold text-[#991b1b]">
                  {hud.unlockedIndices.length}/33
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">დრო</div>
                <div className="font-mono-num text-lg font-bold text-[#291e14]">
                  {formatSeconds(hud.totalRunSeconds)}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-medium text-[#6b4f35]">ქულა</div>
                <div className="font-mono-num text-lg font-bold text-[#b45309]">
                  {hud.score}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onOpenCodex}
                className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#b45309] px-5 text-sm font-bold text-[#fffbeb] hover:bg-[#92400e] whitespace-nowrap cursor-pointer"
              >
                <BookOpen className="h-4 w-4" />
                <span>ანბანის წიგნის დათვალიერება</span>
              </button>
              <button
                type="button"
                onClick={onRestartFull}
                className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#991b1b] px-5 text-sm font-bold text-[#fffbeb] hover:bg-[#7f1d1d] whitespace-nowrap cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                <span>თავიდან თამაში</span>
              </button>
              <button
                type="button"
                onClick={onReturnTitle}
                className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#5c4228]/20 bg-[#fffdf7] px-5 text-sm font-semibold text-[#291e14] hover:bg-[#f2e6cc] whitespace-nowrap cursor-pointer"
              >
                <Home className="h-4 w-4" />
                <span>მთავარი მენიუ</span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
