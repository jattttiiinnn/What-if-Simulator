import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'cws:sound';

/** Short, soft WebAudio blips. Off by default — the user must opt in. */
const TONES = {
  click: { freq: 420, duration: 0.08, gain: 0.045, type: 'sine' },
  reveal: { freq: 660, duration: 0.16, gain: 0.05, type: 'sine' },
  open: { freq: 880, duration: 0.12, gain: 0.04, type: 'triangle' },
  close: { freq: 330, duration: 0.1, gain: 0.035, type: 'sine' },
};

export function useAudioFeedback() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      return false;
    }
  });
  const contextRef = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off');
    } catch {
      /* storage unavailable — sound preference just won't persist */
    }
    if (!enabled && contextRef.current) {
      contextRef.current.close?.();
      contextRef.current = null;
    }
  }, [enabled]);

  const unlock = useCallback(() => {
    if (contextRef.current) return contextRef.current;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    try {
      contextRef.current = new Ctor();
    } catch {
      contextRef.current = null;
    }
    return contextRef.current;
  }, []);

  const play = useCallback(
    (name = 'click') => {
      if (!enabled) return;
      const ctx = unlock();
      const tone = TONES[name] || TONES.click;
      if (!ctx) return;
      try {
        if (ctx.state === 'suspended') ctx.resume();
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const now = ctx.currentTime;
        oscillator.type = tone.type;
        oscillator.frequency.setValueAtTime(tone.freq, now);
        oscillator.frequency.exponentialRampToValueAtTime(tone.freq * 1.5, now + tone.duration);
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(tone.gain, now + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + tone.duration);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(now);
        oscillator.stop(now + tone.duration + 0.02);
      } catch {
        /* audio is a garnish — never let it break the interaction */
      }
    },
    [enabled, unlock]
  );

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) unlock();
      return next;
    });
  }, [unlock]);

  return { enabled, toggle, play };
}
