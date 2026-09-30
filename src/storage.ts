import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizeConfig, type TimerConfig } from './domain/timer';

const KEY = 'st:config:v1';

/** Réglages enregistrés sur l'appareil (jamais envoyés ailleurs). Toute erreur retombe sur les valeurs par défaut. */
export async function loadConfig(): Promise<TimerConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return sanitizeConfig(raw ? JSON.parse(raw) : null);
  } catch {
    return sanitizeConfig(null);
  }
}

export async function saveConfig(config: TimerConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(config));
  } catch {
    // stockage indisponible (navigation privée…) : l'app fonctionne quand même
  }
}
