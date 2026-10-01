/** Préférences des trois petits boutons (enregistrées sur l'appareil). */
export interface Prefs {
  /** Sons dans l'app (départ et fin de série). Les notifications ont leur propre bouton. */
  sound: boolean;
  /** Notification de fin de série (téléphone verrouillé ou app en arrière-plan). */
  notifications: boolean;
  /** Écran allumé pendant que le chrono tourne. */
  awake: boolean;
}

export const DEFAULT_PREFS: Prefs = { sound: true, notifications: true, awake: true };

/** Préférences lues depuis le stockage : toute valeur invalide retombe sur la valeur par défaut (tout activé). */
export function sanitizePrefs(raw: unknown): Prefs {
  const o = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  return {
    sound: flag(o.sound, DEFAULT_PREFS.sound),
    notifications: flag(o.notifications, DEFAULT_PREFS.notifications),
    awake: flag(o.awake, DEFAULT_PREFS.awake),
  };
}
