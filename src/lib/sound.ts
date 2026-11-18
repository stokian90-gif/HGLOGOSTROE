// Web Audio API notification chime ("Ting!") without needing external audio files
let audioCtx: AudioContext | null = null;
let lastTingAt = 0;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {
      // Ignore autoplay restriction before user interaction
    });
  }
  return audioCtx;
}

export function playTingSound() {
  const nowMs = Date.now();
  if (nowMs - lastTingAt < 650) return;
  lastTingAt = nowMs;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Nada pertama "Ti..."
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(1174.66, now); // D6
    gain1.gain.setValueAtTime(0.001, now);
    gain1.gain.exponentialRampToValueAtTime(0.22, now + 0.015);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.3);

    // Nada kedua "...ng!"
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(1567.98, now + 0.09); // G6
    gain2.gain.setValueAtTime(0.001, now + 0.09);
    gain2.gain.exponentialRampToValueAtTime(0.24, now + 0.11);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.56);
  } catch {
    // Ignore audio context errors silently
  }
}
