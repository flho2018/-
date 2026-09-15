// =========================================================================
// Web Audio Synthesizer for Gentle Notification & Chime Sounds
// =========================================================================

let audioCtx = null;

const getAudioContext = () => {
  try {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch (e) {
    return null;
  }
};

const playTone = (ctx, freq, startTime, duration, maxGain) => {
  try {
    if (!ctx) return;
    const safeGain = Math.max(0.001, Number(maxGain) || 0.1);
    const safeStart = Math.max(ctx.currentTime, Number(startTime) || ctx.currentTime);
    const safeDuration = Math.max(0.05, Number(duration) || 0.2);

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, safeStart);

    gainNode.gain.setValueAtTime(0.0001, safeStart);
    gainNode.gain.linearRampToValueAtTime(safeGain, safeStart + 0.02);
    gainNode.gain.linearRampToValueAtTime(0.0001, safeStart + safeDuration);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(safeStart);
    osc.stop(safeStart + safeDuration + 0.05);
  } catch (err) {
    // تجاهل أخطاء تشغيل الصوت الصامتة
  }
};

/**
 * نغمة تنبيه صوتي خفيف وناعم ثلاثي التردد (Harmonic Tri-tone Chime)
 */
export const playGentleNotificationSound = (volume = 0.18) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    playTone(ctx, 587.33, now, 0.12, volume * 0.85);
    playTone(ctx, 739.99, now + 0.08, 0.15, volume * 0.95);
    playTone(ctx, 880.00, now + 0.16, 0.35, volume);
  } catch (err) {}
};

/**
 * نغمة إنجاز العملية المباشرة (Double Soft Pop / Beep)
 */
export const playSuccessChime = (volume = 0.15) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 659.25, now, 0.08, volume * 0.8);
    playTone(ctx, 987.77, now + 0.07, 0.22, volume);
  } catch (err) {}
};

/**
 * نغمة تنبيه تحذير خفيف (Soft Alert)
 */
export const playWarningTone = (volume = 0.15) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 440.00, now, 0.12, volume);
    playTone(ctx, 349.23, now + 0.12, 0.20, volume);
  } catch (err) {}
};

/**
 * نغمة قراءة ومسح باركود كاشير سريعة ونقية (Crisp POS Barcode Beep)
 */
export const playBarcodeBeep = (volume = 0.22) => {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    playTone(ctx, 1760.00, now, 0.055, volume);
  } catch (err) {}
};

