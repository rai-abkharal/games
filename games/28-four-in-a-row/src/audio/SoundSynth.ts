export class SoundSynth {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('four_in_a_row_muted') === 'true';
    } catch {
      this.muted = false;
    }
  }

  public init(): void {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem('four_in_a_row_muted', this.muted ? 'true' : 'false');
    } catch {}
    if (!this.muted) {
      this.init();
      this.playButton();
    }
    return this.muted;
  }

  // Light, classy, acoustic wooden/ceramic disc landing sound
  // Smooth pure sine waves with warm organic resonance (Zero harsh square-wave clicks)
  public playDiscLand(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. Primary warm tone (Pure sine gliding smoothly from 420 Hz down to 210 Hz)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(420, t);
    osc1.frequency.exponentialRampToValueAtTime(210, t + 0.065);

    // Smooth gentle envelope: 2ms linear attack prevents digital pops, exponential decay
    gain1.gain.setValueAtTime(0.001, t);
    gain1.gain.linearRampToValueAtTime(0.30, t + 0.003);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    osc1.connect(gain1);
    gain1.connect(this.ctx.destination);
    osc1.start(t);
    osc1.stop(t + 0.075);

    // 2. Soft acoustic hollow body resonance (170 Hz warm low-mid thock)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(170, t);
    osc2.frequency.exponentialRampToValueAtTime(110, t + 0.05);

    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.linearRampToValueAtTime(0.18, t + 0.003);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.055);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);
    osc2.start(t);
    osc2.stop(t + 0.06);

    // 3. Delicate high overtone for tactile presence (Pure sine ~760 Hz, zero harshness)
    const osc3 = this.ctx.createOscillator();
    const gain3 = this.ctx.createGain();
    osc3.type = 'sine';
    osc3.frequency.setValueAtTime(760, t);
    osc3.frequency.exponentialRampToValueAtTime(380, t + 0.025);

    gain3.gain.setValueAtTime(0.001, t);
    gain3.gain.linearRampToValueAtTime(0.09, t + 0.002);
    gain3.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

    osc3.connect(gain3);
    gain3.connect(this.ctx.destination);
    osc3.start(t);
    osc3.stop(t + 0.03);
  }

  // Alias for backward compatibility
  public playMetallicImpact(): void {
    this.playDiscLand();
  }

  // Muted during disc fall (single clean sound only upon landing)
  public playDrop(): void {}

  // UI button click: soft, subtle acoustic tap
  public playButton(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(560, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.03);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.14, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  // Silent turn transition so gameplay stays quiet and focused on the disc drops
  public playTurn(): void {}

  // Victory fanfare chime (light, elegant arpeggio)
  public playWin(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const noteTime = t + idx * 0.12;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.28, noteTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.38);
    });
  }

  // Defeat gentle chord
  public playLose(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [587.33, 523.25, 466.16];
    const t = this.ctx.currentTime;

    notes.forEach((freq, idx) => {
      if (!this.ctx) return;
      const noteTime = t + idx * 0.15;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.20, noteTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + 0.28);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.3);
    });
  }
}
