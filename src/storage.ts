import AsyncStorage from '@react-native-async-storage/async-storage';
import { sanitizePrefs, type Prefs } from './domain/prefs';
import { sanitizeConfig, type TimerConfig, type TimerState } from './domain/timer';

const CONFIG_KEY = 'st:config:v1';
const TIMER_KEY = 'st:timer:v1';
const PREFS_KEY = 'st:prefs:v1';

async function read(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null; // stockage indisponible ou contenu illisible : valeurs par défaut
  }
}

async function write(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée, disque plein…) : l'app fonctionne quand même
  }
}

/** Réglages enregistrés sur l'appareil (jamais envoyés ailleurs). */
export async function loadConfig(): Promise<TimerConfig> {
  return sanitizeConfig(await read(CONFIG_KEY));
}

export function saveConfig(config: TimerConfig): Promise<void> {
  return write(CONFIG_KEY, config);
}

/** État du chrono, enregistré à chaque changement : il survit à la fermeture de l'app par le système. Validé par `sanitizeState`. */
export function loadTimer(): Promise<unknown> {
  return read(TIMER_KEY);
}

export function saveTimer(state: TimerState): Promise<void> {
  return write(TIMER_KEY, state);
}

export async function loadPrefs(): Promise<Prefs> {
  return sanitizePrefs(await read(PREFS_KEY));
}

export function savePrefs(prefs: Prefs): Promise<void> {
  return write(PREFS_KEY, prefs);
}
