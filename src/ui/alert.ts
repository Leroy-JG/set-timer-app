import { Vibration } from 'react-native';
import { playCue } from './sound';

export { prepareSound } from './sound';

/** « Go » : petit son de départ. */
export function alertStart(sound: boolean) {
  if (sound) playCue('go');
}

/**
 * Fin d'une série constatée dans l'app (`final` : dernière série). Quand l'app est en arrière-plan, c'est la notification
 * programmée qui prévient (son et vibration du téléphone).
 * `buzz` : vibrer aussi (fin naturelle) ; un appui sur le chrono ne fait que le son.
 */
export function alertSetDone(final: boolean, sound: boolean, buzz: boolean) {
  if (sound) playCue(final ? 'final' : 'end');
  if (!buzz) return;
  try {
    Vibration.vibrate(final ? [0, 400, 150, 400, 150, 400] : [0, 350]);
  } catch {
    // vibration indisponible
  }
}
