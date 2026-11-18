const GEORGIAN_PHONETIC_MAP: Record<string, string> = {
  ა: 'a',
  ბ: 'b',
  გ: 'g',
  დ: 'd',
  ე: 'e',
  ვ: 'v',
  ზ: 'z',
  თ: 't',
  ი: 'i',
  კ: 'k',
  ლ: 'l',
  მ: 'm',
  ნ: 'n',
  ო: 'o',
  პ: 'p',
  ჟ: 'zh',
  რ: 'r',
  ს: 's',
  ტ: 't',
  უ: 'u',
  ფ: 'p',
  ქ: 'k',
  ღ: 'gh',
  ყ: 'q',
  შ: 'sh',
  ჩ: 'ch',
  ც: 'ts',
  ძ: 'dz',
  წ: 'ts',
  ჭ: 'ch',
  ხ: 'kh',
  ჯ: 'j',
  ჰ: 'h',
};

function transliterateGeorgianPhonetic(text: string): string {
  let out = '';
  for (const ch of text) {
    if (GEORGIAN_PHONETIC_MAP[ch]) {
      out += GEORGIAN_PHONETIC_MAP[ch];
    } else if (ch === '—' || ch === '–') {
      out += ', ';
    } else if (ch === '„' || ch === '“' || ch === '"' || ch === '«' || ch === '»') {
      out += '';
    } else {
      out += ch;
    }
  }
  return out.trim();
}

class GameAudioManager {
  private ctx: AudioContext | null = null;
  private muted = false;
  private voiceEnabled = true;

  private activeSource: AudioBufferSourceNode | null = null;
  private activeFallbackAudio: HTMLAudioElement | null = null;
  private speechGenId = 0;

  private arrayBufferCache = new Map<string, ArrayBuffer>();
  private audioBufferCache = new Map<string, AudioBuffer>();
  private inflightRequests = new Map<string, Promise<ArrayBuffer | null>>();

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (muted) {
      this.stopSpeech();
    }
  }

  public isVoiceEnabled(): boolean {
    return this.voiceEnabled;
  }

  public setVoiceEnabled(enabled: boolean): void {
    this.voiceEnabled = enabled;
    if (!enabled) {
      this.stopSpeech();
    }
  }

  public unlock(): void {
    this.ensureContext();
  }

  public stopSpeech(): void {
    this.speechGenId += 1;
    if (this.activeSource) {
      try {
        this.activeSource.stop();
        this.activeSource.disconnect();
      } catch {
        // Ignore already-stopped source
      }
      this.activeSource = null;
    }
    if (this.activeFallbackAudio) {
      try {
        this.activeFallbackAudio.pause();
        this.activeFallbackAudio.currentTime = 0;
      } catch {
        // Ignore fallback audio stop errors
      }
      this.activeFallbackAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore speechSynthesis errors
      }
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as {webkitAudioContext?: typeof AudioContext})
          .webkitAudioContext;
      if (!AudioCtx) return null;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'triangle',
    volume = 0.12,
    freqEnd?: number,
    delay = 0
  ): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(40, freqEnd),
        now + duration
      );
    }

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(volume, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  public playJump(isDouble = false): void {
    if (isDouble) {
      this.playTone(390, 0.14, 'sine', 0.12, 760);
      this.playTone(585, 0.14, 'triangle', 0.09, 980, 0.045);
    } else {
      this.playTone(230, 0.14, 'triangle', 0.12, 520);
    }
  }

  public playSpring(): void {
    this.playTone(210, 0.25, 'sine', 0.15, 780);
    this.playTone(320, 0.2, 'triangle', 0.09, 960, 0.04);
  }

  public playLand(): void {
    this.playTone(130, 0.06, 'sine', 0.05, 75);
  }

  public playLetterCollect(alphabetIndex: number): void {
    const scale = [392, 440, 493.88, 587.33, 659.25, 783.99];
    const base = scale[alphabetIndex % scale.length];
    this.playTone(base, 0.15, 'triangle', 0.11);
    this.playTone(base * 1.25, 0.16, 'sine', 0.09, undefined, 0.05);
    this.playTone(base * 1.5, 0.22, 'triangle', 0.08, undefined, 0.1);
  }

  public playQuip(): void {
    this.playTone(460, 0.07, 'sine', 0.07, 520);
    this.playTone(580, 0.1, 'sine', 0.07, 640, 0.06);
  }

  public playWave(): void {
    this.playTone(330, 0.2, 'sine', 0.1, 660);
    this.playTone(495, 0.22, 'triangle', 0.08, 880, 0.04);
  }

  public playHurt(): void {
    this.playTone(210, 0.2, 'sawtooth', 0.1, 95);
    this.playTone(155, 0.24, 'triangle', 0.1, 70, 0.05);
  }

  public playStageClear(): void {
    const notes = [392, 493.88, 587.33, 783.99];
    notes.forEach((note, i) => {
      this.playTone(note, 0.24, 'triangle', 0.12, undefined, i * 0.09);
    });
  }

  public playVictory(): void {
    const notes = [392, 440, 493.88, 587.33, 659.25, 783.99, 987.77];
    notes.forEach((note, i) => {
      this.playTone(note, 0.32, 'triangle', 0.12, undefined, i * 0.095);
    });
  }

  private async fetchTtsBytes(
    text: string,
    mood: 'story' | 'warning'
  ): Promise<ArrayBuffer | null> {
    const key = `${mood}:${text}`;
    const cached = this.arrayBufferCache.get(key);
    if (cached) return cached;

    const existing = this.inflightRequests.get(key);
    if (existing) return existing;

    const promise = (async () => {
      try {
        const resp = await fetch('/api/tts', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({text, mood}),
        });
        if (!resp.ok) {
          return null;
        }
        const data = (await resp.json()) as {
          audioBase64?: string;
          mimeType?: string;
        };
        if (!data.audioBase64) return null;
        const binary = atob(data.audioBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const buf = bytes.buffer;
        this.arrayBufferCache.set(key, buf);
        return buf;
      } catch {
        return null;
      }
    })().finally(() => {
      this.inflightRequests.delete(key);
    });

    this.inflightRequests.set(key, promise);
    return promise;
  }

  private speakViaWebSpeechFallback(
    cleanText: string,
    mood: 'story' | 'warning'
  ): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    try {
      const voices = window.speechSynthesis.getVoices();
      const georgianVoice = voices.find((v) =>
        v.lang.toLowerCase().startsWith('ka')
      );
      if (!georgianVoice) return;

      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(cleanText);
      utter.voice = georgianVoice;
      utter.lang = 'ka-GE';
      utter.rate = mood === 'warning' ? 1.06 : 0.98;
      window.speechSynthesis.speak(utter);
    } catch {
      // Safe no-op
    }
  }

  public async speakGeorgian(
    text: string,
    mood: 'story' | 'warning' = 'story'
  ): Promise<void> {
    if (this.muted || !this.voiceEnabled || typeof window === 'undefined') return;
    const clean = text.trim();
    if (!clean) return;

    this.stopSpeech();
    const myGen = this.speechGenId;
    const key = `${mood}:${clean}`;

    const ctx = this.ensureContext();
    const rawBytes = await this.fetchTtsBytes(clean, mood);
    if (myGen !== this.speechGenId || this.muted || !this.voiceEnabled) return;

    if (rawBytes && ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        let decoded = this.audioBufferCache.get(key);
        if (!decoded) {
          decoded = await ctx.decodeAudioData(rawBytes.slice(0));
          this.audioBufferCache.set(key, decoded);
        }
        if (myGen !== this.speechGenId || this.muted || !this.voiceEnabled) return;

        const source = ctx.createBufferSource();
        source.buffer = decoded;
        const gain = ctx.createGain();
        gain.gain.value = 1.05;
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = () => {
          if (this.activeSource === source) {
            this.activeSource = null;
          }
        };
        this.activeSource = source;
        source.start(0);
        return;
      } catch {
        // Fall through to HTMLAudioElement fallback
      }
    }

    if (rawBytes) {
      try {
        const blob = new Blob([rawBytes], {type: 'audio/wav'});
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = 0.95;
        this.activeFallbackAudio = audio;
        audio.onended = () => URL.revokeObjectURL(url);
        await audio.play();
        return;
      } catch {
        // Fall through to Web Speech fallback
      }
    }

    // Guaranteed spoken fallback if Gemini TTS hits 429 quota or is unavailable
    this.speakViaWebSpeechFallback(clean, mood);
  }
}

export const gameAudio = new GameAudioManager();
