// Fully procedural WebAudio soundscape: calm pentatonic pads near the surface,
// drones, whispers and a heartbeat as you go deeper. No audio files.

export class Audio {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private reverb!: ConvolverNode;
  private wet!: GainNode;
  private water!: GainNode;
  private waterFilter!: BiquadFilterNode;
  private calm!: GainNode;
  private drone!: GainNode;
  private droneFilter!: BiquadFilterNode;
  private whisper!: GainNode;
  private whisperFilter!: BiquadFilterNode;
  private noiseBuf!: AudioBuffer;
  private noteT = 0;
  private beatT = 0;
  private bubbleT = 0;
  private whaleT = 25;
  muted = false;

  start() {
    if (this.ctx) {
      this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(4.5);
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.6;
    this.reverb.connect(this.wet).connect(this.master);

    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      // Brown-ish noise: muffled, watery.
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }

    // Underwater rumble bed.
    const n = this.loopNoise();
    this.waterFilter = ctx.createBiquadFilter();
    this.waterFilter.type = 'lowpass';
    this.waterFilter.frequency.value = 500;
    this.water = ctx.createGain();
    this.water.gain.value = 0.35;
    n.connect(this.waterFilter).connect(this.water).connect(this.master);

    this.calm = ctx.createGain();
    this.calm.gain.value = 0.5;
    this.calm.connect(this.master);
    this.calm.connect(this.reverb);

    // Drone: detuned low oscillators, filter opens with depth.
    this.drone = ctx.createGain();
    this.drone.gain.value = 0;
    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 180;
    this.droneFilter.Q.value = 6;
    for (const [f, type] of [[41.2, 'sawtooth'], [41.9, 'sawtooth'], [61.7, 'triangle'], [29.1, 'sine']] as const) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + Math.random() * 0.1;
      const lg = ctx.createGain();
      lg.gain.value = 0.8;
      lfo.connect(lg).connect(o.frequency);
      o.connect(this.droneFilter);
      o.start();
      lfo.start();
    }
    this.droneFilter.connect(this.drone).connect(this.master);
    this.drone.connect(this.reverb);

    // Whispers: band-passed noise with a wandering centre frequency.
    const wn = this.loopNoise(true);
    this.whisperFilter = ctx.createBiquadFilter();
    this.whisperFilter.type = 'bandpass';
    this.whisperFilter.Q.value = 9;
    this.whisperFilter.frequency.value = 1200;
    this.whisper = ctx.createGain();
    this.whisper.gain.value = 0;
    wn.connect(this.whisperFilter).connect(this.whisper);
    this.whisper.connect(this.reverb);
    this.whisper.connect(this.master);
  }

  private impulse(sec: number) {
    const ctx = this.ctx!;
    const len = ctx.sampleRate * sec;
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return b;
  }

  private loopNoise(white = false) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    if (white) {
      const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = b.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      src.buffer = b;
    } else src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    return src;
  }

  private tone(freq: number, dur: number, vol: number, type: OscillatorType = 'sine', dest?: AudioNode, glideTo?: number, attack = 0.01) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(dest ?? this.master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noiseHit(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', sweepTo?: number) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    s.buffer = b;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(this.master);
    s.start(t);
  }

  fire() {
    this.noiseHit(0.25, 0.5, 2400, 'bandpass', 300);
    this.tone(220, 0.2, 0.2, 'triangle', undefined, 60);
  }
  hit() {
    this.tone(140, 0.15, 0.5, 'square', undefined, 50);
    this.noiseHit(0.12, 0.4, 900);
  }
  catchHealthy() {
    [659, 784, 988].forEach((f, i) => setTimeout(() => this.tone(f, 0.5, 0.18, 'sine', this.calm), i * 90));
  }
  catchInfected(level: number) {
    this.noiseHit(0.5, 0.5, 400, 'lowpass', 80);
    this.tone(90, 0.6, 0.3 * level + 0.1, 'sawtooth', this.reverb, 45);
  }
  hurt() {
    this.noiseHit(0.35, 0.8, 300, 'lowpass', 60);
    this.tone(70, 0.4, 0.6, 'sine', undefined, 35);
  }
  splash() {
    this.noiseHit(0.8, 0.5, 1800, 'lowpass', 200);
  }
  buy() {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.35, 0.15, 'triangle'), i * 70));
  }
  sell() {
    [880, 1175].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 0.15, 'sine'), i * 80));
  }
  heartbeat(vol: number) {
    this.tone(55, 0.18, vol, 'sine', undefined, 38);
    setTimeout(() => this.tone(50, 0.2, vol * 0.8, 'sine', undefined, 34), 220);
  }

  /** Long mournful glide with vibrato — the thing in the trench. */
  whale(vol = 0.5, base = 70) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base * 1.9, t + 2.2);
    o.frequency.linearRampToValueAtTime(base * 0.7, t + 5.5);
    const vib = ctx.createOscillator();
    vib.frequency.value = 5;
    const vg = ctx.createGain();
    vg.gain.value = base * 0.03;
    vib.connect(vg).connect(o.frequency);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 600;
    f.Q.value = 8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 1.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
    o.connect(f).connect(g);
    g.connect(this.reverb);
    g.connect(this.master);
    o.start(t);
    vib.start(t);
    o.stop(t + 6.2);
    vib.stop(t + 6.2);
  }

  rumble(dur: number, vol: number) {
    this.noiseHit(dur, vol, 120, 'lowpass', 40);
  }
  crunch() {
    this.noiseHit(1.6, 1.2, 900, 'lowpass', 40);
    this.tone(45, 1.5, 0.9, 'sawtooth', undefined, 25);
  }

  /** Called every frame with gameplay state; mixes the soundscape. */
  update(dt: number, depth: number, danger: number, above: boolean, cinematic = false) {
    const ctx = this.ctx;
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, depth / 600);
    this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, t, 0.1);
    this.waterFilter.frequency.setTargetAtTime(above ? 2500 : 500 - k * 350, t, 0.3);
    this.water.gain.setTargetAtTime(above ? 0.12 : 0.35 + k * 0.2, t, 0.3);
    this.calm.gain.setTargetAtTime(Math.max(0, 1 - depth / 110) * 0.5, t, 0.5);
    this.drone.gain.setTargetAtTime(cinematic ? 0.25 : Math.max(0, (depth - 60) / 540) * 0.28, t, 0.8);
    this.droneFilter.frequency.setTargetAtTime(120 + k * 380, t, 0.8);
    const wv = Math.max(0, (depth - 280) / 320);
    this.whisper.gain.setTargetAtTime(wv * 0.06 * (0.5 + 0.5 * Math.sin(t * 0.37)), t, 0.4);
    this.whisperFilter.frequency.setTargetAtTime(700 + 900 * (0.5 + 0.5 * Math.sin(t * 1.3) * Math.sin(t * 0.71)), t, 0.1);
    if (cinematic) return;

    // Calm pentatonic music near the surface — the lie the game opens with.
    this.noteT -= dt;
    if (this.noteT <= 0 && depth < 110) {
      const scale = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
      const f = scale[Math.floor(Math.random() * scale.length)];
      this.tone(f, 3.5, 0.12, 'sine', this.calm, undefined, 0.6);
      if (Math.random() < 0.4) this.tone(f / 2, 4, 0.08, 'triangle', this.calm, undefined, 0.8);
      this.noteT = 1.2 + Math.random() * 1.8;
    } else if (this.noteT <= 0) {
      // Deeper the "melody" decays into detuned, falling notes.
      if (Math.random() < 0.3) {
        const f = 110 + Math.random() * 40;
        this.tone(f, 5, 0.06, 'sine', this.reverb, f * 0.94, 1.5);
      }
      this.noteT = 3 + Math.random() * 4;
    }

    this.bubbleT -= dt;
    if (this.bubbleT <= 0 && !above) {
      for (let i = 0; i < 4; i++) setTimeout(() => this.tone(500 + Math.random() * 900, 0.06, 0.05, 'sine', undefined, 1600), i * 60);
      this.bubbleT = 4 + Math.random() * 2;
    }

    const beat = Math.max(danger, Math.max(0, (depth - 380) / 220) * 0.6);
    this.beatT -= dt;
    if (beat > 0.15 && this.beatT <= 0) {
      this.heartbeat(0.25 + beat * 0.5);
      this.beatT = 1.3 - beat * 0.7;
    }

    this.whaleT -= dt;
    if (this.whaleT <= 0 && depth > 320) {
      this.whale(0.15 + k * 0.3, 55 + Math.random() * 25);
      this.whaleT = 25 + Math.random() * 35;
    }
  }
}
