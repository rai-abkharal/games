export class AudioManager {
  private static ctx: AudioContext | null = null;
  public static enabled: boolean = true;
  private static noiseBuffer: AudioBuffer | null = null;

  private static init(): void {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      this.initNoise();
    } catch (_) {
      this.ctx = null;
    }
  }

  private static initNoise(): void {
    if (!this.ctx || this.noiseBuffer) return;
    try {
      const duration = 0.6;
      const bufferSize = Math.floor(this.ctx.sampleRate * duration);
      this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }
    } catch (_) {}
  }

  public static unlock(): void {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Realistic Bottle Cap Pop & Soda Can Tab Sound
  // 1) Hollow acoustic bottle neck pop, 2) Pressurized gas fizz escape, 3) Metallic snap
  public static playPop(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. Acoustic Cavity Pop (hollow pop of air chamber)
      const popOsc = this.ctx.createOscillator();
      const popGain = this.ctx.createGain();
      popOsc.type = 'sine';
      popOsc.frequency.setValueAtTime(680, now);
      popOsc.frequency.exponentialRampToValueAtTime(140, now + 0.055);
      popGain.gain.setValueAtTime(0.40, now);
      popGain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
      popOsc.connect(popGain);
      popGain.connect(this.ctx.destination);
      popOsc.start(now);
      popOsc.stop(now + 0.07);

      // 2. Pressurized Gas Escape ("Psssshh" carbonation fizz burst)
      if (this.noiseBuffer) {
        const noiseSource = this.ctx.createBufferSource();
        noiseSource.buffer = this.noiseBuffer;
        const noiseFilter = this.ctx.createBiquadFilter();
        noiseFilter.type = 'bandpass';
        noiseFilter.frequency.setValueAtTime(4500, now);
        noiseFilter.Q.setValueAtTime(2.2, now);

        const noiseGain = this.ctx.createGain();
        noiseGain.gain.setValueAtTime(0.28, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

        noiseSource.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(this.ctx.destination);
        noiseSource.start(now);
        noiseSource.stop(now + 0.09);
      }

      // 3. Metallic Crown Cap Snap / Pull-tab Clink
      const metalOsc = this.ctx.createOscillator();
      const metalGain = this.ctx.createGain();
      metalOsc.type = 'sine';
      metalOsc.frequency.setValueAtTime(2450, now);
      metalGain.gain.setValueAtTime(0.16, now);
      metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      metalOsc.connect(metalGain);
      metalGain.connect(this.ctx.destination);
      metalOsc.start(now);
      metalOsc.stop(now + 0.04);
    } catch (_) {}
  }

  // Realistic Shattering Glass Sound
  // 1) Sharp high-impact crack, 2) Multi-tone crystalline glass resonances, 3) Scattering shards clatter
  public static playBreak(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // 1. High-impact sharp glass crack
      if (this.noiseBuffer) {
        const crackSource = this.ctx.createBufferSource();
        crackSource.buffer = this.noiseBuffer;
        const crackFilter = this.ctx.createBiquadFilter();
        crackFilter.type = 'highpass';
        crackFilter.frequency.setValueAtTime(3200, now);

        const crackGain = this.ctx.createGain();
        crackGain.gain.setValueAtTime(0.35, now);
        crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

        crackSource.connect(crackFilter);
        crackFilter.connect(crackGain);
        crackGain.connect(this.ctx.destination);
        crackSource.start(now);
        crackSource.stop(now + 0.065);
      }

      // 2. Crystalline Glass Resonances (Multi-frequency bell-like shatter ringing)
      const glassFrequencies = [2400, 3850, 5200, 7100];
      const glassDecays = [0.18, 0.14, 0.22, 0.10];
      glassFrequencies.forEach((freq, idx) => {
        const osc = this.ctx!.createOscillator();
        const gain = this.ctx!.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq + (Math.random() - 0.5) * 60, now);

        const decay = glassDecays[idx];
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + decay);

        osc.connect(gain);
        gain.connect(this.ctx!.destination);
        osc.start(now);
        osc.stop(now + decay + 0.01);
      });

      // 3. Scattering Shards Clatter (secondary tiny impacts 35-180ms later)
      if (this.noiseBuffer) {
        const clatterSource = this.ctx.createBufferSource();
        clatterSource.buffer = this.noiseBuffer;
        const clatterFilter = this.ctx.createBiquadFilter();
        clatterFilter.type = 'bandpass';
        clatterFilter.frequency.setValueAtTime(4200, now);
        clatterFilter.Q.setValueAtTime(3.0, now);

        const clatterGain = this.ctx.createGain();
        clatterGain.gain.setValueAtTime(0.001, now);
        clatterGain.gain.setValueAtTime(0.18, now + 0.035);
        clatterGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

        clatterSource.connect(clatterFilter);
        clatterFilter.connect(clatterGain);
        clatterGain.connect(this.ctx.destination);
        clatterSource.start(now);
        clatterSource.stop(now + 0.23);
      }
    } catch (_) {}
  }

  // Celestial Star Collection Chime
  public static playStarCollect(pitchIndex: number = 0): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const baseFreq = 880; // A5
      const freq = baseFreq * Math.pow(1.20, pitchIndex % 5);

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.45, now + 0.16);

      gain.gain.setValueAtTime(0.26, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.30);

      // Shimmering octave harmonic
      const harmOsc = this.ctx.createOscillator();
      const harmGain = this.ctx.createGain();
      harmOsc.type = 'sine';
      harmOsc.frequency.setValueAtTime(freq * 2, now);
      harmGain.gain.setValueAtTime(0.12, now);
      harmGain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      harmOsc.connect(harmGain);
      gain.connect(this.ctx.destination);
      harmGain.connect(this.ctx.destination);

      osc.start(now);
      harmOsc.start(now);
      osc.stop(now + 0.31);
      harmOsc.stop(now + 0.25);
    } catch (_) {}
  }

  // Crisp Metallic / Platform Bounce Clink
  public static playBounce(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;

      // Metallic ping
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(1450, now);
      gain1.gain.setValueAtTime(0.20, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.055);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.065);

      // High harmonic overtone
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(2900, now);
      gain2.gain.setValueAtTime(0.10, now);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now);
      osc2.stop(now + 0.04);
    } catch (_) {}
  }

  // Portal Teleport Whoosh
  public static playPortal(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(380, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.12);

      gain.gain.setValueAtTime(0.20, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.19);
    } catch (_) {}
  }

  // Level Complete Fanfare
  public static playLevelComplete(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.25, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.30);
      }, i * 90);
    });
  }

  // Level Failed Sound
  public static playLevelFailed(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    const notes = [440, 415.3, 392, 349.23];
    notes.forEach((freq, i) => {
      setTimeout(() => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.20, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.start(now);
        osc.stop(now + 0.26);
      }, i * 110);
    });
  }

  // UI Button Tap
  public static playButton(): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.ctx) return;

    try {
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(350, now + 0.05);

      gain.gain.setValueAtTime(0.20, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.07);
    } catch (_) {}
  }
}
