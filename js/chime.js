/* Short, quiet tones made with WebAudio so the app carries no sound files.
   Nothing here is a buzzer: running out of time gets the gentlest sound. */
const Chime = (() => {
  let ctx = null;

  function context() {
    if (!ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return null;
      ctx = new Ctx();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function unlock() { context(); }

  function tone(freq, startAt, length, peak) {
    const c = context();
    if (!c) return;
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + startAt;
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.05);
  }

  function play(notes) {
    if (!Store.get() || Store.get().chimeOn === false) return;
    notes.forEach(n => tone(n[0], n[1], n[2], n[3]));
  }

  function star() {
    play([[660, 0, 0.18, 0.18], [880, 0.09, 0.26, 0.16]]);
  }

  function finish() {
    play([[523, 0, 0.22, 0.16], [659, 0.13, 0.22, 0.16], [784, 0.26, 0.26, 0.16], [1046, 0.39, 0.5, 0.14]]);
  }

  function timeUp() {
    play([[392, 0, 0.5, 0.08]]);
  }

  return { unlock, star, finish, timeUp };
})();
