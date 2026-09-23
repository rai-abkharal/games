/**
 * audio.ts — Web Audio playback of the supplied recordings (embedded as base64).
 * Nothing is synthesised: every sound in the game is one of the user's files.
 */
import { SOUNDS } from './assets';

function b64ToBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private pending = new Map<string, ArrayBuffer>();
  muted = false;
  ready = false;

  constructor() {
    for (const k of Object.keys(SOUNDS)) this.pending.set(k, b64ToBuffer(SOUNDS[k]));
  }

  /** Create the context inside a user gesture (autoplay policy). Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC() as AudioContext;
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 18; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(comp).connect(this.ctx.destination);
      let n = 0; const total = this.pending.size;
      for (const [k, buf] of this.pending) {
        this.ctx.decodeAudioData(buf.slice(0), (ab) => { this.buffers.set(k, ab); if (++n >= total) this.ready = true; }, () => { if (++n >= total) this.ready = true; });
      }
      this.pending.clear();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(key: string, opts: { gain?: number; rate?: number; delay?: number; offset?: number; duration?: number } = {}): void {
    if (!this.ctx || !this.master || this.muted) return;
    const buf = this.buffers.get(key);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = opts.rate ?? 1;
    const g = this.ctx.createGain();
    g.gain.value = opts.gain ?? 1;
    src.connect(g).connect(this.master);
    const when = this.ctx.currentTime + (opts.delay ?? 0);
    if (opts.duration !== undefined) src.start(when, opts.offset ?? 0, opts.duration);
    else src.start(when, opts.offset ?? 0);
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
  }
}
