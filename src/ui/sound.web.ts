/** Sons dans l'app (navigateur) : Web Audio, aucun fichier ni connexion. Mêmes notes que scripts/make-sounds.mjs. */

export type Cue = 'go' | 'end' | 'final';

const NOTES: Record<Cue, { hz: number; at: number; len: number }[]> = {
  go: [{ hz: 659.25, at: 0, len: 0.1 }, { hz: 880, at: 0.08, len: 0.16 }],
  end: [{ hz: 987.77, at: 0, len: 0.16 }, { hz: 783.99, at: 0.14, len: 0.28 }],
  final: [{ hz: 783.99, at: 0, len: 0.16 }, { hz: 987.77, at: 0.14, len: 0.16 }, { hz: 1318.51, at: 0.28, len: 0.5 }],
};

let audio: AudioContext | null = null;

type AudioCtor = typeof AudioContext;
function audioContext(): AudioContext | null {
  try {
    const g = globalThis as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctx = g.AudioContext ?? g.webkitAudioContext;
    if (!Ctx) return null;
    audio ??= new Ctx();
    return audio;
  } catch {
    return null;
  }
}

/** À appeler sur un geste de l'utilisateur : les navigateurs n'autorisent le son qu'après un geste. */
export function prepareSound() {
  try {
    void audioContext()?.resume();
  } catch {
    // ignoré
  }
}

export function playCue(cue: Cue) {
  try {
    const ctx = audioContext();
    if (!ctx) return;
    void ctx.resume();
    for (const { hz, at, len } of NOTES[cue]) {
      const t = ctx.currentTime + at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    }
  } catch {
    // pas de son disponible
  }
}
