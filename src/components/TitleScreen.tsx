import {BookOpen, Play, Volume2, VolumeX} from 'lucide-react';
import {useEffect, useState} from 'react';
import {STAGES} from '../game/alphabetData';

interface TitleScreenProps {
  selectedStage: number;
  onSelectStage: (stageIndex: number) => void;
  onStartGame: (stageIndex: number) => void;
  onOpenCodex: () => void;
  unlockedCount: number;
  muted: boolean;
  onToggleMute: () => void;
}

export function TitleScreen({
  selectedStage,
  onSelectStage,
  onStartGame,
  onOpenCodex,
  unlockedCount,
  muted,
  onToggleMute,
}: TitleScreenProps) {
  const [backdropFailed, setBackdropFailed] = useState(false);
  const [portraitFailed, setPortraitFailed] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'Space') {
        e.preventDefault();
        onStartGame(selectedStage);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStartGame, selectedStage]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#231912] text-[#291e14] select-none">
      {/* Illustrated Key-Art Backdrop */}
      {!backdropFailed ? (
        <img
          src="/src/assets/images/title_backdrop_1794947801292.jpg"
          alt="ვარიანის ხედი და დედა ენა"
          referrerPolicy="no-referrer"
          onError={() => setBackdropFailed(true)}
          className="absolute inset-0 h-full w-full object-cover object-right"
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(125deg, #f7ecd4 0%, #e7cf9d 48%, #8f724a 100%)',
          }}
        />
      )}

      {/* Calm left-side gradient scrim keeping 35-45% calm negative space for title lockup */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(95deg, rgba(250, 243, 227, 0.96) 0%, rgba(250, 243, 227, 0.90) 38%, rgba(250, 243, 227, 0.42) 64%, rgba(35, 25, 18, 0.14) 100%)',
        }}
      />

      {/* Top-right sound toggle */}
      <div className="absolute top-5 right-6 z-20 flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'ხმის ჩართვა' : 'ხმის გამორთვა'}
          className="flex h-11 items-center gap-2 rounded-lg border border-[#3d2d1d]/20 bg-[#faf5e8]/90 px-4 text-sm font-medium text-[#291e14] shadow-sm transition-transform duration-150 hover:bg-[#fffdf7] active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
        >
          {muted ? <VolumeX className="h-4 w-4 text-[#991b1b]" /> : <Volume2 className="h-4 w-4 text-[#92400e]" />}
          <span>{muted ? 'ხმა გათიშულია' : 'ხმა ჩართულია'}</span>
        </button>
      </div>

      {/* Main Title & Action Stack on calm left space */}
      <div className="relative z-10 flex h-full w-full flex-col justify-between px-6 py-8 md:px-14 md:py-12">
        <div className="max-w-xl my-auto">
          {/* Portrait + Unboxed Metadata Line */}
          <div className="mb-5 flex items-center gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[#8b5e34]/40 bg-[#f3e6cb] shadow-sm">
              {!portraitFailed ? (
                <img
                  src="/src/assets/images/iakob_portrait_1794947802581.jpg"
                  alt="იაკობ გოგებაშვილი"
                  referrerPolicy="no-referrer"
                  onError={() => setPortraitFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center font-display-ka text-2xl font-bold text-[#991b1b]">
                  ა
                </div>
              )}
            </div>
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#7c2d12]">
                <span>იაკობ გოგებაშვილი</span>
                <span aria-hidden="true">·</span>
                <span>დედა ენა</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num">{unlockedCount}/33 ასო</span>
              </div>
              <p className="text-sm font-medium text-[#574230]">
                საგანმანათლებლო 2D თავგადასავალი ა-დან ჰ-მდე
              </p>
            </div>
          </div>

          {/* Bespoke Inline SVG Title Lockup */}
          <div className="mb-4">
            <svg
              viewBox="0 0 540 124"
              className="w-full max-w-[480px] h-auto overflow-visible"
              role="img"
              aria-label="ნელა, იაკობ! — დედა ენის გზა"
            >
              <defs>
                <linearGradient id="titleCrimson" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#991b1b" />
                  <stop offset="100%" stopColor="#b45309" />
                </linearGradient>
              </defs>
              {/* Subtle decorative ink flourish */}
              <path
                d="M6 106 Q 130 98, 260 105 T 490 102"
                fill="none"
                stroke="#b45309"
                strokeWidth="2.5"
                strokeLinecap="round"
                opacity="0.55"
              />
              <text
                x="2"
                y="62"
                fill="url(#titleCrimson)"
                fontFamily='"Noto Serif Georgian", Georgia, serif'
                fontSize="54"
                fontWeight="800"
                letterSpacing="-0.5"
              >
                ნელა, იაკობ!
              </text>
              <text
                x="4"
                y="94"
                fill="#3d2d1d"
                fontFamily='"Noto Sans Georgian", sans-serif'
                fontSize="20"
                fontWeight="600"
              >
                დედა ენის გზა · ქართული გამონათქვამები ა–ჰ
              </text>
            </svg>
          </div>

          <p className="mb-6 max-w-md text-[15px] leading-relaxed text-[#423224]">
            გაჰყევი იაკობ გოგებაშვილს ვარიანიდან დედა ენის ტაძრამდე. გადალახე
            დაბრკოლებები, მოუსმინე გზისპირა თანამგზავრებს და შეაგროვე 33
            გამონათქვამი ანბანის რიგით — <strong>ა</strong>-დან{' '}
            <strong>ჰ</strong>-მდე.
          </p>

          {/* Stage Selector Segmented Strip */}
          <div className="mb-6">
            <div className="mb-2 text-xs font-semibold text-[#6b533b]">
              აირჩიე საფეხური
            </div>
            <div className="grid grid-cols-5 gap-1.5 rounded-xl border border-[#8b5e34]/25 bg-[#f2e6cc]/80 p-1.5 max-w-lg">
              {STAGES.map((st) => {
                const active = selectedStage === st.index;
                return (
                  <button
                    key={st.index}
                    type="button"
                    onClick={() => onSelectStage(st.index)}
                    className={`flex flex-col items-center justify-center rounded-lg px-2 py-2 text-center transition-colors duration-150 whitespace-nowrap cursor-pointer ${
                      active
                        ? 'bg-[#991b1b] text-[#fffbeb] shadow-sm'
                        : 'text-[#3d2d1d] hover:bg-[#e8d7b3]'
                    }`}
                  >
                    <span className="font-mono-num text-xs font-bold">
                      {st.index + 1}
                    </span>
                    <span className="text-[11px] font-medium opacity-90">
                      {st.letterRangeLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Primary & Secondary Action Row */}
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onStartGame(selectedStage)}
              className="flex h-12 items-center gap-2.5 rounded-xl bg-[#991b1b] px-7 text-base font-bold text-[#fffbeb] shadow-md transition-transform duration-150 hover:bg-[#7f1d1d] active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="h-5 w-5 fill-current" />
              <span>დაწყება</span>
            </button>

            <button
              type="button"
              onClick={onOpenCodex}
              className="flex h-12 items-center gap-2 rounded-xl border border-[#8b5e34]/35 bg-[#fffaf0]/90 px-5 text-sm font-semibold text-[#291e14] transition-colors duration-150 hover:bg-[#ffffff] active:scale-[0.98] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BookOpen className="h-4 w-4 text-[#b45309]" />
              <span>ანბანის წიგნი (ა–ჰ)</span>
            </button>
          </div>
        </div>

        {/* Single Flat Control-Hint Line */}
        <div className="pt-4 text-xs font-medium text-[#523f2d]">
          A / D ან ისრები: სიარული · Space / W: ნახტომი (ორმაგი ნახტომიც!) · E:
          სიტყვის ტალღა · Esc: პაუზა
        </div>
      </div>
    </div>
  );
}
