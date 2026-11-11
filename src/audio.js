// Procedural synthwave audio engine — everything is synthesised with the
// Web Audio API at runtime, no audio files involved.

const BPM = 112;
const STEP = 60 / BPM / 4; // one 16th note, in seconds
const LOOKAHEAD = 0.12;

// Am – F – C – G, one bar each. Frequencies in Hz.
const CHORDS = [
  { root: 55.0, notes: [220.0, 261.63, 329.63] }, // A minor
  { root: 43.65, notes: [174.61, 220.0, 261.63] }, // F major
  { root: 65.41, notes: [196.0, 261.63, 329.63] }, // C major
  { root: 49.0, notes: [196.0, 246.94, 293.66] }, // G major
];
const ARP_PATTERN = [0, 1, 2, 1, 0, 2, 1, 2, 0, 1, 2, 1, 2, 1, 0, 2];

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicPlaying = false;
    this.step = 0;
    this.nextStepTime = 0;
    this.timer = null;
    this.engine = null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = (this.ctx = new Ctx());

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    this.master.connect(comp).connect(ctx.destination);

    // Music bus: everything goes through one lowpass that opens up on turbo.
    this.musicGain = ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicFilter = ctx.createBiquadFilter();
    this.musicFilter.type = 'lowpass';
    this.musicFilter.frequency.value = 2600;
    this.musicGain.connect(this.musicFilter).connect(this.master);

    // Feedback delay for the arpeggio.
    this.delay = ctx.createDelay(1);
    this.delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.35;
    const wet = ctx.createGain();
    wet.gain.value = 0.3;
    this.delay.connect(fb).connect(this.delay);
    this.delay.connect(wet).connect(this.musicGain);

    this.sfxGain = ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.master);

    // One second of white noise shared by drums and effects.
    const len = ctx.sampleRate;
    this.noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.9, this.ctx.currentTime, 0.03);
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ---------------------------------------------------------------- music
  startMusic() {
    if (!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    this.step = 0;
    this.nextStepTime = this.ctx.currentTime + 0.06;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running') return;
    // If the tab was throttled, skip ahead rather than burst-playing notes.
    if (this.nextStepTime < ctx.currentTime - 0.2) this.nextStepTime = ctx.currentTime + 0.05;
    while (this.nextStepTime < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.nextStepTime);
      this.step = (this.step + 1) % 64;
      this.nextStepTime += STEP;
    }
  }

  playStep(step, t) {
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const chord = CHORDS[bar];

    if (s === 0) this.pad(chord, t, STEP * 16);
    if (s % 4 === 0) this.kick(t);
    if (s === 4 || s === 12) this.snare(t);
    if (s % 2 === 0) this.hat(t, s % 4 === 2 ? 0.16 : 0.07);

    // Driving 8th-note bass with an octave jump on the off-beats.
    if (s % 2 === 0) this.bass(chord.root * (s % 4 === 2 ? 2 : 1), t);

    const note = chord.notes[ARP_PATTERN[s]] * (s % 8 >= 4 ? 2 : 1);
    this.arp(note * 2, t);
  }

  env(gainNode, t, peak, attack, decay) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + attack);
    g.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  bass(freq, t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(900, t);
    filter.frequency.exponentialRampToValueAtTime(140, t + STEP * 1.8);
    const gain = ctx.createGain();
    this.env(gain, t, 0.42, 0.005, STEP * 1.9);
    osc.connect(filter).connect(gain).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + STEP * 2.2);
  }

  arp(freq, t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2200;
    const gain = ctx.createGain();
    this.env(gain, t, 0.07, 0.004, STEP * 0.9);
    osc.connect(filter).connect(gain);
    gain.connect(this.musicGain);
    gain.connect(this.delay);
    osc.start(t);
    osc.stop(t + STEP * 1.2);
  }

  pad(chord, t, dur) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1100;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(0.055, t + dur * 0.3);
    gain.gain.linearRampToValueAtTime(0.0001, t + dur * 1.05);
    filter.connect(gain).connect(this.musicGain);
    for (const note of chord.notes) {
      for (const detune of [-9, 9]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = note;
        osc.detune.value = detune;
        osc.connect(filter);
        osc.start(t);
        osc.stop(t + dur * 1.1);
      }
    }
  }

  kick(t) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const gain = ctx.createGain();
    this.env(gain, t, 0.9, 0.003, 0.22);
    osc.connect(gain).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.3);
  }

  noise(t, dur, dest) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    src.connect(dest);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur);
    return src;
  }

  snare(t) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    this.env(gain, t, 0.5, 0.002, 0.2);
    filter.connect(gain).connect(this.musicGain);
    this.noise(t, 0.25, filter);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    const og = ctx.createGain();
    this.env(og, t, 0.3, 0.002, 0.12);
    osc.connect(og).connect(this.musicGain);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  hat(t, level) {
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;
    const gain = ctx.createGain();
    this.env(gain, t, level, 0.001, 0.045);
    filter.connect(gain).connect(this.musicGain);
    this.noise(t, 0.06, filter);
  }

  // --------------------------------------------------------------- engine
  startEngine() {
    if (!this.ctx || this.engine) return;
    const ctx = this.ctx;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;
    filter.Q.value = 3;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.11, ctx.currentTime, 0.3);
    filter.connect(gain).connect(this.sfxGain);
    const oscs = [
      ['sawtooth', 1, 0],
      ['square', 0.5, 7],
      ['sawtooth', 1.5, -5],
    ].map(([type, ratio, detune]) => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.detune.value = detune;
      osc.connect(filter);
      osc.start();
      return { osc, ratio };
    });
    this.engine = { oscs, filter, gain };
    this.setEngine(0, false);
  }

  /** @param {number} speed world units / second */
  setEngine(speed, boosting) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const base = 38 + speed * 0.62;
    for (const { osc, ratio } of this.engine.oscs) osc.frequency.setTargetAtTime(base * ratio, t, 0.08);
    this.engine.filter.frequency.setTargetAtTime(300 + speed * 6 + (boosting ? 900 : 0), t, 0.1);
    this.musicFilter.frequency.setTargetAtTime(boosting ? 9000 : 2600, t, 0.25);
  }

  stopEngine() {
    if (!this.engine) return;
    const { oscs, gain } = this.engine;
    const t = this.ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setTargetAtTime(0.0001, t, 0.08);
    for (const { osc } of oscs) osc.stop(t + 0.6);
    this.engine = null;
    this.musicFilter.frequency.setTargetAtTime(1200, t, 0.2);
  }

  // ------------------------------------------------------------------ sfx
  boost() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.5;
    filter.frequency.setValueAtTime(300, t);
    filter.frequency.exponentialRampToValueAtTime(5000, t + 0.7);
    const gain = ctx.createGain();
    this.env(gain, t, 0.6, 0.05, 1.0);
    filter.connect(gain).connect(this.sfxGain);
    this.noise(t, 1.1, filter);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(990, t + 0.6);
    const og = ctx.createGain();
    this.env(og, t, 0.16, 0.03, 0.7);
    osc.connect(og).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.8);
  }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    [880, 1318.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      this.env(gain, t + i * 0.07, 0.3, 0.004, 0.16);
      osc.connect(gain).connect(this.sfxGain);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.2);
    });
  }

  crash() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(5000, t);
    filter.frequency.exponentialRampToValueAtTime(120, t + 1.1);
    const gain = ctx.createGain();
    this.env(gain, t, 1.0, 0.002, 1.2);
    filter.connect(gain).connect(this.sfxGain);
    this.noise(t, 1.3, filter);

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = ctx.createGain();
    this.env(og, t, 1.0, 0.002, 0.7);
    osc.connect(og).connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.8);

    // Detuned metallic clang.
    [311, 467, 739].forEach((freq) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = freq;
      const g = ctx.createGain();
      this.env(g, t, 0.08, 0.001, 0.25);
      o.connect(g).connect(this.sfxGain);
      o.start(t);
      o.stop(t + 0.3);
    });
  }
}
