import { Platform, Vibration } from 'react-native';

let audio: AudioContext | null = null;

/** Bip court (Web Audio : aucun fichier, aucune connexion). */
function beep(times: number) {
  try {
    const Ctx: typeof AudioContext | undefined =
      (globalThis as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ??
      (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    const ctx = audio;
    void ctx.resume();
    for (let i = 0; i < times; i++) {
      const t = ctx.currentTime + i * 0.28;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.4, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    }
  } catch {
    // pas de son disponible : la vibration et l'affichage suffisent
  }
}

/** Fin d'une série (`final` : fin de la dernière série). Vibre sur téléphone, bipe sur le web. */
export function notifySetDone(final: boolean) {
  try {
    Vibration.vibrate(final ? [0, 400, 150, 400, 150, 400] : [0, 350]);
  } catch {
    // vibration indisponible
  }
  if (Platform.OS === 'web') beep(final ? 3 : 1);
}

/** À appeler sur un geste de l'utilisateur (« Démarrer ») : les navigateurs n'autorisent le son qu'après un geste. */
export function primeAudio() {
  if (Platform.OS !== 'web') return;
  try {
    const Ctx: typeof AudioContext | undefined = (globalThis as { AudioContext?: typeof AudioContext }).AudioContext;
    if (!Ctx) return;
    audio ??= new Ctx();
    void audio.resume();
  } catch {
    // ignoré
  }
}
