export type GameScreenState =
  | 'TITLE_MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'STAGE_CLEAR'
  | 'GAME_OVER'
  | 'VICTORY';

export interface AlphabetEntry {
  index: number; // 0..32 (ა..ჰ)
  letter: string;
  name: string;
  saying: string;
  speaker: string;
  stageIndex: number; // 0..4
}

export type PlatformKind = 'ground' | 'stone' | 'wood' | 'moving' | 'crumble';

export interface PlatformDef {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: PlatformKind;
  moveAxis?: 'x' | 'y';
  moveRange?: number;
  moveSpeed?: number;
}

export interface SpringDef {
  id: string;
  x: number;
  y: number;
}

export type HazardKind = 'ink_puddle' | 'flying_quill' | 'bramble' | 'rolling_stone';

export interface HazardDef {
  id: string;
  kind: HazardKind;
  x: number;
  y: number;
  w: number;
  h: number;
  patrolRange?: number;
  patrolSpeed?: number;
}

export interface RoadsideTriggerDef {
  id: string;
  x: number;
  y: number;
  npcKind: 'sparrow' | 'student' | 'shepherd' | 'owl';
  quip: string;
}

export interface LetterPlacementDef {
  alphabetIndex: number;
  x: number;
  y: number;
}

export interface StagePalette {
  skyTop: string;
  skyBottom: string;
  sunColor: string;
  mountainFar: string;
  mountainNear: string;
  hillColor: string;
  groundTop: string;
  groundBody: string;
  platformColor: string;
  accent: string;
}

export interface StageConfig {
  index: number;
  title: string;
  subtitle: string;
  letterRangeLabel: string;
  introQuote: string;
  worldWidth: number;
  finishX: number;
  finishY: number;
  palette: StagePalette;
  platforms: PlatformDef[];
  springs: SpringDef[];
  hazards: HazardDef[];
  letters: LetterPlacementDef[];
  roadsideTriggers: RoadsideTriggerDef[];
}

export interface ActiveSpeechBubble {
  letter?: string;
  speaker: string;
  text: string;
  isWarning?: boolean;
  timer: number;
  duration: number;
}

export interface HudSnapshot {
  screen: GameScreenState;
  stageIndex: number;
  totalStages: number;
  stageTitle: string;
  hp: number;
  maxHp: number;
  unlockedIndices: number[];
  stageCollectedCount: number;
  stageTotalLetters: number;
  nextAlphabetIndex: number | null;
  activeSpeech: ActiveSpeechBubble | null;
  waveCooldownRatio: number; // 0 = ready, 1 = full cooldown
  elapsedStageSeconds: number;
  totalRunSeconds: number;
  score: number;
  missingLetterHint: string | null;
}
