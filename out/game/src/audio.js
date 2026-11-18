// Sound for Solmar Bay: every sound is synthesised with WebAudio, no audio files.
// Engine hum, police siren, gunshots, punches, chimes, crashes and a simple bass loop.
(function () {
  'use strict';
  var ctx = null, master = null, engineOsc = null, engineGain = null, sirenOsc = null, sirenGain = null;
  var musicTimer = null, musicOn = false, muted = false;

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return true; }
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      // Engine: two detuned sawtooths through a lowpass, gain driven by speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      var engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'square';
      engineOsc2.frequency.value = 28;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 420;
      engineOsc.connect(lp); engineOsc2.connect(lp);
      lp.connect(engineGain); engineGain.connect(master);
      engineOsc.start(); engineOsc2.start();
      SB._engineOsc2 = engineOsc2;
      // Siren: triangle sweeping 700..1100 Hz.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 800;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain); sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch (e) { return false; }
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure() || muted) return;
    var t = ctx.currentTime;
    var len = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = filterFreq || 1200;
    var g = ctx.createGain();
    g.gain.value = vol || 0.3;
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t);
  }

  // Simple looping bass line (A minor groove) scheduled on a timer.
  var bassNotes = [55, 55, 65.41, 49, 55, 55, 82.41, 65.41];
  var beat = 0;
  function musicStep() {
    if (!musicOn || !ctx || muted) return;
    tone(bassNotes[beat % bassNotes.length], 0.42, 'triangle', 0.16);
    if (beat % 2 === 0) tone(220, 0.1, 'square', 0.03);
    beat++;
  }

  SB.Audio = {
    init: function () { ensure(); },
    setMuted: function (m) { muted = m; if (master) master.gain.value = m ? 0 : 0.5; },
    isMuted: function () { return muted; },
    setEngine: function (speed01, on) {
      if (!ensure()) return;
      var target = on ? 0.05 + speed01 * 0.10 : 0;
      engineGain.gain.setTargetAtTime(muted ? 0 : target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
      if (SB._engineOsc2) SB._engineOsc2.frequency.setTargetAtTime(28 + speed01 * 65, ctx.currentTime, 0.08);
    },
    setSiren: function (on) {
      if (!ensure()) return;
      sirenGain.gain.setTargetAtTime(on && !muted ? 0.045 : 0, ctx.currentTime, 0.1);
      if (on) {
        var t = ctx.currentTime;
        sirenOsc.frequency.cancelScheduledValues(t);
        sirenOsc.frequency.setValueAtTime(700, t);
        sirenOsc.frequency.linearRampToValueAtTime(1150, t + 0.55);
        sirenOsc.frequency.linearRampToValueAtTime(700, t + 1.1);
      }
    },
    shoot: function () { noise(0.12, 0.5, 3000); tone(180, 0.08, 'square', 0.18, 60); },
    punch: function () { noise(0.09, 0.35, 500); },
    crash: function () { noise(0.3, 0.5, 700); tone(70, 0.25, 'sine', 0.3, 40); },
    chime: function () { tone(660, 0.12, 'sine', 0.2); setTimeout(function () { tone(880, 0.2, 'sine', 0.2); }, 110); },
    fail: function () { tone(220, 0.35, 'sawtooth', 0.18, 110); },
    pickup: function () { tone(520, 0.1, 'sine', 0.22); setTimeout(function () { tone(780, 0.16, 'sine', 0.22); }, 90); },
    horn: function () { tone(370, 0.3, 'square', 0.12); tone(440, 0.3, 'square', 0.1); },
    reload: function () { tone(300, 0.07, 'square', 0.12); setTimeout(function () { tone(420, 0.07, 'square', 0.12); }, 120); },
    startMusic: function () {
      if (musicOn) return;
      musicOn = true;
      if (!musicTimer) musicTimer = setInterval(musicStep, 430);
    },
    stopMusic: function () { musicOn = false; },
  };
})();
