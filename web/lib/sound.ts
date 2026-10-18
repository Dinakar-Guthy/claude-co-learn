/**
 * Reward sounds (Track C), synthesized with the Web Audio API: no audio assets, no licenses.
 * Every pack plays the same short major-pentatonic phrases through a different "voice".
 * Loudness hierarchy (P2): click < gentle < partial < correct < bossHit < reveal/unlock < levelUp < bossVictory.
 * Nothing plays until unlock() is called from a user gesture (browser autoplay policy).
 */
import type { Verdict } from "@/lib/contracts/moment";

export type SoundEvent =
  | "click"
  | "correct"
  | "partial"
  | "gentle"
  | "reveal"
  | "unlock"
  | "levelUp"
  | "bossHit"
  | "bossVictory"
  | "streak";

export const SOUND_EVENTS: readonly SoundEvent[] = [
  "click", "correct", "partial", "gentle", "streak", "reveal", "unlock", "levelUp", "bossHit", "bossVictory",
];

export type SoundPackId = "soft-chimes" | "marimba" | "retro" | "nature";

export interface SoundPackDef {
  id: SoundPackId;
  label: string;
  description: string;
  unlockLevel: number;
}

export const SOUND_PACKS: readonly SoundPackDef[] = [
  { id: "soft-chimes", label: "Soft chimes", description: "Gentle bell tones", unlockLevel: 1 },
  { id: "marimba", label: "Marimba", description: "Warm wooden taps", unlockLevel: 3 },
  { id: "retro", label: "Retro", description: "Soft 8-bit blips", unlockLevel: 6 },
  { id: "nature", label: "Nature", description: "Breezes and bells", unlockLevel: 9 },
];

export const DEFAULT_SOUND_PACK: SoundPackId = "soft-chimes";
export const DEFAULT_VOLUME = 0.4;

export function isSoundPackUnlocked(packId: string, unlockedIds: readonly string[], level?: number): boolean {
  const pack = SOUND_PACKS.find((p) => p.id === packId);
  if (!pack) return false;
  if (pack.unlockLevel <= 1 || unlockedIds.includes(packId)) return true;
  return level !== undefined && level >= pack.unlockLevel;
}

/** Relative loudness per event, multiplied by the user's volume. */
export const LOUDNESS: Record<SoundEvent, number> = {
  click: 0.15,
  gentle: 0.28,
  partial: 0.36,
  correct: 0.45,
  streak: 0.45,
  bossHit: 0.5,
  reveal: 0.6,
  unlock: 0.6,
  levelUp: 0.8,
  bossVictory: 1,
};

/** Random pitch variation (±6%) keeps repeated sounds from feeling mechanical. */
export const PITCH_VARIATION = 0.06;
/** Streaks raise the pitch one semitone per consecutive correct answer, capped at an octave. */
export const MAX_STREAK_SEMITONES = 12;

interface Note {
  semi: number; // semitones above the voice's base pitch
  at: number; // seconds after start
  dur: number; // seconds
  gain?: number; // relative, default 1
}

const chord = (semis: number[], at: number, dur: number, gain = 0.6): Note[] => semis.map((semi) => ({ semi, at, dur, gain }));

/** Shared phrases (major pentatonic: 0 2 4 7 9 12 …). */
const PHRASES: Record<Exclude<SoundEvent, "streak">, Note[]> = {
  click: [{ semi: 12, at: 0, dur: 0.05 }],
  correct: [
    { semi: 7, at: 0, dur: 0.22 },
    { semi: 12, at: 0.08, dur: 0.4 },
  ],
  partial: [
    { semi: 4, at: 0, dur: 0.22 },
    { semi: 7, at: 0.09, dur: 0.35, gain: 0.8 },
  ],
  // A single soft, low note: acknowledges the answer without sounding like a "wrong" buzzer.
  gentle: [{ semi: -3, at: 0, dur: 0.35, gain: 0.8 }],
  reveal: [
    { semi: 0, at: 0, dur: 0.4 },
    { semi: 4, at: 0.07, dur: 0.4 },
    { semi: 7, at: 0.14, dur: 0.4 },
    { semi: 12, at: 0.21, dur: 0.6 },
  ],
  unlock: [
    { semi: 7, at: 0, dur: 0.3 },
    { semi: 12, at: 0.07, dur: 0.3 },
    { semi: 16, at: 0.14, dur: 0.3 },
    { semi: 19, at: 0.21, dur: 0.35 },
    { semi: 24, at: 0.28, dur: 0.7, gain: 0.7 },
  ],
  levelUp: [
    { semi: 0, at: 0, dur: 0.25 },
    { semi: 4, at: 0.12, dur: 0.25 },
    { semi: 7, at: 0.24, dur: 0.25 },
    { semi: 12, at: 0.36, dur: 0.4 },
    ...chord([7, 12, 16], 0.56, 1.0),
  ],
  bossHit: [
    { semi: -12, at: 0, dur: 0.16 },
    { semi: 0, at: 0.03, dur: 0.18, gain: 0.7 },
  ],
  bossVictory: [
    { semi: 0, at: 0, dur: 0.2 },
    { semi: 4, at: 0.12, dur: 0.2 },
    { semi: 7, at: 0.24, dur: 0.2 },
    { semi: 12, at: 0.36, dur: 0.35 },
    { semi: 9, at: 0.6, dur: 0.18 },
    { semi: 12, at: 0.72, dur: 0.18 },
    { semi: 16, at: 0.84, dur: 0.3 },
    ...chord([0, 7, 12, 16, 19], 1.08, 1.6, 0.5),
  ],
};

interface Voice {
  baseHz: number;
  wave: OscillatorType;
  attack: number;
  /** Multiplies note durations (longer ring for bells, short for mallets). */
  ring: number;
  /** Cap on a note's length in seconds (percussive voices). */
  maxDur?: number;
  /** Extra sine partials as [frequency ratio, relative gain]. */
  partials: [number, number][];
  lowpassHz?: number;
  gain: number;
  /** Filtered-noise "breeze" layered under the phrase. */
  noise?: { hz: number; q: number; gain: number; dur: number };
}

const VOICES: Record<SoundPackId, Voice> = {
  "soft-chimes": { baseHz: 523.25, wave: "sine", attack: 0.01, ring: 1.4, partials: [[2, 0.18], [3, 0.05]], gain: 0.9 },
  marimba: { baseHz: 392, wave: "triangle", attack: 0.003, ring: 1, maxDur: 0.32, partials: [[4, 0.12]], gain: 1 },
  retro: { baseHz: 523.25, wave: "square", attack: 0.005, ring: 0.8, partials: [], lowpassHz: 2400, gain: 0.28 },
  nature: {
    baseHz: 587.33,
    wave: "sine",
    attack: 0.02,
    ring: 1.6,
    partials: [[2.76, 0.22], [5.4, 0.06]], // inharmonic bell partials
    gain: 0.8,
    noise: { hz: 1400, q: 0.7, gain: 0.25, dur: 0.5 },
  },
};

/** The subset of AudioContext the manager uses (lets tests pass a fake). */
export type AudioContextLike = Pick<
  AudioContext,
  | "currentTime"
  | "destination"
  | "sampleRate"
  | "state"
  | "resume"
  | "createOscillator"
  | "createGain"
  | "createBiquadFilter"
  | "createBuffer"
  | "createBufferSource"
>;

export interface SoundManagerOptions {
  createContext?: () => AudioContextLike | null;
  random?: () => number;
  now?: () => number;
}

export interface PlayOptions {
  /** Consecutive correct answers (for "correct"/"streak"). */
  streak?: number;
  /** Override the pack (e.g. previews in settings). */
  pack?: SoundPackId;
}

function defaultCreateContext(): AudioContextLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
const isPack = (id: string): id is SoundPackId => SOUND_PACKS.some((p) => p.id === id);

/** Ignore the same event fired twice within this window (e.g. React StrictMode double effects). */
const DEBOUNCE_MS = 60;

export class SoundManager {
  private ctx: AudioContextLike | null = null;
  private unlocked = false;
  private noiseBuffer: AudioBuffer | null = null;
  private lastPlayed = new Map<SoundEvent, number>();
  private _enabled = true;
  private _volume = DEFAULT_VOLUME;
  private _pack: SoundPackId = DEFAULT_SOUND_PACK;
  private _streak = 0;
  private readonly createContext: () => AudioContextLike | null;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(opts: SoundManagerOptions = {}) {
    this.createContext = opts.createContext ?? defaultCreateContext;
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  get enabled() { return this._enabled; }
  get volume() { return this._volume; }
  get pack() { return this._pack; }
  get streak() { return this._streak; }
  get isUnlocked() { return this.unlocked; }

  setEnabled(enabled: boolean) { this._enabled = enabled; }
  setVolume(volume: number) { this._volume = clamp01(volume); }
  setPack(pack: string) { if (isPack(pack)) this._pack = pack; }

  configure(s: { enabled?: boolean; volume?: number; pack?: string }) {
    if (s.enabled !== undefined) this.setEnabled(s.enabled);
    if (s.volume !== undefined) this.setVolume(s.volume);
    if (s.pack !== undefined) this.setPack(s.pack);
  }

  /** Call from a user gesture. Creates/resumes the AudioContext; until then play() is a no-op. */
  unlock() {
    if (!this.ctx) this.ctx = this.createContext();
    if (!this.ctx) return;
    this.unlocked = true;
    if (this.ctx.state === "suspended") void this.ctx.resume().catch(() => {});
  }

  /** Plays a verdict sound and tracks the correct-answer streak. */
  playVerdict(verdict: Verdict): boolean {
    if (verdict === "correct") {
      this._streak += 1;
      return this.play(this._streak >= 2 ? "streak" : "correct", { streak: this._streak });
    }
    this._streak = 0;
    return this.play(verdict === "partial" ? "partial" : "gentle");
  }

  resetStreak() { this._streak = 0; }

  /** Returns true if the sound was scheduled. */
  play(event: SoundEvent, opts: PlayOptions = {}): boolean {
    if (!this._enabled || this._volume <= 0 || !this.unlocked || !this.ctx) return false;
    const t = this.now();
    const last = this.lastPlayed.get(event);
    if (last !== undefined && t - last < DEBOUNCE_MS) return false;
    this.lastPlayed.set(event, t);

    const ctx = this.ctx;
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    const voice = VOICES[opts.pack ?? this._pack];
    const phrase = event === "streak" ? PHRASES.correct : PHRASES[event];
    const transpose = event === "streak" || event === "correct"
      ? Math.min(Math.max((opts.streak ?? 1) - 1, 0), MAX_STREAK_SEMITONES)
      : 0;
    const detune = 1 + (this.random() * 2 - 1) * PITCH_VARIATION;

    const start = ctx.currentTime + 0.01;
    const out = ctx.createGain();
    out.gain.value = this._volume * LOUDNESS[event] * voice.gain;
    if (voice.lowpassHz) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = voice.lowpassHz;
      out.connect(lp);
      lp.connect(ctx.destination);
    } else {
      out.connect(ctx.destination);
    }

    for (const note of phrase) {
      const hz = voice.baseHz * Math.pow(2, (note.semi + transpose) / 12) * detune;
      const dur = Math.min(note.dur * voice.ring, voice.maxDur ?? Infinity);
      this.tone(ctx, out, voice.wave, hz, start + note.at, dur, voice.attack, note.gain ?? 1);
      for (const [ratio, g] of voice.partials) {
        this.tone(ctx, out, "sine", hz * ratio, start + note.at, dur * 0.6, voice.attack, (note.gain ?? 1) * g);
      }
    }
    if (voice.noise && event !== "click") this.breeze(ctx, out, start, voice.noise);
    return true;
  }

  private tone(ctx: AudioContextLike, out: AudioNode, wave: OscillatorType, hz: number, at: number, dur: number, attack: number, peak: number) {
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz, at);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(Math.max(peak, 0.0002), at + attack);
    env.gain.exponentialRampToValueAtTime(0.0001, at + Math.max(dur, attack + 0.02));
    osc.connect(env);
    env.connect(out);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  }

  private breeze(ctx: AudioContextLike, out: AudioNode, at: number, n: NonNullable<Voice["noise"]>) {
    if (!this.noiseBuffer) {
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate), ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = this.random() * 2 - 1;
      this.noiseBuffer = buf;
    }
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = n.hz;
    bp.Q.value = n.q;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, at);
    env.gain.linearRampToValueAtTime(n.gain, at + n.dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, at + n.dur);
    src.connect(bp);
    bp.connect(env);
    env.connect(out);
    src.start(at);
    src.stop(at + n.dur + 0.05);
  }
}
