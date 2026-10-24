// iOS only allows audio after a user gesture, so the context is created when a set is
// checked off and reused for the end-of-rest beep.
let ctx: AudioContext | undefined;

export function unlockAudio(): void {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
  } catch {
    // No audio support; the timer still shows visually.
  }
}

export function restDoneSignal(): void {
  navigator.vibrate?.([200, 100, 200]);
  if (!ctx) return;
  const t = ctx.currentTime;
  for (const offset of [0, 0.25]) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, t + offset);
    gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t + offset);
    osc.stop(t + offset + 0.2);
  }
}
