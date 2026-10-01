import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { DEFAULT_PREFS, type Prefs } from '../domain/prefs';
import {
  clampSeconds,
  clampSets,
  DEFAULT_CONFIG,
  initialState,
  reset,
  sanitizeState,
  seek,
  skip,
  start,
  tick,
  type TimerConfig,
  type TimerState,
} from '../domain/timer';
import {
  cancelSetEnd,
  dismissDelivered,
  requestNotificationPermission,
  scheduleSetEnd,
  setupNotifications,
  showSetDoneNotification,
  useNotificationStatus,
} from '../notifications';
import { loadConfig, loadPrefs, loadTimer, saveConfig, savePrefs, saveTimer } from '../storage';
import { alertSetDone, alertStart, prepareSound } from './alert';

const KEEP_AWAKE_TAG = 'set-timer';
/** Délai avant de programmer la notification : un glissement sur le cercle change l'heure de fin à chaque mouvement. */
const SCHEDULE_DEBOUNCE_MS = 200;
/** Une fin de série constatée plus de 3 s après l'heure prévue (app rouverte longtemps après) ne déclenche plus de signal. */
const STALE_MS = 3000;

export function useTimer() {
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<TimerState>(() => initialState(DEFAULT_CONFIG));
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [ready, setReady] = useState(false);
  const configRef = useRef(config);
  configRef.current = config;
  const stateRef = useRef(state);
  stateRef.current = state;
  const prefsRef = useRef(prefs);
  prefsRef.current = prefs;
  const prevRef = useRef(state);
  const notificationStatus = useNotificationStatus();

  // Au lancement : réglages et chrono enregistrés. Si le système avait fermé l'app pendant un décompte, il reprend là où il en est
  // (l'heure de fin est enregistrée) ; si elle est passée entre-temps, la série est comptée.
  useEffect(() => {
    let alive = true;
    void (async () => {
      await setupNotifications();
      const [cfg, savedPrefs] = await Promise.all([loadConfig(), loadPrefs()]);
      const restored = tick(sanitizeState(await loadTimer(), cfg), cfg, Date.now());
      if (!alive) return;
      prevRef.current = restored; // pas de signal pour ce qui s'est passé pendant que l'app était fermée
      setConfig(cfg);
      setPrefs(savedPrefs);
      setState(restored);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Horloge : on recalcule depuis l'heure réelle (exact même si l'app passe un moment en arrière-plan). L'écran ne se redessine
  // qu'une fois par seconde, juste après le changement de seconde ; le cercle et l'eau s'animent seuls (voir Ring).
  const running = state.phase === 'running';
  const endAt = state.endAt;
  useEffect(() => {
    if (!running || endAt === null) return;
    let id: ReturnType<typeof setTimeout> | undefined;
    const step = () => {
      const now = Date.now();
      setState((s) => tick(s, configRef.current, now));
      const left = endAt - now;
      if (left > 0) id = setTimeout(step, (left % 1000) + 8);
    };
    id = setTimeout(step, ((endAt - Date.now()) % 1000) + 8);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      clearTimeout(id);
      step();
    });
    return () => {
      clearTimeout(id);
      sub.remove();
    };
  }, [running, endAt]);

  // L'écran reste allumé pendant le décompte (si le bouton est activé).
  const keepAwake = running && prefs.awake;
  useEffect(() => {
    if (!keepAwake) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [keepAwake]);

  // Enregistrement du chrono à chaque changement d'état important (pas à chaque top d'horloge).
  const persistKey = `${state.phase}|${state.completed}|${state.endAt ?? ''}|${state.phase === 'running' ? '' : state.remainingMs}`;
  useEffect(() => {
    if (ready) void saveTimer(state);
  }, [ready, persistKey]);

  // Fin de série : signal dans l'app si elle est au premier plan ; annulation de la notification si la série s'arrête autrement
  // (réglage modifié). À 00:00 naturel, on ne l'annule surtout pas : elle est en train de sonner.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!ready || state.phase === 'running') return;
    if (prev.phase === 'running' && state.completed > prev.completed && prev.endAt !== null) {
      const late = Date.now() - prev.endAt;
      const final = state.phase === 'done';
      if (late >= -250 && late < STALE_MS) {
        // fin naturelle, constatée à l'heure prévue
        alertSetDone(final, prefsRef.current.sound, true);
        if (prefsRef.current.notifications) showSetDoneNotification(state.completed, configRef.current.sets);
      } else if (late < -250) {
        // appui sur le chrono : on annule la notification et on confirme par le son
        cancelSetEnd();
        alertSetDone(final, prefsRef.current.sound, false);
      }
    } else {
      cancelSetEnd();
    }
  }, [ready, state]);

  // Notification système à l'heure de fin (déplacée si on bouge l'horloge ; retirée si le bouton est désactivé).
  useEffect(() => {
    if (!ready || state.phase !== 'running' || state.endAt === null) return;
    const end = state.endAt;
    const setNumber = state.completed + 1;
    const sets = config.sets;
    cancelSetEnd(); // l'ancienne heure n'est plus bonne
    if (!prefs.notifications) return;
    const id = setTimeout(() => scheduleSetEnd(end, setNumber, sets), SCHEDULE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [ready, state.phase, state.endAt, state.completed, config.sets, notificationStatus, prefs.notifications]);

  /** Changer la durée ou le nombre de séries remet tout à zéro (même en plein décompte). Rien ne change si la valeur est la même. */
  const update = useCallback((patch: Partial<TimerConfig>) => {
    const current = configRef.current;
    const next: TimerConfig = {
      seconds: clampSeconds(patch.seconds ?? current.seconds),
      sets: clampSets(patch.sets ?? current.sets),
    };
    if (next.seconds === current.seconds && next.sets === current.sets) return;
    setConfig(next);
    setState(initialState(next));
    void saveConfig(next);
  }, []);

  /** Appui sur le chrono : « GO » lance une série (ou une nouvelle partie si tout est fini) ; pendant le décompte, il la termine. */
  const press = useCallback(() => {
    const s = stateRef.current;
    const cfg = configRef.current;
    if (s.phase === 'running') {
      setState(skip(s, cfg));
      return;
    }
    prepareSound(); // les navigateurs n'autorisent le son qu'après un geste
    alertStart(prefsRef.current.sound);
    setState(start(s.phase === 'done' ? reset(cfg) : s, cfg, Date.now()));
    dismissDelivered();
    if (prefsRef.current.notifications) void requestNotificationPermission();
  }, []);

  /** Appui ou glissement sur le cercle : `elapsed` (0–1) = part écoulée de la série. */
  const seekTo = useCallback((elapsed: number) => setState((s) => seek(s, configRef.current, elapsed, Date.now())), []);

  const setPref = useCallback((key: keyof Prefs, value: boolean) => {
    const next = { ...prefsRef.current, [key]: value };
    setPrefs(next);
    void savePrefs(next);
    if (!value) return;
    if (key === 'sound') {
      prepareSound();
      alertStart(true); // aperçu
    }
    if (key === 'notifications') void requestNotificationPermission();
  }, []);

  return { config, state, prefs, ready, update, press, seekTo, setPref };
}
