/** Sons dans l'app (téléphone) : trois petits fichiers locaux lus par expo-audio. Le mode silencieux de l'iPhone est respecté. */
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

export type Cue = 'go' | 'end' | 'final';

const SOURCES: Record<Cue, number> = {
  go: require('../../assets/sounds/go.wav'),
  end: require('../../assets/sounds/end.wav'),
  final: require('../../assets/sounds/final.wav'),
};

const players: Partial<Record<Cue, AudioPlayer>> = {};
let configured = false;

/** Prépare la lecture (créée une seule fois, au premier besoin : l'app ne charge rien si le son est coupé). */
export function prepareSound() {
  if (configured) return;
  configured = true;
  try {
    // La musique de la salle baisse un instant au lieu de s'arrêter.
    void setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'duckOthers', shouldPlayInBackground: false }).catch(() => {});
    for (const cue of Object.keys(SOURCES) as Cue[]) players[cue] = createAudioPlayer(SOURCES[cue]);
  } catch {
    // pas de son disponible : la vibration et l'affichage suffisent
  }
}

export function playCue(cue: Cue) {
  prepareSound();
  try {
    const player = players[cue];
    if (!player) return;
    player.seekTo(0).then(() => player.play(), () => player.play());
  } catch {
    // ignoré
  }
}
