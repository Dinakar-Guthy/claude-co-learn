import { describe, expect, it, vi } from "vitest";
import { LOUDNESS, SOUND_EVENTS, SoundManager, isSoundPackUnlocked, type AudioContextLike } from "./sound";

/** Minimal fake AudioContext that records oscillator frequencies and master gains. */
function fakeContext(state: AudioContextState = "running") {
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn() });
  const gains: { gain: ReturnType<typeof param> }[] = [];
  const freqs: number[] = [];
  const ctx = {
    currentTime: 0,
    sampleRate: 8000,
    state,
    destination: node(),
    resume: vi.fn(() => Promise.resolve()),
    createGain: vi.fn(() => { const g = { ...node(), gain: param() }; gains.push(g); return g; }),
    createOscillator: vi.fn(() => {
      const frequency = param();
      frequency.setValueAtTime.mockImplementation((v: number) => { freqs.push(v); });
      return { ...node(), type: "sine", frequency, start: vi.fn(), stop: vi.fn() };
    }),
    createBiquadFilter: vi.fn(() => ({ ...node(), type: "lowpass", frequency: param(), Q: param() })),
    createBuffer: vi.fn((_c: number, len: number) => ({ getChannelData: () => new Float32Array(len) })),
    createBufferSource: vi.fn(() => ({ ...node(), buffer: null, start: vi.fn(), stop: vi.fn() })),
  };
  return { ctx: ctx as unknown as AudioContextLike, raw: ctx, gains, freqs };
}

function setup(opts: { state?: AudioContextState } = {}) {
  const f = fakeContext(opts.state);
  let t = 0;
  const m = new SoundManager({ createContext: () => f.ctx, random: () => 0.5, now: () => (t += 1000) });
  return { m, ...f };
}

describe("SoundManager", () => {
  it("never plays before the first user gesture", () => {
    const { m, raw } = setup();
    expect(m.play("correct")).toBe(false);
    expect(raw.createOscillator).not.toHaveBeenCalled();
    m.unlock();
    expect(m.play("correct")).toBe(true);
    expect(raw.createOscillator).toHaveBeenCalled();
  });

  it("resumes a suspended context on unlock", () => {
    const { m, raw } = setup({ state: "suspended" });
    m.unlock();
    expect(raw.resume).toHaveBeenCalled();
  });

  it("is silent when muted or at zero volume", () => {
    const { m, raw } = setup();
    m.unlock();
    m.setEnabled(false);
    expect(m.play("levelUp")).toBe(false);
    m.setEnabled(true);
    m.setVolume(0);
    expect(m.play("levelUp")).toBe(false);
    expect(raw.createOscillator).not.toHaveBeenCalled();
  });

  it("scales the master gain by volume and event loudness", () => {
    const { m, gains } = setup();
    m.unlock();
    m.setVolume(0.5);
    m.play("click");
    const clickGain = gains[0].gain.value;
    gains.length = 0;
    m.setVolume(1);
    m.play("click");
    expect(gains[0].gain.value).toBeCloseTo(clickGain * 2);
  });

  it("clamps volume to 0..1 and ignores unknown packs", () => {
    const { m } = setup();
    m.setVolume(3);
    expect(m.volume).toBe(1);
    m.setVolume(-1);
    expect(m.volume).toBe(0);
    m.setPack("kazoo");
    expect(m.pack).toBe("soft-chimes");
    m.setPack("marimba");
    expect(m.pack).toBe("marimba");
  });

  it("keeps the loudness hierarchy (click < correct < reveal/unlock < levelUp < bossVictory)", () => {
    expect(LOUDNESS.click).toBeLessThan(LOUDNESS.correct);
    expect(LOUDNESS.gentle).toBeLessThan(LOUDNESS.correct);
    expect(LOUDNESS.correct).toBeLessThan(LOUDNESS.reveal);
    expect(LOUDNESS.reveal).toBeLessThanOrEqual(LOUDNESS.unlock);
    expect(LOUDNESS.unlock).toBeLessThan(LOUDNESS.levelUp);
    expect(LOUDNESS.levelUp).toBeLessThan(LOUDNESS.bossVictory);
  });

  it("raises the pitch a semitone per consecutive correct answer and resets on a miss", () => {
    const { m, freqs } = setup();
    m.unlock();
    m.playVerdict("correct");
    const first = freqs[0];
    freqs.length = 0;
    m.playVerdict("correct");
    expect(m.streak).toBe(2);
    expect(freqs[0] / first).toBeCloseTo(Math.pow(2, 1 / 12));
    m.playVerdict("incorrect");
    expect(m.streak).toBe(0);
  });

  it("applies at most ±6% random pitch variation", () => {
    const freqsFor = (r: number) => {
      const f = fakeContext();
      const m = new SoundManager({ createContext: () => f.ctx, random: () => r });
      m.unlock();
      m.play("click");
      return f.freqs[0];
    };
    expect(freqsFor(1) / freqsFor(0.5)).toBeCloseTo(1.06);
    expect(freqsFor(0) / freqsFor(0.5)).toBeCloseTo(0.94);
  });

  it("plays every event in every pack", () => {
    const { m } = setup();
    m.unlock();
    for (const pack of ["soft-chimes", "marimba", "retro", "nature"] as const) {
      for (const e of SOUND_EVENTS) expect(m.play(e, { pack })).toBe(true);
    }
  });

  it("debounces the same event fired twice in a row", () => {
    const f = fakeContext();
    const m = new SoundManager({ createContext: () => f.ctx, now: () => 0 });
    m.unlock();
    expect(m.play("levelUp")).toBe(true);
    expect(m.play("levelUp")).toBe(false);
  });

  it("unlocks sound packs by level or explicit unlock", () => {
    expect(isSoundPackUnlocked("soft-chimes", [])).toBe(true);
    expect(isSoundPackUnlocked("marimba", [])).toBe(false);
    expect(isSoundPackUnlocked("marimba", ["marimba"])).toBe(true);
    expect(isSoundPackUnlocked("retro", [], 6)).toBe(true);
  });
});
