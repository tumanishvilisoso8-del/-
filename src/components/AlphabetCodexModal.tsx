import {Lock, Volume2, X} from 'lucide-react';
import {useState} from 'react';
import {ALPHABET_ENTRIES, STAGES} from '../game/alphabetData';
import {gameAudio} from '../game/audio';

interface AlphabetCodexModalProps {
  unlockedIndices: number[];
  onClose: () => void;
}

export function AlphabetCodexModal({
  unlockedIndices,
  onClose,
}: AlphabetCodexModalProps) {
  const unlockedSet = new Set(unlockedIndices);
  const [selectedIdx, setSelectedIdx] = useState<number>(
    unlockedIndices.length > 0 ? unlockedIndices[unlockedIndices.length - 1] : 0
  );

  const selectedEntry = ALPHABET_ENTRIES[selectedIdx];
  const isUnlocked = unlockedSet.has(selectedIdx);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#18110b]/75 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-[#8b5e34]/35 bg-[#faf4e4] text-[#291e14] shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#5c4228]/15 px-6 py-4">
          <div>
            <h2 className="font-display-ka text-xl font-bold text-[#991b1b]">
              დედა ენის ანბანი · ა–ჰ
            </h2>
            <p className="text-xs font-medium text-[#6b4f35]">
              გახსნილი გამონათქვამები:{' '}
              <span className="font-mono-num font-bold text-[#291e14]">
                {unlockedIndices.length} / 33
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="დახურვა"
            className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#5c4228]/20 bg-[#fffdf7] text-[#291e14] hover:bg-[#f2e6cc] cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 33-Letter Grid */}
        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-6 sm:grid-cols-9 md:grid-cols-11 gap-2">
            {ALPHABET_ENTRIES.map((entry) => {
              const opened = unlockedSet.has(entry.index);
              const selected = selectedIdx === entry.index;
              return (
                <button
                  key={entry.index}
                  type="button"
                  onClick={() => {
                    setSelectedIdx(entry.index);
                    if (opened) {
                      gameAudio.playLetterCollect(entry.index);
                      gameAudio.speakGeorgian(entry.saying);
                    }
                  }}
                  className={`flex h-12 flex-col items-center justify-center rounded-xl border text-center transition-transform duration-150 active:scale-[0.97] cursor-pointer ${
                    selected
                      ? 'border-[#991b1b] bg-[#991b1b] text-[#fffbeb] shadow-sm'
                      : opened
                      ? 'border-[#b45309]/40 bg-[#fffdf7] text-[#291e14] hover:bg-[#fef3c7]'
                      : 'border-[#5c4228]/15 bg-[#efe4cc] text-[#8b735b]'
                  }`}
                >
                  <span className="font-display-ka text-lg font-bold leading-none">
                    {entry.letter}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Selected Entry Detail */}
          <div className="mt-6 rounded-xl border border-[#5c4228]/20 bg-[#fffdf7] p-5">
            {isUnlocked ? (
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#991b1b] font-display-ka text-3xl font-bold text-[#fffbeb]">
                  {selectedEntry.letter}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-[#7c2d12]">
                      <span>ასო „{selectedEntry.name}“</span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedEntry.speaker}</span>
                      <span aria-hidden="true">·</span>
                      <span>{STAGES[selectedEntry.stageIndex].title}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        gameAudio.playLetterCollect(selectedEntry.index);
                        gameAudio.speakGeorgian(selectedEntry.saying);
                      }}
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-[#b45309]/30 bg-[#fef3c7]/60 px-2.5 text-xs font-semibold text-[#92400e] hover:bg-[#fef3c7] whitespace-nowrap cursor-pointer"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                      <span>მოსმენა</span>
                    </button>
                  </div>
                  <p className="font-display-ka text-lg font-semibold leading-relaxed text-[#1c1917]">
                    „{selectedEntry.saying}“
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-4 text-[#6b4f35]">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-[#e7d9bc] text-[#785e43]">
                  <Lock className="h-6 w-6" />
                </div>
                <div>
                  <div className="text-sm font-bold text-[#3d2d1d]">
                    ასო „{selectedEntry.letter}“ ({selectedEntry.name}) ჯერ არ
                    გახსნილა
                  </div>
                  <p className="text-xs text-[#6b4f35]">
                    იპოვე ეს ასო საფეხურზე: {STAGES[selectedEntry.stageIndex].title}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
