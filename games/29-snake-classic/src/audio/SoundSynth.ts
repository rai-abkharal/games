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

  // Realistic, juicy, slightly loud & beautiful fruit bite/chomp sound
  public playCollect(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // 1. The Crisp Fruit Bite Transient (Fast teeth snap & crunch)
    // Synthesized via high-frequency FM modulator for a sharp, natural organic crunch
    const modOsc = this.ctx.createOscillator();
    const modGain = this.ctx.createGain();
    const biteOsc = this.ctx.createOscillator();
    const biteGain = this.ctx.createGain();

    modOsc.type = 'sawtooth';
    modOsc.frequency.setValueAtTime(420, t);
    modOsc.frequency.exponentialRampToValueAtTime(140, t + 0.05);

    modGain.gain.setValueAtTime(700, t);
    modGain.gain.exponentialRampToValueAtTime(10, t + 0.045);

    modOsc.connect(modGain);
    modGain.connect(biteOsc.frequency);

    biteOsc.type = 'triangle';
    biteOsc.frequency.setValueAtTime(1200, t);
    biteOsc.frequency.exponentialRampToValueAtTime(320, t + 0.06);

    biteGain.gain.setValueAtTime(0.001, t);
    biteGain.gain.linearRampToValueAtTime(0.55, t + 0.003);
    biteGain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

    biteOsc.connect(biteGain);
    biteGain.connect(this.ctx.destination);

    modOsc.start(t);
    modOsc.stop(t + 0.065);
    biteOsc.start(t);
    biteOsc.stop(t + 0.07);

    // 2. The Juicy "Nom/Chomp" Body (Warm resonant throat/mouth swallow)
    const bodyOsc = this.ctx.createOscillator();
    const bodyGain = this.ctx.createGain();

    bodyOsc.type = 'sine';
    bodyOsc.frequency.setValueAtTime(280, t);
    bodyOsc.frequency.exponentialRampToValueAtTime(620, t + 0.09);

    bodyGain.gain.setValueAtTime(0.001, t);
    bodyGain.gain.linearRampToValueAtTime(0.60, t + 0.006);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.ctx.destination);

    bodyOsc.start(t);
    bodyOsc.stop(t + 0.125);

    // 3. Beautiful Melodic Sparkle (Sweet sparkling crystal chime E6 -> A6)
    const chimeOsc = this.ctx.createOscillator();
    const chimeGain = this.ctx.createGain();

    chimeOsc.type = 'sine';
    chimeOsc.frequency.setValueAtTime(1318, t + 0.015);
    chimeOsc.frequency.exponentialRampToValueAtTime(1760, t + 0.11);

    chimeGain.gain.setValueAtTime(0.001, t + 0.015);
    chimeGain.gain.linearRampToValueAtTime(0.28, t + 0.022);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

    chimeOsc.connect(chimeGain);
    chimeGain.connect(this.ctx.destination);

    chimeOsc.start(t + 0.015);
    chimeOsc.stop(t + 0.145);
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
    oscClick.frequency.setValueAtTime(750, t);
    oscClick.frequency.exponentialRampToValueAtTime(140, t + 0.05);

    gainClick.gain.setValueAtTime(0.001, t);
    gainClick.gain.linearRampToValueAtTime(0.55, t + 0.003);
    gainClick.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

    oscClick.connect(gainClick);
    gainClick.connect(this.ctx.destination);
    oscClick.start(t);
    oscClick.stop(t + 0.075);

    // Low solid thud
    const oscThud = this.ctx.createOscillator();
    const gainThud = this.ctx.createGain();
    oscThud.type = 'sine';
    oscThud.frequency.setValueAtTime(180, t);
    oscThud.frequency.exponentialRampToValueAtTime(55, t + 0.14);

    gainThud.gain.setValueAtTime(0.001, t);
    gainThud.gain.linearRampToValueAtTime(0.60, t + 0.005);
    gainThud.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

    oscThud.connect(gainThud);
    gainThud.connect(this.ctx.destination);
    oscThud.start(t);
    oscThud.stop(t + 0.17);
  }

  // Beautiful, musical, warm cartoon game-over melody (Lush chords + deep bell resonance)
  public playGameOver(): void {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    const t = this.ctx.currentTime;

    // A rich, warm 4-chord wistful cartoon failure melody:
    // Chord 1: G major 7th [392, 494, 587] (t + 0.00s)
    // Chord 2: F major [349, 440, 523] (t + 0.22s)
    // Chord 3: Eb major [311, 392, 466] (t + 0.44s)
    // Chord 4: Low D/Bb cadence + warm sub-bass [233, 293, 349, 116] (t + 0.70s)
    const chordPhases = [
      {
        delay: 0.00,
        dur: 0.22,
        notes: [392.0, 493.88, 587.33],
        gain: 0.35
      },
      {
        delay: 0.22,
        dur: 0.22,
        notes: [349.23, 440.0, 523.25],
        gain: 0.38
      },
      {
        delay: 0.44,
        dur: 0.26,
        notes: [311.13, 392.0, 466.16],
        gain: 0.42
      },
      {
        delay: 0.70,
        dur: 0.65,
        notes: [233.08, 293.66, 349.23, 116.54],
        gain: 0.50
      }
    ];

    chordPhases.forEach(cp => {
      const chordTime = t + cp.delay;

      cp.notes.forEach(freq => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();

        // Warm blend: low frequencies get soft sine, mid/highs get rounded triangle for lush electric piano tone
        osc.type = freq < 200 ? 'sine' : 'triangle';
        osc.frequency.setValueAtTime(freq, chordTime);

        // Gentle subtle vibrato on held notes
        if (cp.dur > 0.4) {
          osc.frequency.linearRampToValueAtTime(freq * 0.992, chordTime + cp.dur * 0.5);
          osc.frequency.linearRampToValueAtTime(freq, chordTime + cp.dur);
        }

        const noteGain = (cp.gain / cp.notes.length) * 1.5;
        gain.gain.setValueAtTime(0.001, chordTime);
        gain.gain.linearRampToValueAtTime(noteGain, chordTime + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, chordTime + cp.dur);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);

        osc.start(chordTime);
        osc.stop(chordTime + cp.dur + 0.03);
      });
    });

    // Deep warm gong/bell impact undertone at the start
    const gongOsc = this.ctx.createOscillator();
    const gongGain = this.ctx.createGain();
    gongOsc.type = 'sine';
    gongOsc.frequency.setValueAtTime(155, t);
    gongOsc.frequency.exponentialRampToValueAtTime(75, t + 0.45);

    gongGain.gain.setValueAtTime(0.001, t);
    gongGain.gain.linearRampToValueAtTime(0.45, t + 0.015);
    gongGain.gain.exponentialRampToValueAtTime(0.001, t + 0.50);

    gongOsc.connect(gongGain);
    gongGain.connect(this.ctx.destination);
    gongOsc.start(t);
    gongOsc.stop(t + 0.52);
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
