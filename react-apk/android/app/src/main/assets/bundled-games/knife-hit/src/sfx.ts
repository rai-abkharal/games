// ---------------------------------------------------------------- SFX (Web Audio synthesis, no files)
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  /** Call inside a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.9;
      this.master.connect(this.ctx.destination);
    } catch { this.ctx = null; }
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.02);
  }

  private noise(dur: number): AudioBufferSourceNode | null {
    if (!this.ctx) return null;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    return src;
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, filterType: BiquadFilterType, f0: number, f1: number, q = 1): void {
    if (!this.ctx || !this.master) return;
    const src = this.noise(dur);
    if (!src) return;
    const t = this.ctx.currentTime;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  throwKnife(): void {
    this.burst(0.14, 0.35, 'bandpass', 900, 4200, 1.2);
  }

  hit(): void {
    this.burst(0.09, 0.7, 'lowpass', 1800, 300);
    this.tone('sine', 190, 70, 0.14, 0.55);
    this.tone('square', 1400, 900, 0.03, 0.08);
  }

  apple(): void {
    this.burst(0.08, 0.35, 'highpass', 2500, 5000);
    this.tone('triangle', 880, 1320, 0.09, 0.28);
    this.tone('triangle', 1320, 1760, 0.12, 0.22, 0.06);
  }

  clash(): void {
    this.burst(0.25, 0.55, 'highpass', 3000, 1200);
    this.tone('square', 2400, 1800, 0.18, 0.18);
    this.tone('sawtooth', 300, 60, 0.35, 0.4);
  }

  fall(): void {
    this.tone('sine', 420, 90, 0.5, 0.25);
  }

  breakBoard(): void {
    this.burst(0.35, 0.8, 'lowpass', 2500, 200);
    this.burst(0.18, 0.4, 'bandpass', 500, 1500, 0.8);
    this.tone('sine', 140, 40, 0.4, 0.5);
    this.tone('square', 900, 300, 0.06, 0.1);
  }

  win(): void {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.tone('triangle', n, n, 0.22, 0.28, i * 0.09));
    this.tone('sine', 1046, 1568, 0.4, 0.18, 0.4);
  }

  unlockJingle(): void {
    const notes = [659, 784, 988, 1318, 1568];
    notes.forEach((n, i) => this.tone('triangle', n, n, 0.3, 0.26, i * 0.1));
    this.burst(0.5, 0.15, 'highpass', 4000, 8000);
  }

  tap(): void {
    this.tone('sine', 700, 500, 0.06, 0.18);
  }

  whoosh(): void {
    this.burst(0.3, 0.25, 'bandpass', 400, 2000, 0.6);
  }

  pop(): void {
    this.tone('sine', 300, 600, 0.07, 0.15);
  }
}

export const sfx = new Sfx();

// ---------------------------------------------------------------- Save data
export interface SaveData {
  level: number;          // current stage (1..100)
  apples: number;
  best: number;
  unlocked: number[];     // knife indices
  knife: number;
  muted: boolean;
  completed: boolean;
}

const KEY = 'knifehit.save.v1';
let mem: SaveData = { level: 1, apples: 0, best: 0, unlocked: [0], knife: 0, muted: false, completed: false };

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw) as Partial<SaveData>;
      mem = { ...mem, ...d };
      if (!Array.isArray(mem.unlocked) || !mem.unlocked.includes(0)) mem.unlocked = [0, ...(mem.unlocked || [])];
    }
  } catch { /* sandboxed — memory only */ }
  return mem;
}

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* ignore */ }
}

export const data = (): SaveData => mem;
