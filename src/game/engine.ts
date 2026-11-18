import {
  ALPHABET_ENTRIES,
  FALL_QUIPS,
  HAZARD_QUIPS,
  STAGES,
  WAVE_QUIPS,
} from './alphabetData';
import {gameAudio} from './audio';
import type {
  ActiveSpeechBubble,
  GameScreenState,
  HazardDef,
  HudSnapshot,
  PlatformDef,
  RoadsideTriggerDef,
  StageConfig,
} from './types';

interface RuntimePlatform extends PlatformDef {
  baseX: number;
  baseY: number;
  prevX: number;
  prevY: number;
  phase: number;
  crumbleState: 'solid' | 'shaking' | 'fallen';
  crumbleTimer: number;
}

interface RuntimeHazard extends HazardDef {
  baseX: number;
  phase: number;
  stunTimer: number;
}

interface RuntimeLetter {
  alphabetIndex: number;
  x: number;
  y: number;
  collected: boolean;
  bobPhase: number;
}

interface RuntimeSpring {
  id: string;
  x: number;
  y: number;
  bounceAnim: number;
}

interface RuntimeTrigger extends RoadsideTriggerDef {
  triggered: boolean;
  bobPhase: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  char?: string;
}

interface WaveRing {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  alpha: number;
}

export class DedaEnaGameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private onHudChange: (snapshot: HudSnapshot) => void;

  private rafId: number | null = null;
  private lastTimestamp = 0;

  private screen: GameScreenState = 'TITLE_MENU';
  private stageIndex = 0;
  private stage!: StageConfig;

  private platforms: RuntimePlatform[] = [];
  private hazards: RuntimeHazard[] = [];
  private letters: RuntimeLetter[] = [];
  private springs: RuntimeSpring[] = [];
  private triggers: RuntimeTrigger[] = [];
  private particles: Particle[] = [];
  private waveRings: WaveRing[] = [];

  // Player state
  private px = 110;
  private py = 530;
  private pw = 38;
  private ph = 64;
  private vx = 0;
  private vy = 0;
  private facing: 1 | -1 = 1;
  private onGround = false;
  private standingPlatform: RuntimePlatform | null = null;
  private jumpsRemaining = 2;
  private isDoubleJumping = false;
  private coyoteTimer = 0;
  private jumpBufferTimer = 0;
  private walkAnimTime = 0;
  private squashX = 1;
  private squashY = 1;
  private invulnTimer = 0;
  private lastSafeX = 110;
  private lastSafeY = 530;

  private hp = 3;
  private readonly maxHp = 3;
  private score = 0;
  private unlockedSet = new Set<number>();
  private elapsedStageSeconds = 0;
  private totalRunSeconds = 0;

  // Juice & feedback
  private hitstopTimer = 0;
  private shakeTimer = 0;
  private shakeIntensity = 0;
  private waveCooldown = 0;
  private readonly waveCooldownMax = 1.6;
  private speech: ActiveSpeechBubble | null = null;
  private missingHintTimer = 0;
  private missingLetterHint: string | null = null;
  private lastOrderWarnTime = 0;

  // Camera
  private camX = 0;
  private camY = 0;
  private viewW = 1280;
  private viewH = 720;

  // Input state
  private heldKeys = new Set<string>();
  private touchLeft = false;
  private touchRight = false;
  private jumpHeld = false;

  private lastHudEmit = 0;
  private ambientTimer = 0;

  constructor(canvas: HTMLCanvasElement, onHudChange: (snapshot: HudSnapshot) => void) {
    this.canvas = canvas;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Could not initialize 2D canvas context');
    }
    this.ctx = context;
    this.onHudChange = onHudChange;
    this.loadStage(0, false);
    this.bindEvents();
    this.resize();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    window.addEventListener('resize', this.resize);
  }

  public destroy(): void {
    this.stop();
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    window.removeEventListener('resize', this.resize);
  }

  public startLoop(): void {
    if (this.rafId !== null) return;
    this.lastTimestamp = performance.now();
    const tick = (now: number) => {
      const rawDt = (now - this.lastTimestamp) / 1000;
      this.lastTimestamp = now;
      const dt = Math.min(Math.max(rawDt, 0), 0.05);

      this.update(dt, now);
      this.render(now);
      this.rafId = requestAnimationFrame(tick);
    };
    this.rafId = requestAnimationFrame(tick);
  }

  public stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  public resize = (): void => {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssW = Math.max(320, rect.width);
    const cssH = Math.max(240, rect.height);

    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);

    // Keep consistent 720px virtual vertical scale on desktop, widen or fit nicely on smaller viewports
    if (cssW >= 820) {
      this.viewH = 720;
      this.viewW = Math.max(820, Math.min(1600, (cssW / cssH) * 720));
    } else {
      this.viewW = 820;
      this.viewH = Math.max(660, (cssH / cssW) * 820);
    }
  };

  private handleBlur = (): void => {
    this.heldKeys.clear();
    this.touchLeft = false;
    this.touchRight = false;
    this.jumpHeld = false;
  };

  private handleKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;
    if (
      ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)
    ) {
      e.preventDefault();
    }

    if (code === 'Escape' || code === 'KeyP') {
      if (this.screen === 'PLAYING') {
        this.setScreen('PAUSED');
      } else if (this.screen === 'PAUSED') {
        this.setScreen('PLAYING');
      }
      return;
    }

    if (this.screen !== 'PLAYING') return;

    gameAudio.unlock();
    const wasHeld = this.heldKeys.has(code);
    this.heldKeys.add(code);

    if (!wasHeld) {
      if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
        this.jumpBufferTimer = 0.12;
        this.jumpHeld = true;
      } else if (code === 'KeyE' || code === 'KeyF') {
        this.triggerWordWave();
      }
    }
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    const code = e.code;
    this.heldKeys.delete(code);
    if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') {
      this.jumpHeld = false;
      if (!this.isDoubleJumping && this.vy < -320) {
        this.vy *= 0.72;
      }
    }
  };

  // Touch controls API
  public setTouchMove(dir: 'left' | 'right', active: boolean): void {
    if (active) gameAudio.unlock();
    if (dir === 'left') this.touchLeft = active;
    else this.touchRight = active;
  }

  public triggerTouchJump(active: boolean): void {
    if (active) {
      gameAudio.unlock();
      this.jumpBufferTimer = 0.12;
      this.jumpHeld = true;
    } else {
      this.jumpHeld = false;
      if (!this.isDoubleJumping && this.vy < -320) {
        this.vy *= 0.72;
      }
    }
  }

  public triggerWordWave(): void {
    if (this.screen !== 'PLAYING' || this.waveCooldown > 0) return;

    this.waveCooldown = this.waveCooldownMax;
    gameAudio.playWave();
    this.waveRings.push({
      x: this.px + this.pw / 2,
      y: this.py + this.ph / 2,
      radius: 20,
      maxRadius: 230,
      alpha: 1,
    });

    // Spawn floating Georgian decorative letters in burst
    const burstChars = ['ა', 'ბ', 'გ', 'დ', 'ე', 'ს', 'ქ', 'ჰ'];
    for (let i = 0; i < 14; i++) {
      const ang = (Math.PI * 2 * i) / 14;
      const spd = 130 + Math.random() * 140;
      this.particles.push({
        x: this.px + this.pw / 2,
        y: this.py + this.ph / 2,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 40,
        life: 0.75,
        maxLife: 0.75,
        size: 16,
        color: '#d97706',
        char: burstChars[i % burstChars.length],
      });
    }

    // Calms/stuns nearby moving hazards!
    let stunnedAny = false;
    const cx = this.px + this.pw / 2;
    const cy = this.py + this.ph / 2;
    for (const h of this.hazards) {
      if (h.kind === 'flying_quill' || h.kind === 'rolling_stone') {
        const hx = h.x + h.w / 2;
        const hy = h.y + h.h / 2;
        const dist = Math.hypot(hx - cx, hy - cy);
        if (dist <= 245) {
          h.stunTimer = 3.5;
          stunnedAny = true;
        }
      }
    }

    // Repeat latest unlocked proverb or shout encouraging phrase
    const unlockedArr = Array.from(this.unlockedSet).sort((a, b) => a - b);
    if (stunnedAny) {
      this.showSpeech({
        speaker: 'იაკობი',
        text: WAVE_QUIPS[Math.floor(Math.random() * WAVE_QUIPS.length)],
        duration: 3.2,
      });
    } else if (unlockedArr.length > 0) {
      const latest = ALPHABET_ENTRIES[unlockedArr[unlockedArr.length - 1]];
      this.showSpeech({
        letter: latest.letter,
        speaker: latest.speaker,
        text: latest.saying,
        duration: 4.5,
      });
    } else {
      this.showSpeech({
        speaker: 'იაკობი',
        text: 'ასო „ა“-სკენ გავემართოთ — აი ია!',
        duration: 3.0,
      });
    }
    this.emitHud(true);
  }

  public startNewGame(startStageIndex = 0): void {
    gameAudio.unlock();
    this.hp = this.maxHp;
    this.score = 0;
    this.totalRunSeconds = 0;
    this.unlockedSet.clear();
    // Pre-unlock letters from earlier stages if player starts directly at a later stage
    for (let s = 0; s < startStageIndex; s++) {
      for (const l of STAGES[s].letters) {
        this.unlockedSet.add(l.alphabetIndex);
      }
    }
    this.loadStage(startStageIndex, true);
    this.setScreen('PLAYING');
  }

  public retryCurrentStage(): void {
    this.hp = this.maxHp;
    // Remove letters belonging to current stage so they can be re-collected in sequence
    for (const l of this.stage.letters) {
      this.unlockedSet.delete(l.alphabetIndex);
    }
    this.loadStage(this.stageIndex, true);
    this.setScreen('PLAYING');
  }

  public advanceToNextStage(): void {
    const next = this.stageIndex + 1;
    if (next < STAGES.length) {
      this.hp = Math.min(this.maxHp, this.hp + 1);
      this.loadStage(next, true);
      this.setScreen('PLAYING');
    } else {
      this.setScreen('VICTORY');
    }
  }

  public setScreen(nextScreen: GameScreenState): void {
    this.screen = nextScreen;
    if (nextScreen !== 'PLAYING') {
      this.heldKeys.clear();
      this.touchLeft = false;
      this.touchRight = false;
      this.jumpHeld = false;
      gameAudio.stopSpeech();
    }
    this.emitHud(true);
  }

  public getUnlockedIndices(): number[] {
    return Array.from(this.unlockedSet).sort((a, b) => a - b);
  }

  private loadStage(index: number, showIntroBubble: boolean): void {
    this.stageIndex = index;
    this.stage = STAGES[index];
    this.elapsedStageSeconds = 0;

    this.platforms = this.stage.platforms.map((p, i) => ({
      ...p,
      baseX: p.x,
      baseY: p.y,
      prevX: p.x,
      prevY: p.y,
      phase: i * 0.7,
      crumbleState: 'solid',
      crumbleTimer: 0,
    }));

    this.hazards = this.stage.hazards.map((h, i) => ({
      ...h,
      baseX: h.x,
      phase: i * 1.1,
      stunTimer: 0,
    }));

    this.letters = this.stage.letters.map((l, i) => ({
      ...l,
      collected: this.unlockedSet.has(l.alphabetIndex),
      bobPhase: i * 0.8,
    }));

    this.springs = this.stage.springs.map((s) => ({
      ...s,
      bounceAnim: 0,
    }));

    this.triggers = this.stage.roadsideTriggers.map((t, i) => ({
      ...t,
      triggered: false,
      bobPhase: i * 1.3,
    }));

    this.particles = [];
    this.waveRings = [];

    this.px = 100;
    this.py = 520;
    this.vx = 0;
    this.vy = 0;
    this.facing = 1;
    this.onGround = false;
    this.standingPlatform = null;
    this.jumpsRemaining = 2;
    this.coyoteTimer = 0;
    this.jumpBufferTimer = 0;
    this.invulnTimer = 0;
    this.waveCooldown = 0;
    this.lastSafeX = 100;
    this.lastSafeY = 520;
    this.camX = 0;
    this.camY = 0;
    this.missingLetterHint = null;
    this.missingHintTimer = 0;

    if (showIntroBubble) {
      this.showSpeech({
        speaker: 'იაკობი',
        text: this.stage.introQuote,
        duration: 4.2,
      });
    } else {
      this.speech = null;
    }

    this.emitHud(true);
  }

  private showSpeech(bubble: Omit<ActiveSpeechBubble, 'timer'>): void {
    this.speech = {
      ...bubble,
      timer: bubble.duration,
    };
    if (this.screen === 'PLAYING' || bubble.speaker === 'იაკობი') {
      void gameAudio.speakGeorgian(
        bubble.text,
        bubble.isWarning ? 'warning' : 'story'
      );
    }
  }

  private getNextExpectedLetterInStage(): RuntimeLetter | null {
    const uncollected = this.letters
      .filter((l) => !l.collected)
      .sort((a, b) => a.alphabetIndex - b.alphabetIndex);
    return uncollected[0] ?? null;
  }

  private update(dt: number, now: number): void {
    // Gentle ambient drifting leaves/motes even on title screen
    this.ambientTimer += dt;
    if (this.ambientTimer > 0.45 && this.particles.length < 48) {
      this.ambientTimer = 0;
      this.particles.push({
        x: this.camX + Math.random() * this.viewW,
        y: -15,
        vx: -18 - Math.random() * 25,
        vy: 28 + Math.random() * 28,
        life: 6.5,
        maxLife: 6.5,
        size: 4 + Math.random() * 3,
        color: this.stageIndex === 2 ? '#e6a87c' : '#d6b465',
      });
    }

    if (this.screen === 'TITLE_MENU') {
      // Gentle atmospheric camera pan for Title Backdrop
      this.camX = Math.sin(now * 0.00018) * 140 + 180;
      this.updateParticles(dt);
      return;
    }

    if (this.screen !== 'PLAYING') {
      return;
    }

    if (this.hitstopTimer > 0) {
      this.hitstopTimer = Math.max(0, this.hitstopTimer - dt);
      this.updateShake(dt);
      return;
    }

    this.elapsedStageSeconds += dt;
    this.totalRunSeconds += dt;

    if (this.invulnTimer > 0) this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    if (this.waveCooldown > 0) this.waveCooldown = Math.max(0, this.waveCooldown - dt);
    if (this.missingHintTimer > 0) {
      this.missingHintTimer = Math.max(0, this.missingHintTimer - dt);
      if (this.missingHintTimer === 0) this.missingLetterHint = null;
    }
    if (this.speech) {
      this.speech.timer -= dt;
      if (this.speech.timer <= 0) {
        this.speech = null;
      }
    }

    this.updatePlatforms(dt);
    this.updateHazards(dt);
    this.updatePlayer(dt);
    this.updateInteractions(dt);
    this.updateParticles(dt);
    this.updateWaveRings(dt);
    this.updateCamera(dt);
    this.updateShake(dt);

    if (now - this.lastHudEmit > 90) {
      this.emitHud(false, now);
    }
  }

  private updatePlatforms(dt: number): void {
    for (const p of this.platforms) {
      p.prevX = p.x;
      p.prevY = p.y;

      if (p.kind === 'moving') {
        const speed = p.moveSpeed ?? 1.5;
        const range = p.moveRange ?? 80;
        p.phase += dt * speed;
        if (p.moveAxis === 'y') {
          p.y = p.baseY + Math.sin(p.phase) * range;
        } else {
          p.x = p.baseX + Math.sin(p.phase) * range;
        }
      } else if (p.kind === 'crumble') {
        if (p.crumbleState === 'shaking') {
          p.crumbleTimer -= dt;
          if (p.crumbleTimer <= 0) {
            p.crumbleState = 'fallen';
            p.crumbleTimer = 2.8;
            this.spawnBurst(p.x + p.w / 2, p.y + 10, '#8c6b4f', 10);
          }
        } else if (p.crumbleState === 'fallen') {
          p.crumbleTimer -= dt;
          if (p.crumbleTimer <= 0) {
            p.crumbleState = 'solid';
          }
        }
      }
    }
  }

  private updateHazards(dt: number): void {
    for (const h of this.hazards) {
      if (h.stunTimer > 0) {
        h.stunTimer = Math.max(0, h.stunTimer - dt);
        continue;
      }
      if (h.kind === 'flying_quill' || h.kind === 'rolling_stone') {
        const range = h.patrolRange ?? 120;
        const speed = h.patrolSpeed ?? 2.0;
        h.phase += dt * speed;
        h.x = h.baseX + Math.sin(h.phase) * range;
      }
    }
  }

  private updatePlayer(dt: number): void {
    // Carry with moving platform if standing on one
    if (this.onGround && this.standingPlatform) {
      const dx = this.standingPlatform.x - this.standingPlatform.prevX;
      const dy = this.standingPlatform.y - this.standingPlatform.prevY;
      this.px += dx;
      this.py += dy;
    }

    const leftHeld =
      this.heldKeys.has('ArrowLeft') ||
      this.heldKeys.has('KeyA') ||
      this.touchLeft;
    const rightHeld =
      this.heldKeys.has('ArrowRight') ||
      this.heldKeys.has('KeyD') ||
      this.touchRight;

    const moveDir = (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);
    const maxSpeed = 355;
    const accel = this.onGround ? 2600 : 1900;
    const friction = this.onGround ? 2500 : 650;

    if (moveDir !== 0) {
      this.facing = moveDir > 0 ? 1 : -1;
      this.vx += moveDir * accel * dt;
      if (Math.abs(this.vx) > maxSpeed) {
        this.vx = moveDir * maxSpeed;
      }
    } else {
      if (Math.abs(this.vx) <= friction * dt) {
        this.vx = 0;
      } else {
        this.vx -= Math.sign(this.vx) * friction * dt;
      }
    }

    // Coyote time & jump buffer
    if (this.onGround) {
      this.coyoteTimer = 0.11;
      this.jumpsRemaining = 2;
      this.isDoubleJumping = false;
    } else {
      this.coyoteTimer = Math.max(0, this.coyoteTimer - dt);
    }

    if (this.jumpBufferTimer > 0) {
      this.jumpBufferTimer = Math.max(0, this.jumpBufferTimer - dt);
      if (this.coyoteTimer > 0) {
        this.vy = -750;
        this.onGround = false;
        this.standingPlatform = null;
        this.coyoteTimer = 0;
        this.jumpBufferTimer = 0;
        this.jumpsRemaining = 1;
        this.isDoubleJumping = false;
        this.squashX = 0.82;
        this.squashY = 1.22;
        this.spawnBurst(this.px + this.pw / 2, this.py + this.ph, '#e7d9bc', 6);
        gameAudio.playJump(false);
      } else if (this.jumpsRemaining > 0) {
        this.vy = -720;
        this.jumpsRemaining = 0;
        this.isDoubleJumping = true;
        this.jumpBufferTimer = 0;
        this.squashX = 0.8;
        this.squashY = 1.24;
        this.waveRings.push({
          x: this.px + this.pw / 2,
          y: this.py + this.ph - 4,
          radius: 8,
          maxRadius: 58,
          alpha: 0.9,
        });
        this.spawnBurst(this.px + this.pw / 2, this.py + this.ph, '#fef3c7', 10);
        gameAudio.playJump(true);
      }
    }

    // Gravity
    this.vy = Math.min(960, this.vy + 1950 * dt);

    // Horizontal move + collision
    this.px += this.vx * dt;
    if (this.px < 10) {
      this.px = 10;
      this.vx = 0;
    }
    if (this.px + this.pw > this.stage.worldWidth - 10) {
      this.px = this.stage.worldWidth - 10 - this.pw;
      this.vx = 0;
    }

    for (const p of this.platforms) {
      if (p.kind === 'crumble' && p.crumbleState === 'fallen') continue;
      if (p.kind !== 'ground') continue; // Thin floating platforms are one-way from above!
      if (this.aabbOverlap(this.px, this.py, this.pw, this.ph, p.x, p.y, p.w, p.h)) {
        if (this.vx > 0) {
          this.px = p.x - this.pw;
        } else if (this.vx < 0) {
          this.px = p.x + p.w;
        }
        this.vx = 0;
      }
    }

    // Vertical move + collision
    const prevBottom = this.py + this.ph;
    const wasOnGround = this.onGround;
    this.py += this.vy * dt;
    this.onGround = false;
    this.standingPlatform = null;

    for (const p of this.platforms) {
      if (p.kind === 'crumble' && p.crumbleState === 'fallen') continue;

      const overlapsX = this.px + this.pw - 4 > p.x && this.px + 4 < p.x + p.w;
      if (!overlapsX) continue;

      // Landing on top
      if (
        this.vy >= 0 &&
        prevBottom <= p.y + 16 &&
        this.py + this.ph >= p.y
      ) {
        this.py = p.y - this.ph;
        if (!wasOnGround && this.vy > 220) {
          this.squashX = 1.2;
          this.squashY = 0.82;
          gameAudio.playLand();
          this.spawnBurst(this.px + this.pw / 2, this.py + this.ph, '#d9c6a3', 5);
        }
        this.vy = 0;
        this.onGround = true;
        this.standingPlatform = p;

        if (p.kind === 'ground') {
          this.lastSafeX = Math.max(40, Math.min(this.px, p.x + p.w - this.pw - 20));
          this.lastSafeY = p.y - this.ph - 4;
        }

        if (p.kind === 'crumble' && p.crumbleState === 'solid') {
          p.crumbleState = 'shaking';
          p.crumbleTimer = 0.55;
        }
      } else if (
        p.kind === 'ground' &&
        this.vy < 0 &&
        this.py <= p.y + p.h &&
        this.py + this.ph > p.y + p.h
      ) {
        this.py = p.y + p.h;
        this.vy = 0;
      }
    }

    // Recover squash & stretch smoothly
    this.squashX += (1 - this.squashX) * Math.min(1, dt * 14);
    this.squashY += (1 - this.squashY) * Math.min(1, dt * 14);

    if (this.onGround && Math.abs(this.vx) > 25) {
      this.walkAnimTime += dt * (Math.abs(this.vx) / 60);
    } else {
      this.walkAnimTime = 0;
    }

    // Pit fall check
    if (this.py > 760) {
      this.handleHazardDamage(true);
    }
  }

  private updateInteractions(dt: number): void {
    const cx = this.px + this.pw / 2;
    const cy = this.py + this.ph / 2;

    // Springs
    for (const sp of this.springs) {
      if (sp.bounceAnim > 0) sp.bounceAnim = Math.max(0, sp.bounceAnim - dt * 4);
      if (
        this.vy >= 0 &&
        this.aabbOverlap(this.px, this.py, this.pw, this.ph, sp.x - 20, sp.y - 18, 40, 22)
      ) {
        this.vy = -1020;
        this.onGround = false;
        this.standingPlatform = null;
        this.jumpsRemaining = 1;
        this.squashX = 0.76;
        this.squashY = 1.3;
        sp.bounceAnim = 1;
        gameAudio.playSpring();
        this.spawnBurst(sp.x, sp.y - 6, '#1e293b', 9);
      }
    }

    // Letter Shrines (ა -> ჰ)
    const nextExpected = this.getNextExpectedLetterInStage();
    for (const l of this.letters) {
      l.bobPhase += dt * 3;
      if (l.collected) continue;

      const dist = Math.hypot(cx - l.x, cy - l.y);
      // Gentle magnetic pull for the active next letter
      if (nextExpected && l.alphabetIndex === nextExpected.alphabetIndex && dist < 85) {
        l.x += (cx - l.x) * dt * 6;
        l.y += (cy - l.y) * dt * 6;
      }

      if (dist < 46) {
        if (nextExpected && l.alphabetIndex !== nextExpected.alphabetIndex) {
          const nowSec = performance.now() / 1000;
          if (nowSec - this.lastOrderWarnTime > 2.2) {
            this.lastOrderWarnTime = nowSec;
            const expectedEntry = ALPHABET_ENTRIES[nextExpected.alphabetIndex];
            this.showSpeech({
              speaker: 'დედა ენა',
              text: `ნელა, იაკობ! ჯერ ასო „${expectedEntry.letter}“ აიღე ანბანის რიგით!`,
              isWarning: true,
              duration: 2.8,
            });
            gameAudio.playQuip();
          }
          continue;
        }

        // Collect letter!
        l.collected = true;
        this.unlockedSet.add(l.alphabetIndex);
        this.score += 100;
        const entry = ALPHABET_ENTRIES[l.alphabetIndex];
        gameAudio.playLetterCollect(entry.index);
        this.spawnBurst(l.x, l.y, '#f59e0b', 18, entry.letter);
        this.showSpeech({
          letter: entry.letter,
          speaker: entry.speaker,
          text: entry.saying,
          duration: 5.5,
        });
        this.emitHud(true);
      }
    }

    // Roadside NPC encounters (random/placed witty Nela Zviadi style quips)
    for (const tr of this.triggers) {
      tr.bobPhase += dt * 2.5;
      if (tr.triggered) continue;
      if (Math.abs(cx - tr.x) < 58 && Math.abs(cy - tr.y) < 90) {
        tr.triggered = true;
        gameAudio.playQuip();
        this.score += 25;
        // Only show roadside NPC speech when an active letter proverb isn't still speaking
        if (!this.speech || !this.speech.letter || this.speech.timer <= 0.5) {
          const speakerLabel =
            tr.npcKind === 'sparrow'
              ? 'ბეღურა'
              : tr.npcKind === 'student'
              ? 'მოსწავლე'
              : tr.npcKind === 'owl'
              ? 'ბრძენი ბუ'
              : 'მწყემსი';
          this.showSpeech({
            speaker: speakerLabel,
            text: tr.quip,
            duration: 3.6,
          });
        }
        this.spawnBurst(tr.x, tr.y - 20, '#fde68a', 8);
      }
    }

    // Hazards
    if (this.invulnTimer <= 0) {
      for (const h of this.hazards) {
        if (h.stunTimer > 0) continue;
        // Slightly forgiving hitbox (inset 5px)
        if (
          this.aabbOverlap(
            this.px + 5,
            this.py + 5,
            this.pw - 10,
            this.ph - 8,
            h.x + 4,
            h.y + 4,
            h.w - 8,
            h.h - 6
          )
        ) {
          this.handleHazardDamage(false);
          break;
        }
      }
    }

    // Finish Archway check
    if (Math.abs(cx - this.stage.finishX) < 48 && Math.abs(cy - (this.stage.finishY - 60)) < 90) {
      const remaining = this.getNextExpectedLetterInStage();
      if (remaining) {
        const entry = ALPHABET_ENTRIES[remaining.alphabetIndex];
        this.missingLetterHint = `ჯერ ასო „${entry.letter}“ აიღე!`;
        this.missingHintTimer = 2.5;
        if (!this.speech || this.speech.text !== this.missingLetterHint) {
          this.showSpeech({
            speaker: 'დედა ენა',
            text: `ნელა, იაკობ! ჯერ ასო „${entry.letter}“ დაგრჩა ასაღები!`,
            isWarning: true,
            duration: 2.8,
          });
          gameAudio.playQuip();
        }
      } else {
        this.score += 250;
        if (this.stageIndex >= STAGES.length - 1) {
          gameAudio.playVictory();
          this.setScreen('VICTORY');
        } else {
          gameAudio.playStageClear();
          this.setScreen('STAGE_CLEAR');
        }
      }
    }
  }

  private handleHazardDamage(fromPit: boolean): void {
    this.hp -= 1;
    this.hitstopTimer = 0.048;
    this.shakeTimer = 0.28;
    this.shakeIntensity = 9;
    this.invulnTimer = 1.35;
    gameAudio.playHurt();

    const quipPool = fromPit ? FALL_QUIPS : HAZARD_QUIPS;
    const quip = quipPool[Math.floor(Math.random() * quipPool.length)];
    this.showSpeech({
      speaker: 'ნელა, იაკობ!',
      text: quip,
      isWarning: true,
      duration: 3.4,
    });
    this.spawnBurst(this.px + this.pw / 2, this.py + this.ph / 2, '#dc2626', 14);

    if (this.hp <= 0) {
      this.hp = 0;
      this.setScreen('GAME_OVER');
      return;
    }

    if (fromPit) {
      this.px = this.lastSafeX;
      this.py = this.lastSafeY;
      this.vx = 0;
      this.vy = 0;
    } else {
      this.vy = -440;
      this.vx = -this.facing * 240;
    }
    this.emitHud(true);
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (!p.char) {
        p.vy += 280 * dt;
      }
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  }

  private updateWaveRings(dt: number): void {
    for (let i = this.waveRings.length - 1; i >= 0; i--) {
      const w = this.waveRings[i];
      w.radius += 540 * dt;
      w.alpha = Math.max(0, 1 - w.radius / w.maxRadius);
      if (w.radius >= w.maxRadius) {
        this.waveRings.splice(i, 1);
      }
    }
  }

  private updateCamera(dt: number): void {
    const lookAhead = this.facing * 90;
    const targetX = Math.max(
      0,
      Math.min(
        this.stage.worldWidth - this.viewW,
        this.px + this.pw / 2 + lookAhead - this.viewW * 0.42
      )
    );
    this.camX += (targetX - this.camX) * Math.min(1, dt * 6.5);
    this.camY = 0;
  }

  private updateShake(dt: number): void {
    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
    }
  }

  private spawnBurst(
    x: number,
    y: number,
    color: string,
    count: number,
    char?: string
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length > 90) break;
      const ang = Math.random() * Math.PI * 2;
      const spd = 60 + Math.random() * 170;
      this.particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd - 90,
        life: 0.45 + Math.random() * 0.35,
        maxLife: 0.8,
        size: char ? 16 : 3 + Math.random() * 4,
        color,
        char: i % 3 === 0 ? char : undefined,
      });
    }
  }

  private aabbOverlap(
    ax: number,
    ay: number,
    aw: number,
    ah: number,
    bx: number,
    by: number,
    bw: number,
    bh: number
  ): boolean {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  private emitHud(force: boolean, now = performance.now()): void {
    if (!force && now - this.lastHudEmit < 90) return;
    this.lastHudEmit = now;

    const nextLetter = this.getNextExpectedLetterInStage();
    const collectedInStage = this.letters.filter((l) => l.collected).length;

    this.onHudChange({
      screen: this.screen,
      stageIndex: this.stageIndex,
      totalStages: STAGES.length,
      stageTitle: this.stage.title,
      hp: this.hp,
      maxHp: this.maxHp,
      unlockedIndices: this.getUnlockedIndices(),
      stageCollectedCount: collectedInStage,
      stageTotalLetters: this.letters.length,
      nextAlphabetIndex: nextLetter ? nextLetter.alphabetIndex : null,
      activeSpeech: this.speech ? {...this.speech} : null,
      waveCooldownRatio: this.waveCooldown / this.waveCooldownMax,
      elapsedStageSeconds: Math.floor(this.elapsedStageSeconds),
      totalRunSeconds: Math.floor(this.totalRunSeconds),
      score: this.score,
      missingLetterHint: this.missingLetterHint,
    });
  }

  // ==================== RENDERING ====================
  private render(now: number): void {
    const ctx = this.ctx;
    const scaleX = this.canvas.width / this.viewW;
    const scaleY = this.canvas.height / this.viewH;
    const scale = Math.min(scaleX, scaleY);

    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);

    // Camera shake offset
    let sx = 0;
    let sy = 0;
    if (this.shakeTimer > 0) {
      const mag = (this.shakeTimer / 0.28) * this.shakeIntensity;
      sx = (Math.random() * 2 - 1) * mag;
      sy = (Math.random() * 2 - 1) * mag;
    }

    this.renderBackground(ctx, now);

    ctx.save();
    ctx.translate(-this.camX + sx, -this.camY + sy);

    this.renderPlatforms(ctx);
    this.renderSprings(ctx);
    this.renderFinishArch(ctx, now);
    this.renderRoadsideNpcs(ctx);
    this.renderLetters(ctx, now);
    this.renderHazards(ctx, now);
    this.renderWaveRings(ctx);
    this.renderPlayer(ctx, now);
    this.renderParticles(ctx);

    if (this.screen === 'PLAYING' && this.speech) {
      this.renderSpeechBubble(ctx, this.speech);
    }

    ctx.restore();
    ctx.restore();
  }

  private renderBackground(ctx: CanvasRenderingContext2D, now: number): void {
    const pal = this.stage.palette;
    const grad = ctx.createLinearGradient(0, 0, 0, this.viewH);
    grad.addColorStop(0, pal.skyTop);
    grad.addColorStop(0.65, pal.skyBottom);
    grad.addColorStop(1, pal.skyBottom);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.viewW, this.viewH);

    // Warm sun with soft halo & gentle diagonal sunbeams
    const sunX = this.viewW * 0.78 - this.camX * 0.035;
    const sunY = 122;
    ctx.save();
    for (let r = 0; r < 5; r++) {
      const angle = -0.35 + r * 0.22 + Math.sin(now * 0.0004 + r) * 0.03;
      ctx.fillStyle = 'rgba(255, 248, 214, 0.11)';
      ctx.beginPath();
      ctx.moveTo(sunX, sunY);
      ctx.lineTo(sunX + Math.cos(angle - 0.06) * 900, sunY + Math.sin(angle - 0.06) * 900 + 380);
      ctx.lineTo(sunX + Math.cos(angle + 0.06) * 900, sunY + Math.sin(angle + 0.06) * 900 + 380);
      ctx.closePath();
      ctx.fill();
    }
    const halo = ctx.createRadialGradient(sunX, sunY, 18, sunX, sunY, 135);
    halo.addColorStop(0, 'rgba(255, 249, 224, 0.96)');
    halo.addColorStop(0.35, 'rgba(245, 158, 11, 0.28)');
    halo.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, 135, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Stage 5: faint shimmering golden Georgian letters high in the morning sky
    if (this.stageIndex === 4) {
      ctx.save();
      const skyChars = ['ა', 'ბ', 'გ', 'დ', 'ე', 'ვ', 'ზ', 'თ', 'ი', 'ჰ'];
      ctx.font = '700 28px "Noto Serif Georgian", serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < skyChars.length; i++) {
        const lx = ((i * 210 - this.camX * 0.06 + now * 0.012) % (this.viewW + 180)) - 60;
        const ly = 90 + (i % 3) * 52 + Math.sin(now * 0.0015 + i) * 8;
        ctx.fillStyle = 'rgba(180, 83, 9, 0.13)';
        ctx.fillText(skyChars[i], lx, ly);
      }
      ctx.restore();
    }

    // Layered storybook clouds
    for (let i = 0; i < 6; i++) {
      const cx = ((i * 340 - this.camX * 0.07 + now * 0.008) % (this.viewW + 320)) - 130;
      const cy = 72 + (i % 3) * 46;
      ctx.fillStyle = 'rgba(255, 252, 245, 0.62)';
      ctx.beginPath();
      ctx.ellipse(cx, cy, 58, 21, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 36, cy - 9, 44, 19, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 34, cy + 4, 36, 15, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Distant soaring birds
    ctx.save();
    ctx.strokeStyle = 'rgba(65, 48, 34, 0.45)';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    for (let b = 0; b < 5; b++) {
      const bx = ((b * 290 + now * 0.028 - this.camX * 0.1) % (this.viewW + 180)) - 60;
      const by = 125 + (b % 3) * 34 + Math.sin(now * 0.003 + b) * 7;
      const wing = Math.sin(now * 0.009 + b * 1.7) * 4;
      ctx.beginPath();
      ctx.moveTo(bx - 9, by + wing);
      ctx.quadraticCurveTo(bx - 4, by - 4, bx, by);
      ctx.quadraticCurveTo(bx + 4, by - 4, bx + 9, by + wing);
      ctx.stroke();
    }
    ctx.restore();

    // Far Caucasus peaks with snow caps (parallax 0.14)
    const farStep = 240;
    const farShift = (this.camX * 0.14) % farStep;
    const farBaseIdx = Math.floor((this.camX * 0.14) / farStep);
    for (let i = -1; i <= Math.ceil(this.viewW / farStep) + 1; i++) {
      const px = i * farStep - farShift;
      const worldIdx = farBaseIdx + i;
      const seed = Math.abs(Math.sin(worldIdx * 1.37));
      const peakX = px + farStep * 0.5;
      const peakY = 215 + seed * 95;
      const baseRightX = px + farStep + 40;
      const baseLeftX = px - 40;

      // Shaded mountain body
      ctx.fillStyle = pal.mountainFar;
      ctx.beginPath();
      ctx.moveTo(baseLeftX, this.viewH);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(baseRightX, this.viewH);
      ctx.closePath();
      ctx.fill();

      // Sunlit right ridge highlight
      ctx.fillStyle = 'rgba(255, 250, 235, 0.18)';
      ctx.beginPath();
      ctx.moveTo(peakX, peakY);
      ctx.lineTo(baseRightX, this.viewH);
      ctx.lineTo(peakX + 18, this.viewH);
      ctx.closePath();
      ctx.fill();

      // Snow cap on tall Caucasus summits
      if (peakY < 285) {
        ctx.fillStyle = 'rgba(255, 253, 248, 0.72)';
        ctx.beginPath();
        ctx.moveTo(peakX, peakY);
        ctx.lineTo(peakX + 36, peakY + 46);
        ctx.lineTo(peakX + 10, peakY + 38);
        ctx.lineTo(peakX - 6, peakY + 48);
        ctx.lineTo(peakX - 32, peakY + 40);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Soft valley mist band between far and near mountains
    const mist = ctx.createLinearGradient(0, 320, 0, 440);
    mist.addColorStop(0, 'rgba(255, 250, 238, 0)');
    mist.addColorStop(0.5, 'rgba(255, 250, 238, 0.28)');
    mist.addColorStop(1, 'rgba(255, 250, 238, 0)');
    ctx.fillStyle = mist;
    ctx.fillRect(0, 320, this.viewW, 120);

    // Near mountains & ridge watchtowers / chapels (parallax 0.28)
    const nearStep = 210;
    const nearShift = (this.camX * 0.28) % nearStep;
    const nearBaseIdx = Math.floor((this.camX * 0.28) / nearStep);
    for (let i = -1; i <= Math.ceil(this.viewW / nearStep) + 1; i++) {
      const px = i * nearStep - nearShift;
      const worldIdx = nearBaseIdx + i;
      const seed = Math.abs(Math.cos(worldIdx * 1.91));
      const peakX = px + nearStep * 0.48;
      const peakY = 325 + seed * 85;

      ctx.fillStyle = pal.mountainNear;
      ctx.beginPath();
      ctx.moveTo(px - 35, this.viewH);
      ctx.lineTo(peakX, peakY);
      ctx.lineTo(px + nearStep + 35, this.viewH);
      ctx.closePath();
      ctx.fill();

      // Georgian watchtower or domed chapel silhouette on periodic ridges
      if (Math.abs(worldIdx) % 3 === 1) {
        const tx = peakX - 8;
        const ty = peakY + 8;
        ctx.fillStyle = pal.mountainNear;
        if (Math.abs(worldIdx) % 2 === 1) {
          // Stone watchtower (კოშკი)
          ctx.fillRect(tx, ty - 28, 16, 34);
          ctx.fillRect(tx - 2, ty - 33, 20, 6);
        } else {
          // Domed Georgian church silhouette
          ctx.fillRect(tx - 10, ty - 14, 28, 22);
          ctx.fillRect(tx - 1, ty - 26, 10, 14);
          ctx.beginPath();
          ctx.moveTo(tx - 3, ty - 26);
          ctx.lineTo(tx + 4, ty - 37);
          ctx.lineTo(tx + 11, ty - 26);
          ctx.closePath();
          ctx.fill();
        }
      }
    }

    // Rolling Kartli hills (parallax 0.46)
    const hillHeightAt = (screenX: number) => {
      const wx = screenX + this.camX * 0.46;
      return 472 + Math.sin(wx * 0.0045) * 32 + Math.cos(wx * 0.009) * 15;
    };

    ctx.fillStyle = pal.hillColor;
    ctx.beginPath();
    ctx.moveTo(0, this.viewH);
    for (let x = 0; x <= this.viewW + 40; x += 32) {
      ctx.lineTo(x, hillHeightAt(x));
    }
    ctx.lineTo(this.viewW, this.viewH);
    ctx.closePath();
    ctx.fill();

    // Midground Georgian houses, cypresses, walnut trees & vineyards along the hills (parallax 0.46)
    const propStep = 175;
    const propShift = (this.camX * 0.46) % propStep;
    const propBaseIdx = Math.floor((this.camX * 0.46) / propStep);

    for (let i = -1; i <= Math.ceil(this.viewW / propStep) + 1; i++) {
      const sx = i * propStep - propShift + 55;
      const worldIdx = propBaseIdx + i;
      const sy = hillHeightAt(sx) + 6;
      const kind = ((worldIdx % 5) + 5) % 5;

      if (kind === 0) {
        // Traditional Georgian balcony cottage with smoking chimney
        const hw = 48;
        const hh = 32;
        ctx.fillStyle = '#e7dcc8';
        ctx.fillRect(sx - hw / 2, sy - hh, hw, hh);
        // Wooden balcony strip
        ctx.fillStyle = '#7c5333';
        ctx.fillRect(sx - hw / 2 - 3, sy - 16, hw + 6, 4);
        for (let rx = sx - hw / 2; rx <= sx + hw / 2; rx += 8) {
          ctx.fillRect(rx, sy - 16, 2, 16);
        }
        // Warm lit windows
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(sx - 14, sy - 27, 8, 8);
        ctx.fillRect(sx + 6, sy - 27, 8, 8);
        // Terracotta clay roof
        ctx.fillStyle = this.stageIndex === 2 ? '#9a3412' : '#b45309';
        ctx.beginPath();
        ctx.moveTo(sx - hw / 2 - 6, sy - hh);
        ctx.lineTo(sx, sy - hh - 18);
        ctx.lineTo(sx + hw / 2 + 6, sy - hh);
        ctx.closePath();
        ctx.fill();
        // Chimney + gentle smoke puff
        ctx.fillStyle = '#6b4d37';
        ctx.fillRect(sx + 10, sy - hh - 16, 6, 12);
        const smokeDrift = Math.sin(now * 0.002 + worldIdx) * 4;
        ctx.fillStyle = 'rgba(255, 252, 245, 0.35)';
        ctx.beginPath();
        ctx.arc(sx + 13 + smokeDrift, sy - hh - 23, 5, 0, Math.PI * 2);
        ctx.arc(sx + 16 + smokeDrift * 1.4, sy - hh - 32, 7, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 1 || kind === 3) {
        // Pair of slender Georgian cypress trees
        for (const offset of [-14, 14]) {
          const tx = sx + offset;
          const th = offset < 0 ? 54 : 42;
          ctx.fillStyle = '#4d3a2c';
          ctx.fillRect(tx - 2, sy - 10, 4, 14);
          ctx.fillStyle = this.stageIndex === 3 ? '#365347' : '#3d5a2c';
          ctx.beginPath();
          ctx.ellipse(tx, sy - th / 2 - 4, 8.5, th / 2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (kind === 2) {
        // Vineyard trellis row (ვაზის რიგი)
        ctx.strokeStyle = '#6b4d37';
        ctx.lineWidth = 2.5;
        for (let px = -28; px <= 28; px += 18) {
          ctx.beginPath();
          ctx.moveTo(sx + px, sy + 6);
          ctx.lineTo(sx + px, sy - 20);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.moveTo(sx - 30, sy - 14);
        ctx.lineTo(sx + 30, sy - 14);
        ctx.stroke();
        ctx.fillStyle = '#4d7c0f';
        for (let vx = -22; vx <= 22; vx += 11) {
          ctx.beginPath();
          ctx.arc(sx + vx, sy - 15, 7, 0, Math.PI * 2);
          ctx.fill();
          // Tiny grape cluster
          ctx.fillStyle = '#6b21a8';
          ctx.beginPath();
          ctx.arc(sx + vx, sy - 9, 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4d7c0f';
        }
      } else {
        // Lush walnut / linden tree (or glowing Tbilisi lantern on stage 3)
        if (this.stageIndex === 2) {
          ctx.fillStyle = '#292524';
          ctx.fillRect(sx - 2, sy - 42, 4, 48);
          ctx.fillStyle = '#f59e0b';
          ctx.beginPath();
          ctx.arc(sx, sy - 45, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(245, 158, 11, 0.22)';
          ctx.beginPath();
          ctx.arc(sx, sy - 45, 18, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillStyle = '#5c4028';
          ctx.fillRect(sx - 4, sy - 22, 8, 28);
          ctx.fillStyle = '#4d6b34';
          ctx.beginPath();
          ctx.arc(sx, sy - 34, 18, 0, Math.PI * 2);
          ctx.arc(sx - 12, sy - 26, 13, 0, Math.PI * 2);
          ctx.arc(sx + 12, sy - 26, 13, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  private renderPlatforms(ctx: CanvasRenderingContext2D): void {
    const pal = this.stage.palette;
    for (const p of this.platforms) {
      if (p.x + p.w < this.camX - 60 || p.x > this.camX + this.viewW + 60) continue;
      if (p.kind === 'crumble' && p.crumbleState === 'fallen') {
        ctx.save();
        ctx.strokeStyle = 'rgba(120, 80, 40, 0.25)';
        ctx.setLineDash([6, 6]);
        ctx.strokeRect(p.x, p.y, p.w, p.h);
        ctx.restore();
        continue;
      }

      const shakeOffsetX =
        p.kind === 'crumble' && p.crumbleState === 'shaking'
          ? (Math.random() - 0.5) * 5
          : 0;
      const drawX = p.x + shakeOffsetX;
      const drawY = p.y;

      if (p.kind === 'ground') {
        ctx.fillStyle = pal.groundBody;
        ctx.fillRect(drawX, drawY + 12, p.w, p.h - 12);

        // Stone & pebble texture
        ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
        for (let bx = drawX + 18; bx < drawX + p.w - 24; bx += 64) {
          ctx.fillRect(bx, drawY + 34, 28, 10);
          ctx.fillRect(bx + 20, drawY + 66, 22, 9);
        }

        // Lush grass/earth cap
        ctx.fillStyle = pal.groundTop;
        ctx.beginPath();
        ctx.roundRect(drawX - 2, drawY, p.w + 4, 18, 6);
        ctx.fill();

        // Foreground grass tufts & Georgian wildflowers (violets "ია" & poppies)
        for (let fx = drawX + 28; fx < drawX + p.w - 28; fx += 78) {
          ctx.strokeStyle = pal.groundTop;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(fx, drawY + 2);
          ctx.lineTo(fx - 4, drawY - 7);
          ctx.moveTo(fx + 3, drawY + 2);
          ctx.lineTo(fx + 6, drawY - 8);
          ctx.stroke();

          if (Math.floor(fx) % 2 === 0) {
            // Violet blossom ("აი ია!")
            ctx.fillStyle = '#7c3aed';
            ctx.beginPath();
            ctx.arc(fx + 6, drawY - 9, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(fx + 6, drawY - 9, 1.2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Wild red poppy
            ctx.fillStyle = '#dc2626';
            ctx.beginPath();
            ctx.arc(fx - 4, drawY - 8, 3, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        const fillColor =
          p.kind === 'stone'
            ? '#64748b'
            : p.kind === 'moving'
            ? '#9a6b3b'
            : p.kind === 'crumble'
            ? '#a38262'
            : pal.platformColor;

        ctx.fillStyle = fillColor;
        ctx.beginPath();
        ctx.roundRect(drawX, drawY, p.w, p.h, 7);
        ctx.fill();

        ctx.strokeStyle = 'rgba(35, 26, 20, 0.45)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Top highlight bevel
        ctx.fillStyle =
          p.kind === 'stone'
            ? 'rgba(226, 232, 240, 0.35)'
            : 'rgba(254, 243, 199, 0.32)';
        ctx.fillRect(drawX + 6, drawY + 3, p.w - 12, 4);

        // Subtle stone seams or wood nails
        if (p.kind === 'stone') {
          ctx.strokeStyle = 'rgba(30, 41, 59, 0.35)';
          ctx.lineWidth = 1.5;
          for (let sx = drawX + 42; sx < drawX + p.w - 20; sx += 44) {
            ctx.beginPath();
            ctx.moveTo(sx, drawY + 4);
            ctx.lineTo(sx, drawY + p.h - 4);
            ctx.stroke();
          }
        } else if (p.kind === 'wood' || p.kind === 'moving') {
          ctx.fillStyle = 'rgba(40, 26, 16, 0.45)';
          ctx.beginPath();
          ctx.arc(drawX + 12, drawY + p.h / 2, 2, 0, Math.PI * 2);
          ctx.arc(drawX + p.w - 12, drawY + p.h / 2, 2, 0, Math.PI * 2);
          ctx.fill();
        }

        if (p.kind === 'crumble') {
          ctx.strokeStyle = 'rgba(55, 35, 20, 0.65)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(drawX + p.w * 0.35, drawY + 2);
          ctx.lineTo(drawX + p.w * 0.42, drawY + p.h - 2);
          ctx.moveTo(drawX + p.w * 0.68, drawY + 2);
          ctx.lineTo(drawX + p.w * 0.62, drawY + p.h - 2);
          ctx.stroke();
        }
      }
    }
  }

  private renderSprings(ctx: CanvasRenderingContext2D): void {
    for (const sp of this.springs) {
      const compression = sp.bounceAnim * 6;
      // Brass inkwell spring
      ctx.save();
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.roundRect(sp.x - 16, sp.y - 4 + compression, 32, 22 - compression, 5);
      ctx.fill();

      ctx.fillStyle = '#d97706';
      ctx.beginPath();
      ctx.roundRect(sp.x - 19, sp.y - 10 + compression, 38, 9, 4);
      ctx.fill();

      // Upward arrow glyph
      ctx.fillStyle = '#fef3c7';
      ctx.font = 'bold 12px "Noto Sans Georgian", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('▲', sp.x, sp.y + 12);
      ctx.restore();
    }
  }

  private renderFinishArch(ctx: CanvasRenderingContext2D, now: number): void {
    const fx = this.stage.finishX;
    const fy = this.stage.finishY;
    const remaining = this.getNextExpectedLetterInStage();
    const isReady = remaining === null;

    ctx.save();
    // Stone pillars
    ctx.fillStyle = '#d6c7ae';
    ctx.strokeStyle = '#5c4b37';
    ctx.lineWidth = 2.5;
    ctx.fillRect(fx - 46, fy - 126, 20, 126);
    ctx.strokeRect(fx - 46, fy - 126, 20, 126);
    ctx.fillRect(fx + 26, fy - 126, 20, 126);
    ctx.strokeRect(fx + 26, fy - 126, 20, 126);

    // Arch top
    ctx.beginPath();
    ctx.arc(fx, fy - 124, 46, Math.PI, 0);
    ctx.lineTo(fx + 46, fy - 110);
    ctx.arc(fx, fy - 124, 26, 0, Math.PI, true);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Glowing lantern inside arch
    const glowPulse = 0.75 + Math.sin(now * 0.005) * 0.25;
    const lanternColor = isReady ? `rgba(245, 158, 11, ${0.42 * glowPulse})` : 'rgba(148, 163, 184, 0.2)';
    ctx.fillStyle = lanternColor;
    ctx.beginPath();
    ctx.arc(fx, fy - 92, 34, 0, Math.PI * 2);
    ctx.fill();

    // Deda Ena crest on keystone
    ctx.fillStyle = isReady ? '#b45309' : '#64748b';
    ctx.beginPath();
    ctx.arc(fx, fy - 156, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fffbeb';
    ctx.font = 'bold 14px "Noto Serif Georgian", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(isReady ? '✓' : 'ა', fx, fy - 155);

    // Label below arch
    ctx.fillStyle = '#292018';
    ctx.font = '600 12px "Noto Sans Georgian", sans-serif';
    ctx.fillText(isReady ? 'ფინიში' : 'შეაგროვე ასოები', fx, fy - 182);
    ctx.restore();
  }

  private renderRoadsideNpcs(ctx: CanvasRenderingContext2D): void {
    for (const tr of this.triggers) {
      if (tr.x < this.camX - 80 || tr.x > this.camX + this.viewW + 80) continue;
      const bob = Math.sin(tr.bobPhase) * 3;
      const x = tr.x;
      const y = tr.y + bob;

      ctx.save();
      if (tr.npcKind === 'sparrow') {
        // Wooden post + cute sparrow
        ctx.fillStyle = '#7c5838';
        ctx.fillRect(x - 3, tr.y + 8, 6, 42);
        ctx.fillStyle = '#a16207';
        ctx.beginPath();
        ctx.ellipse(x, y, 13, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(x + 6, y - 4, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(x + 8, y - 5, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (tr.npcKind === 'owl') {
        ctx.fillStyle = '#6b4d37';
        ctx.fillRect(x - 4, tr.y + 12, 8, 38);
        ctx.fillStyle = '#78350f';
        ctx.beginPath();
        ctx.ellipse(x, y - 2, 14, 17, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(x - 5, y - 6, 4.5, 0, Math.PI * 2);
        ctx.arc(x + 5, y - 6, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(x - 5, y - 6, 2, 0, Math.PI * 2);
        ctx.arc(x + 5, y - 6, 2, 0, Math.PI * 2);
        ctx.fill();
      } else if (tr.npcKind === 'student') {
        // Little Georgian student holding slate
        ctx.fillStyle = '#1e3a8a';
        ctx.beginPath();
        ctx.roundRect(x - 10, y + 6, 20, 32, 5);
        ctx.fill();
        ctx.fillStyle = '#f5d0a9';
        ctx.beginPath();
        ctx.arc(x, y - 4, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#292018';
        ctx.beginPath();
        ctx.arc(x, y - 7, 10, Math.PI, 0);
        ctx.fill();
        // Slate tablet
        ctx.fillStyle = '#334155';
        ctx.fillRect(x - 15, y + 10, 12, 16);
      } else {
        // Shepherd with papakhi hat
        ctx.fillStyle = '#4d3929';
        ctx.beginPath();
        ctx.roundRect(x - 12, y + 4, 24, 38, 6);
        ctx.fill();
        ctx.fillStyle = '#f5d0a9';
        ctx.beginPath();
        ctx.arc(x, y - 6, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#27272a';
        ctx.beginPath();
        ctx.roundRect(x - 13, y - 22, 26, 14, 6);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderLetters(ctx: CanvasRenderingContext2D, now: number): void {
    const nextExpected = this.getNextExpectedLetterInStage();
    for (const l of this.letters) {
      if (l.collected) continue;
      if (l.x < this.camX - 80 || l.x > this.camX + this.viewW + 80) continue;

      const entry = ALPHABET_ENTRIES[l.alphabetIndex];
      const isNext = nextExpected?.alphabetIndex === l.alphabetIndex;
      const bobY = l.y + Math.sin(l.bobPhase) * 6;

      ctx.save();
      // Glowing aura
      const auraRadius = isNext ? 34 + Math.sin(now * 0.006) * 4 : 26;
      const aura = ctx.createRadialGradient(l.x, bobY, 6, l.x, bobY, auraRadius);
      aura.addColorStop(0, isNext ? 'rgba(245, 158, 11, 0.58)' : 'rgba(217, 119, 6, 0.25)');
      aura.addColorStop(1, 'rgba(245, 158, 11, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(l.x, bobY, auraRadius, 0, Math.PI * 2);
      ctx.fill();

      // Parchment medallion
      ctx.fillStyle = isNext ? '#fffbeb' : '#f5ebd6';
      ctx.strokeStyle = isNext ? '#d97706' : '#9a7b4f';
      ctx.lineWidth = isNext ? 3 : 2;
      ctx.beginPath();
      ctx.arc(l.x, bobY, 21, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Georgian Letter
      ctx.fillStyle = isNext ? '#991b1b' : '#443322';
      ctx.font = '700 22px "Noto Serif Georgian", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(entry.letter, l.x, bobY + 1);
      ctx.restore();
    }
  }

  private renderHazards(ctx: CanvasRenderingContext2D, now: number): void {
    for (const h of this.hazards) {
      if (h.x + h.w < this.camX - 60 || h.x > this.camX + this.viewW + 60) continue;
      ctx.save();
      if (h.stunTimer > 0) {
        ctx.globalAlpha = 0.45;
      }

      if (h.kind === 'ink_puddle') {
        ctx.fillStyle = '#111827';
        ctx.beginPath();
        ctx.ellipse(h.x + h.w / 2, h.y + h.h - 4, h.w / 2, h.h / 2 + 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(148, 163, 184, 0.35)';
        ctx.beginPath();
        ctx.ellipse(h.x + h.w * 0.38, h.y + h.h - 7, h.w * 0.18, 3, 0, 0, Math.PI * 2);
        ctx.fill();
      } else if (h.kind === 'bramble') {
        ctx.fillStyle = '#3f6212';
        ctx.beginPath();
        ctx.arc(h.x + 12, h.y + 20, 12, 0, Math.PI * 2);
        ctx.arc(h.x + 25, h.y + 14, 14, 0, Math.PI * 2);
        ctx.arc(h.x + 38, h.y + 20, 12, 0, Math.PI * 2);
        ctx.fill();
        // Thorns
        ctx.fillStyle = '#991b1b';
        for (let tx = h.x + 6; tx < h.x + h.w - 4; tx += 10) {
          ctx.beginPath();
          ctx.moveTo(tx, h.y + 10);
          ctx.lineTo(tx + 4, h.y);
          ctx.lineTo(tx + 8, h.y + 10);
          ctx.fill();
        }
      } else if (h.kind === 'flying_quill') {
        const hover = Math.sin(now * 0.009 + h.phase) * 4;
        const dir = Math.cos(h.phase) >= 0 ? 1 : -1;
        ctx.translate(h.x + h.w / 2, h.y + h.h / 2 + hover);
        ctx.scale(dir, 1);

        // Red censor quill
        ctx.fillStyle = '#b91c1c';
        ctx.beginPath();
        ctx.moveTo(-20, 2);
        ctx.quadraticCurveTo(0, -12, 20, -2);
        ctx.quadraticCurveTo(4, 8, -20, 2);
        ctx.fill();
        // Nib
        ctx.fillStyle = '#e2e8f0';
        ctx.beginPath();
        ctx.moveTo(16, -2);
        ctx.lineTo(25, 0);
        ctx.lineTo(16, 4);
        ctx.fill();
      } else if (h.kind === 'rolling_stone') {
        const cx = h.x + h.w / 2;
        const cy = h.y + h.h / 2;
        ctx.translate(cx, cy);
        ctx.rotate(h.phase * 2.2);
        ctx.fillStyle = '#57534e';
        ctx.beginPath();
        ctx.arc(0, 0, h.w / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#292524';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#78716c';
        ctx.beginPath();
        ctx.arc(-5, -5, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderWaveRings(ctx: CanvasRenderingContext2D): void {
    for (const w of this.waveRings) {
      ctx.save();
      ctx.strokeStyle = `rgba(217, 119, 6, ${w.alpha * 0.85})`;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  private renderPlayer(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.invulnTimer > 0 && Math.floor(now / 80) % 2 === 0) {
      return;
    }

    const cx = this.px + this.pw / 2;
    const bottomY = this.py + this.ph;
    const legSwing = this.onGround ? Math.sin(this.walkAnimTime * 1.4) * 7 : 5;

    ctx.save();
    ctx.translate(cx, bottomY);
    ctx.scale(this.facing * this.squashX, this.squashY);

    // Subtle ground shadow
    ctx.fillStyle = 'rgba(35, 26, 20, 0.22)';
    ctx.beginPath();
    ctx.ellipse(0, 0, 17, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -18);
    ctx.lineTo(-5 - legSwing, -3);
    ctx.moveTo(5, -18);
    ctx.lineTo(5 + legSwing, -3);
    ctx.stroke();

    // Dark 19th-century frock coat (chokha-inspired scholarly coat)
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.moveTo(-13, -44);
    ctx.lineTo(13, -44);
    ctx.lineTo(16 - Math.min(4, Math.abs(this.vx) * 0.012), -14);
    ctx.lineTo(-16, -14);
    ctx.closePath();
    ctx.fill();

    // White shirt collar & dark tie
    ctx.fillStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(-5, -44);
    ctx.lineTo(5, -44);
    ctx.lineTo(2, -33);
    ctx.lineTo(-2, -33);
    ctx.closePath();
    ctx.fill();

    // Deda Ena book held in front hand!
    ctx.fillStyle = '#991b1b';
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(6, -37, 14, 17, 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(9, -33, 8, 2);

    // Head
    ctx.fillStyle = '#f3ceb0';
    ctx.beginPath();
    ctx.arc(0, -53, 12, 0, Math.PI * 2);
    ctx.fill();

    // Neat grey-brown hair
    ctx.fillStyle = '#4b3f35';
    ctx.beginPath();
    ctx.arc(0, -56, 12.2, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();

    // Signature beard & mustache
    ctx.fillStyle = '#6b5e53';
    ctx.beginPath();
    ctx.arc(1, -48, 10, 0.1, Math.PI - 0.1);
    ctx.fill();

    // Mustache
    ctx.fillStyle = '#4b3f35';
    ctx.beginPath();
    ctx.ellipse(4, -49, 6, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Round wire spectacles
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(5, -54, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#1c1917';
    ctx.beginPath();
    ctx.arc(5.5, -54, 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  private renderParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      if (p.char) {
        ctx.fillStyle = p.color;
        ctx.font = `700 ${p.size}px "Noto Serif Georgian", serif`;
        ctx.textAlign = 'center';
        ctx.fillText(p.char, p.x, p.y);
      } else {
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  private renderSpeechBubble(
    ctx: CanvasRenderingContext2D,
    bubble: ActiveSpeechBubble
  ): void {
    const anchorX = this.px + this.pw / 2;
    const anchorY = this.py - 18;

    ctx.save();
    ctx.font = '600 15px "Noto Sans Georgian", sans-serif';
    const maxTextWidth = 310;
    const words = bubble.text.split(' ');
    const lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(test).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = test;
      }
    }
    if (currentLine) lines.push(currentLine);

    const lineHeight = 21;
    const leftPad = bubble.letter ? 56 : 16;
    const boxW = Math.max(
      190,
      Math.min(maxTextWidth + leftPad + 16, Math.max(...lines.map((l) => ctx.measureText(l).width)) + leftPad + 20)
    );
    const boxH = 28 + lines.length * lineHeight + 12;

    // Clamp box inside visible viewport horizontally & vertically
    const minX = this.camX + 16;
    const maxX = this.camX + this.viewW - boxW - 16;
    const bx = Math.max(minX, Math.min(maxX, anchorX - boxW / 2));
    const by = Math.max(82, anchorY - boxH - 12);

    // Bubble shadow + background
    ctx.fillStyle = 'rgba(20, 14, 10, 0.16)';
    ctx.beginPath();
    ctx.roundRect(bx + 3, by + 4, boxW, boxH, 12);
    ctx.fill();

    ctx.fillStyle = bubble.isWarning ? '#fef2f2' : '#fffdf7';
    ctx.strokeStyle = bubble.isWarning ? '#dc2626' : '#b45309';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(bx, by, boxW, boxH, 12);
    ctx.fill();
    ctx.stroke();

    // Pointer triangle
    const tipX = Math.max(bx + 20, Math.min(bx + boxW - 20, anchorX));
    ctx.fillStyle = bubble.isWarning ? '#fef2f2' : '#fffdf7';
    ctx.beginPath();
    ctx.moveTo(tipX - 8, by + boxH - 1);
    ctx.lineTo(tipX, by + boxH + 10);
    ctx.lineTo(tipX + 8, by + boxH - 1);
    ctx.fill();
    ctx.strokeStyle = bubble.isWarning ? '#dc2626' : '#b45309';
    ctx.beginPath();
    ctx.moveTo(tipX - 8, by + boxH);
    ctx.lineTo(tipX, by + boxH + 10);
    ctx.lineTo(tipX + 8, by + boxH);
    ctx.stroke();

    // Letter seal if alphabet saying
    if (bubble.letter) {
      ctx.fillStyle = '#991b1b';
      ctx.beginPath();
      ctx.arc(bx + 28, by + boxH / 2, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef3c7';
      ctx.font = '700 20px "Noto Serif Georgian", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(bubble.letter, bx + 28, by + boxH / 2 + 1);
    }

    // Speaker header
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = bubble.isWarning ? '#b91c1c' : '#92400e';
    ctx.font = '700 11.5px "Noto Sans Georgian", sans-serif';
    ctx.fillText(bubble.speaker, bx + leftPad, by + 10);

    // Proverb text
    ctx.fillStyle = '#1c1917';
    ctx.font = '500 14.5px "Noto Sans Georgian", sans-serif';
    lines.forEach((line, idx) => {
      ctx.fillText(line, bx + leftPad, by + 27 + idx * lineHeight);
    });

    ctx.restore();
  }
}
