// Web Audio API Sound Feedback for Instant Scanner Audio & Mobile Vibration
// Works 100% offline, zero latency, zero external asset dependencies

class SoundFeedback {
  private ctx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  public init() {
    try {
      if (typeof window === 'undefined') return;
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.ctx = new AudioCtx();
        }
      }
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('AudioContext init error:', e);
    }
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  // 1. Instant Scanner Beep (Supermarket / Barcode Scanner 'BEEP!')
  public playScanBeep() {
    if (!this.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(1800, now + 0.08);

      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.085);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(60);
      }
    } catch (err) {
      console.warn('Scan beep playback failed:', err);
    }
  }

  // 2. Verified Success Chime (Bright, celebratory high chord)
  public playSuccessChime() {
    if (!this.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Note 1: 1046.5 Hz (C6)
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(1046.5, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.16);

      // Note 2: 1318.5 Hz (E6)
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1318.5, now + 0.09);
      gain2.gain.setValueAtTime(0.45, now + 0.09);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.09);
      osc2.stop(now + 0.3);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([80, 50, 120]);
      }
    } catch (err) {
      console.warn('Success chime playback failed:', err);
    }
  }

  // 3. Error / Already Used Buzzer (Deep double warning buzz)
  public playErrorBuzz() {
    if (!this.soundEnabled) return;
    try {
      this.init();
      if (!this.ctx) return;

      const now = this.ctx.currentTime;

      // Low Buzz 1
      const osc1 = this.ctx.createOscillator();
      const gain1 = this.ctx.createGain();
      osc1.type = 'sawtooth';
      osc1.frequency.setValueAtTime(290, now);
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.13);
      osc1.connect(gain1);
      gain1.connect(this.ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.13);

      // Low Buzz 2
      const osc2 = this.ctx.createOscillator();
      const gain2 = this.ctx.createGain();
      osc2.type = 'sawtooth';
      osc2.frequency.setValueAtTime(220, now + 0.16);
      gain2.gain.setValueAtTime(0.4, now + 0.16);
      gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.34);
      osc2.connect(gain2);
      gain2.connect(this.ctx.destination);
      osc2.start(now + 0.16);
      osc2.stop(now + 0.34);

      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([200, 80, 250]);
      }
    } catch (err) {
      console.warn('Error buzz playback failed:', err);
    }
  }
}

export const sound = new SoundFeedback();
