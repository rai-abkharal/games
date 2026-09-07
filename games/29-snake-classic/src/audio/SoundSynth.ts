export class SoundSynth {
  private ctx: AudioContext | null = null;
  public muted: boolean = false;

  constructor() {
    try {
      this.muted = localStorage.getItem('cute_snake_muted') === 'true';
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
      localStorage.setItem('cute_snake_muted', this.muted ? 'true' : 'false');
    } catch {}
    if (!this.muted) {
      this.init();
      this.playButton();
    }
    return this.muted;
  }

  // Cheerful bubbly pop/chomp when eating a red berry
  public playCollect(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t);
    osc.frequency.exponentialRampToValueAtTime(880, t + 0.08);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.28, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.095);

    // Subtle sweet second overtone
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(880, t);
    osc2.frequency.exponentialRampToValueAtTime(1320, t + 0.07);

    gain2.gain.setValueAtTime(0.001, t);
    gain2.gain.linearRampToValueAtTime(0.12, t + 0.005);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

    osc2.connect(gain2);
    gain2.connect(this.ctx.destination);

    osc2.start(t);
    osc2.stop(t + 0.08);
  }

  // Crisp wall/self impact sound synchronized with white star burst
  public playImpact(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // High transient snap
    const oscClick = this.ctx.createOscillator();
    const gainClick = this.ctx.createGain();
    oscClick.type = 'triangle';
    oscClick.frequency.setValueAtTime(600, t);
    oscClick.frequency.exponentialRampToValueAtTime(120, t + 0.05);

    gainClick.gain.setValueAtTime(0.001, t);
    gainClick.gain.linearRampToValueAtTime(0.35, t + 0.002);
    gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    oscClick.connect(gainClick);
    gainClick.connect(this.ctx.destination);
    oscClick.start(t);
    oscClick.stop(t + 0.065);

    // Low solid thud
    const oscThud = this.ctx.createOscillator();
    const gainThud = this.ctx.createGain();
    oscThud.type = 'sine';
    oscThud.frequency.setValueAtTime(160, t);
    oscThud.frequency.exponentialRampToValueAtTime(60, t + 0.12);

    gainThud.gain.setValueAtTime(0.001, t);
    gainThud.gain.linearRampToValueAtTime(0.4, t + 0.005);
    gainThud.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    oscThud.connect(gainThud);
    gainThud.connect(this.ctx.destination);
    oscThud.start(t);
    oscThud.stop(t + 0.15);
  }

  // Short gentle descending cartoon sting on game over
  public playGameOver(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const notes = [
      { freq: 440, delay: 0.00, dur: 0.12 },
      { freq: 370, delay: 0.12, dur: 0.12 },
      { freq: 311, delay: 0.24, dur: 0.14 },
      { freq: 247, delay: 0.38, dur: 0.28 }
    ];

    const t = this.ctx.currentTime;
    notes.forEach(n => {
      const noteTime = t + n.delay;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, noteTime);

      gain.gain.setValueAtTime(0.001, noteTime);
      gain.gain.linearRampToValueAtTime(0.22, noteTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, noteTime + n.dur);

      osc.connect(gain);
      gain.connect(this.ctx!.destination);

      osc.start(noteTime);
      osc.stop(noteTime + n.dur + 0.02);
    });
  }

  // Soft tactile UI button tap
  public playButton(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, t);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.04);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(t);
    osc.stop(t + 0.05);
  }
}
