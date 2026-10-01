/**
 * Alarme de fin + compte à rebours persistant (Android), via le module natif local `modules/live-timer` :
 *  - une alarme du système (AlarmManager) affiche la notification de fin (bandeau + son + vibration) à 00:00, même app fermée ;
 *  - un service au premier plan affiche dans la barre de notifications le temps restant qui défile (animé par le système) et
 *    empêche le téléphone de couper l'app en arrière-plan.
 * Sans le module (Expo Go, iPhone, web) tout est sans effet et `startLiveTimer` renvoie false : `useTimer` retombe alors sur la
 * notification programmée d'`expo-notifications`.
 */
import { requireOptionalNativeModule } from 'expo';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

type LiveTimerNative = {
  start(endAt: number, title: string, text: string, endTitle: string, endText: string): boolean;
  stop(): void;
  isBackgroundUnrestricted(): boolean;
  requestBackgroundUnrestricted(): void;
};

const native = requireOptionalNativeModule<LiveTimerNative>('LiveTimer');

/**
 * Arme l'alarme de fin et affiche le compte à rebours jusqu'à `endAt` (ms) ; rappelée, elle met tout à jour (horloge déplacée).
 * Renvoie true si l'alarme native est armée (alors la notification programmée d'expo n'est pas nécessaire).
 */
export function startLiveTimer(endAt: number, title: string, text: string, endTitle: string, endText: string): boolean {
  try {
    return native?.start(endAt, title, text, endTitle, endText) === true;
  } catch {
    return false;
  }
}

/** Série arrêtée avant l'heure (appui sur le chrono, réglage modifié, bouton coupé) : plus d'alarme ni de compte à rebours. */
export function stopLiveTimer() {
  try {
    native?.stop();
  } catch {
    // ignoré
  }
}

function readRestricted(): boolean {
  try {
    return native ? !native.isBackgroundUnrestricted() : false;
  } catch {
    return false;
  }
}

/** Ouvre la fenêtre du système « Autoriser l'app à rester active en arrière-plan ? » (exemption d'économie de batterie). */
export function requestBackgroundUnrestricted() {
  try {
    native?.requestBackgroundUnrestricted();
  } catch {
    // ignoré
  }
}

/** true tant que le téléphone peut couper l'app en arrière-plan (économie de batterie) ; relu au retour dans l'app. */
export function useBackgroundRestricted(): boolean {
  const [restricted, setRestricted] = useState(readRestricted);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setRestricted(readRestricted());
    });
    return () => sub.remove();
  }, []);
  return restricted;
}
