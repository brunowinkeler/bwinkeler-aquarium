// Generated sea ambience: no recordings, so nothing to license. Web Audio only (Chromium 53).

const CHORDS = [
  [50, 57, 61, 66], // Dmaj7
  [47, 54, 57, 62], // Bm7
  [43, 50, 54, 59], // Gmaj7
  [45, 52, 59, 61], // A6sus2
];
// D major pentatonic, two octaves up, for the bell notes.
const BELLS = [74, 76, 78, 81, 83, 86];
const CHORD_SECONDS = 10;
const VOLUME = 0.35;

function frequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function between(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type AudioContextClass = new () => AudioContext;

function audioContextClass(): AudioContextClass | null {
  const scope = window as unknown as {
    AudioContext?: AudioContextClass;
    webkitAudioContext?: AudioContextClass;
  };
  return scope.AudioContext || scope.webkitAudioContext || null;
}

/** Slow pad chords, sparse bells, waves and bubbles, mixed through a soft echo. */
export class SeaAmbience {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private pad: AudioNode | null = null;
  private echo: AudioNode | null = null;
  private waves: GainNode | null = null;
  private running = false;
  private chord = 0;
  private timers: number[] = [];
  private unlockBound = false;

  get state(): 'off' | 'waiting' | 'playing' | 'unavailable' {
    if (!audioContextClass()) return 'unavailable';
    if (!this.running || !this.context) return 'off';
    return this.context.state === 'running' ? 'playing' : 'waiting';
  }

  start(): void {
    if (this.running) return;
    const context = this.setUp();
    if (!context || !this.master) return;
    this.running = true;
    this.unlock();
    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(VOLUME, now + 3);
    this.playChord();
    this.later(() => this.playBell(), between(2, 4));
    this.later(() => this.swell(), 0.1);
    this.later(() => this.bubbles(), between(3, 6));
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    for (const timer of this.timers) window.clearTimeout(timer);
    this.timers = [];
    const context = this.context;
    if (!context || !this.master) return;
    const now = context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(this.master.gain.value, now);
    this.master.gain.linearRampToValueAtTime(0, now + 1.5);
    window.setTimeout(() => {
      if (!this.running && context.state === 'running') context.suspend().catch(() => undefined);
    }, 1800);
  }

  private setUp(): AudioContext | null {
    if (this.context) return this.context;
    const Context = audioContextClass();
    if (!Context) return null;
    let context: AudioContext;
    try {
      context = new Context();
    } catch {
      return null;
    }
    const master = context.createGain();
    master.gain.value = 0;
    master.connect(context.destination);

    // A feedback delay with a darkening filter stands in for reverb, which is too heavy for a TV.
    const delay = context.createDelay(2);
    delay.delayTime.value = 0.42;
    const feedback = context.createGain();
    feedback.gain.value = 0.38;
    const darken = context.createBiquadFilter();
    darken.type = 'lowpass';
    darken.frequency.value = 2200;
    const wet = context.createGain();
    wet.gain.value = 0.5;
    delay.connect(darken);
    darken.connect(feedback);
    feedback.connect(delay);
    darken.connect(wet);
    wet.connect(master);

    const pad = context.createBiquadFilter();
    pad.type = 'lowpass';
    pad.frequency.value = 900;
    pad.Q.value = 0.4;
    pad.connect(master);
    pad.connect(delay);

    const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    source.buffer = noise;
    source.loop = true;
    const surf = context.createBiquadFilter();
    surf.type = 'lowpass';
    surf.frequency.value = 520;
    const waves = context.createGain();
    waves.gain.value = 0.02;
    source.connect(surf);
    surf.connect(waves);
    waves.connect(master);
    source.start();

    this.context = context;
    this.master = master;
    this.pad = pad;
    this.echo = delay;
    this.waves = waves;
    return context;
  }

  /** Browsers keep audio suspended until the first click or key press. */
  private unlock(): void {
    const context = this.context;
    if (!context || context.state === 'running') return;
    context.resume().catch(() => undefined);
    if (this.unlockBound) return;
    this.unlockBound = true;
    const resume = () => {
      if (this.running && this.context && this.context.state !== 'running') {
        this.context.resume().catch(() => undefined);
      }
    };
    for (const type of ['keydown', 'mousedown', 'touchstart']) {
      document.addEventListener(type, resume, true);
    }
  }

  private later(action: () => void, seconds: number): void {
    const timer = window.setTimeout(() => {
      this.timers = this.timers.filter((pending) => pending !== timer);
      if (this.running) action();
    }, seconds * 1000);
    this.timers.push(timer);
  }

  private playChord(): void {
    const context = this.context;
    const pad = this.pad;
    if (!context || !pad) return;
    const notes = CHORDS[this.chord % CHORDS.length] as number[];
    this.chord++;
    const start = context.currentTime + 0.05;
    const end = start + CHORD_SECONDS + 4;
    for (const note of notes) {
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(0.05, start + 3.5);
      envelope.gain.setValueAtTime(0.05, end - 4);
      envelope.gain.linearRampToValueAtTime(0, end);
      envelope.connect(pad);
      for (const [type, detune] of [
        ['triangle', 0],
        ['sine', 7],
      ] as const) {
        const oscillator = context.createOscillator();
        oscillator.type = type;
        oscillator.frequency.value = frequency(note);
        oscillator.detune.value = detune;
        oscillator.connect(envelope);
        oscillator.start(start);
        oscillator.stop(end + 0.1);
      }
    }
    this.later(() => this.playChord(), CHORD_SECONDS);
  }

  private playBell(): void {
    const context = this.context;
    const echo = this.echo;
    const master = this.master;
    if (!context || !echo || !master) return;
    const note = BELLS[Math.floor(Math.random() * BELLS.length)] as number;
    const start = context.currentTime + 0.05;
    const envelope = context.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(0.07, start + 0.015);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 2.8);
    envelope.connect(master);
    envelope.connect(echo);
    for (const [ratio, level] of [
      [1, 1],
      [2.01, 0.25],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency(note) * ratio;
      gain.gain.value = level;
      oscillator.connect(gain);
      gain.connect(envelope);
      oscillator.start(start);
      oscillator.stop(start + 3);
    }
    this.later(() => this.playBell(), between(2.5, 6.5));
  }

  /** One wave washing in and out. */
  private swell(): void {
    const context = this.context;
    const waves = this.waves;
    if (!context || !waves) return;
    const rise = between(2.5, 4);
    const fall = between(3.5, 5.5);
    const now = context.currentTime;
    waves.gain.cancelScheduledValues(now);
    waves.gain.setValueAtTime(waves.gain.value, now);
    waves.gain.linearRampToValueAtTime(between(0.1, 0.16), now + rise);
    waves.gain.linearRampToValueAtTime(0.02, now + rise + fall);
    this.later(() => this.swell(), rise + fall + between(0.5, 2));
  }

  private bubbles(): void {
    const context = this.context;
    const master = this.master;
    if (!context || !master) return;
    const count = 2 + Math.floor(Math.random() * 4);
    let at = context.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const low = between(260, 420);
      const length = between(0.06, 0.12);
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(low, at);
      oscillator.frequency.exponentialRampToValueAtTime(low * between(2, 3), at + length);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.03, at + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + length + 0.05);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(at);
      oscillator.stop(at + length + 0.1);
      at += between(0.08, 0.25);
    }
    this.later(() => this.bubbles(), between(4, 9));
  }
}
