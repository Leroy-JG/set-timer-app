/**
 * Notification « chrono en direct » (Android) : un compte à rebours que le système fait défiler tout seul dans la barre de
 * notifications, pour suivre la série sans ouvrir l'app (module natif local `modules/live-timer`).
 * Sans le module (Expo Go, iPhone, web) tout est sans effet.
 */
import { requireOptionalNativeModule } from 'expo';

type LiveTimerNative = {
  show(endAt: number, title: string, text: string): boolean;
  hide(): void;
};

const native = requireOptionalNativeModule<LiveTimerNative>('LiveTimer');

/** Affiche (ou met à jour) le compte à rebours jusqu'à `endAt` (ms). Retiré tout seul à l'heure de fin. */
export function showLiveTimer(endAt: number, title: string, text: string) {
  try {
    native?.show(endAt, title, text);
  } catch {
    // le compte à rebours dans la barre est un confort : jamais d'erreur pour l'utilisateur
  }
}

export function hideLiveTimer() {
  try {
    native?.hide();
  } catch {
    // ignoré
  }
}
