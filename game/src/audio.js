// All sound is synthesised at load with WebAudio: a two-oscillator engine whose
// pitch and filter track the car's speed, tyre noise, sirens that pan and wail,
// a pistol crack, and small UI blips. Nothing is fetched.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.ready = false;
    this.muted = false;
    this.engineGain = null;
    this.engineOsc = null;
    this.engineFilter = null;
    this.tyreGain = null;
    this.sirenGain = null;
    this.sirenOsc = null;
    this.currentStation = 0;
  }

  /** Browsers require a gesture; the first key or click calls this. */
  ensure() {
    if (this.ctx || this.muted) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.build();
      this.ready = true;
    } catch {
      this.muted = true;
    }
  }

  build() {
    const ctx = this.ctx;
    const master = ctx.createGain();
    master.gain.value = 0.34;
    master.connect(ctx.destination);
    this.master = master;

    // Engine: two saws an octave apart through a lowpass, plus a sub.
    const engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 380;
    filter.Q.value = 4.5;
    engineGain.connect(filter).connect(master);

    const oscA = ctx.createOscillator();
    oscA.type = 'sawtooth';
    oscA.frequency.value = 52;
    const oscB = ctx.createOscillator();
    oscB.type = 'square';
    oscB.frequency.value = 26;
    const gA = ctx.createGain();
    gA.gain.value = 0.5;
    const gB = ctx.createGain();
    gB.gain.value = 0.32;
    oscA.connect(gA).connect(engineGain);
    oscB.connect(gB).connect(engineGain);
    oscA.start();
    oscB.start();
    this.engineGain = engineGain;
    this.engineOsc = oscA;
    this.engineOscB = oscB;
    this.engineFilter = filter;

    // Tyre noise: a short noise buffer looped through a bandpass.
    const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < data.length; i++) {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      data[i] = (s / 0x7fffffff) * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuf;
    noise.loop = true;
    const nBand = ctx.createBiquadFilter();
    nBand.type = 'bandpass';
    nBand.frequency.value = 1200;
    nBand.Q.value = 0.7;
    const nGain = ctx.createGain();
    nGain.gain.value = 0;
    noise.connect(nBand).connect(nGain).connect(master);
    noise.start();
    this.tyreGain = nGain;
    this.noiseBuffer = noiseBuf;

    // Siren: a sawtooth wailing between two pitches.
    const sirenGain = ctx.createGain();
    sirenGain.gain.value = 0;
    const sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'sawtooth';
    sirenOsc.frequency.value = 720;
    const sirenFilter = ctx.createBiquadFilter();
    sirenFilter.type = 'bandpass';
    sirenFilter.frequency.value = 1100;
    sirenFilter.Q.value = 2.2;
    sirenOsc.connect(sirenFilter).connect(sirenGain).connect(master);
    sirenOsc.start();
    this.sirenGain = sirenGain;
    this.sirenOsc = sirenOsc;
  }

  engine(speed, throttle, active) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    const rev = Math.min(1, Math.abs(speed) / 34);
    const base = 48 + rev * 132 + Math.abs(throttle) * 22;
    this.engineOsc.frequency.setTargetAtTime(base, t, 0.08);
    this.engineOscB.frequency.setTargetAtTime(base * 0.5, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + rev * 1500 + Math.abs(throttle) * 500, t, 0.1);
    this.engineGain.gain.setTargetAtTime(active ? 0.1 + rev * 0.13 : 0, t, 0.15);
    this.tyreGain.gain.setTargetAtTime(active ? rev * 0.05 : 0, t, 0.2);
  }

  siren(level) {
    if (!this.ready) return;
    const t = this.ctx.currentTime;
    this.sirenGain.gain.setTargetAtTime(level > 0 ? 0.055 : 0, t, 0.4);
    if (level > 0) {
      // Wail: a slow LFO on the siren's pitch.
      const now = t;
      this.sirenOsc.frequency.cancelScheduledValues(now);
      this.sirenOsc.frequency.setValueAtTime(680, now);
      this.sirenOsc.frequency.linearRampToValueAtTime(980, now + 0.85);
      this.sirenOsc.frequency.linearRampToValueAtTime(680, now + 1.7);
    }
  }

  shot() {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const f = ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 900;
    src.connect(f).connect(g).connect(this.master);
    src.start(t, 0, 0.18);
    // A low thump under the crack.
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, t);
    osc.frequency.exponentialRampToValueAtTime(48, t + 0.12);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.32, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    osc.connect(og).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.16);
  }

  blip(freq = 660, len = 0.07, vol = 0.12) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + len);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + len + 0.02);
  }

  crash(strength = 1) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const g = ctx.createGain();
    g.gain.setValueAtTime(Math.min(0.6, 0.18 * strength), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    src.connect(f).connect(g).connect(this.master);
    src.start(t, 0, 0.45);
  }
}
