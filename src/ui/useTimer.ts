import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import {
  canEdit,
  clampSeconds,
  clampSets,
  DEFAULT_CONFIG,
  initialState,
  pause,
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
  notificationCoversAlert,
  requestNotificationPermission,
  scheduleSetEnd,
  setupNotifications,
  showSetDoneNotification,
  useNotificationStatus,
} from '../notifications';
import { loadConfig, loadTimer, saveConfig, saveTimer } from '../storage';
import { alertSetDone, primeAudio } from './alert';

const KEEP_AWAKE_TAG = 'set-timer';
/** Délai avant de programmer la notification : un glissement sur le cercle change l'heure de fin à chaque mouvement. */
const SCHEDULE_DEBOUNCE_MS = 200;

export function useTimer() {
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<TimerState>(() => initialState(DEFAULT_CONFIG));
  const [ready, setReady] = useState(false);
  const configRef = useRef(config);
  configRef.current = config;
  const prevRef = useRef(state);
  const notificationStatus = useNotificationStatus();

  // Au lancement : réglages et chrono enregistrés. Si le système avait fermé l'app pendant un décompte, il reprend là où il en est
  // (l'heure de fin est enregistrée) ; si elle est passée entre-temps, la série est comptée.
  useEffect(() => {
    let alive = true;
    void (async () => {
      await setupNotifications();
      const cfg = await loadConfig();
      const restored = tick(sanitizeState(await loadTimer(), cfg), cfg, Date.now());
      if (!alive) return;
      prevRef.current = restored; // pas de signal pour ce qui s'est passé pendant que l'app était fermée
      setConfig(cfg);
      setState(restored);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Horloge : on recalcule depuis l'heure réelle (exact même si l'app passe un moment en arrière-plan).
  const running = state.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setState((s) => tick(s, configRef.current, Date.now())), 100);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setState((s) => tick(s, configRef.current, Date.now()));
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [running]);

  // L'écran reste allumé pendant le décompte.
  useEffect(() => {
    if (!running) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running]);

  // Enregistrement du chrono à chaque changement d'état important (pas à chaque top d'horloge).
  const persistKey = `${state.phase}|${state.completed}|${state.endAt ?? ''}|${state.phase === 'running' ? '' : state.remainingMs}`;
  useEffect(() => {
    if (ready) void saveTimer(state);
  }, [ready, persistKey]);

  // Fin de série : signal dans l'app si elle est au premier plan ; annulation de la notification si la série s'arrête autrement
  // (pause, appui sur le chrono, réinitialisation). À 00:00 naturel, on ne l'annule surtout pas : elle est en train de sonner.
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = state;
    if (!ready || state.phase === 'running') return;
    const natural =
      prev.phase === 'running' && state.completed > prev.completed && prev.endAt !== null && Date.now() >= prev.endAt - 250;
    if (natural) {
      alertSetDone(state.phase === 'done', notificationCoversAlert());
      showSetDoneNotification(state.completed, configRef.current.sets);
    } else {
      cancelSetEnd();
    }
  }, [ready, state]);

  // Notification système à l'heure de fin (déplacée si on bouge l'horloge).
  useEffect(() => {
    if (!ready || state.phase !== 'running' || state.endAt === null) return;
    const endAt = state.endAt;
    const setNumber = state.completed + 1;
    const sets = config.sets;
    cancelSetEnd(); // l'ancienne heure n'est plus bonne
    const id = setTimeout(() => scheduleSetEnd(endAt, setNumber, sets), SCHEDULE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [ready, state.phase, state.endAt, state.completed, config.sets, notificationStatus]);

  const editable = canEdit(state);

  const update = useCallback(
    (patch: Partial<TimerConfig>) => {
      if (!canEdit(state)) return;
      const next: TimerConfig = {
        seconds: clampSeconds(patch.seconds ?? config.seconds),
        sets: clampSets(patch.sets ?? config.sets),
      };
      setConfig(next);
      setState(initialState(next));
      void saveConfig(next);
    },
    [state, config],
  );

  const toggle = useCallback(() => {
    primeAudio();
    setState((s) => {
      const now = Date.now();
      if (s.phase === 'done') return reset(configRef.current);
      return s.phase === 'running' ? pause(s, configRef.current, now) : start(s, configRef.current, now);
    });
    dismissDelivered();
    void requestNotificationPermission();
  }, []);

  /** Appui sur le chrono : la série en cours est terminée et comptée ; le chrono attend le prochain « Go ». */
  const finishSet = useCallback(() => setState((s) => skip(s, configRef.current)), []);

  /** Appui ou glissement sur le cercle : `elapsed` (0–1) = part écoulée de la série. */
  const seekTo = useCallback((elapsed: number) => setState((s) => seek(s, configRef.current, elapsed, Date.now())), []);

  const restart = useCallback(() => {
    setState(reset(configRef.current));
    dismissDelivered();
  }, []);

  return { config, state, ready, editable, update, toggle, finishSet, seekTo, restart };
}
