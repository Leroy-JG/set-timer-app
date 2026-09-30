import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  canEdit,
  clampSeconds,
  clampSets,
  DEFAULT_CONFIG,
  initialState,
  pause,
  reset,
  start,
  tick,
  type TimerConfig,
  type TimerState,
} from '../domain/timer';
import { loadConfig, saveConfig } from '../storage';
import { notifySetDone, primeAudio } from './alert';

const KEEP_AWAKE_TAG = 'set-timer';

export function useTimer() {
  const [config, setConfig] = useState<TimerConfig>(DEFAULT_CONFIG);
  const [state, setState] = useState<TimerState>(() => initialState(DEFAULT_CONFIG));
  const [ready, setReady] = useState(false);
  const configRef = useRef(config);
  configRef.current = config;

  // Réglages enregistrés lors de la dernière utilisation.
  useEffect(() => {
    let alive = true;
    void loadConfig().then((saved) => {
      if (!alive) return;
      setConfig(saved);
      setState(initialState(saved));
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  // Horloge : on recalcule depuis l'heure réelle (exact même si l'app passe un moment en arrière-plan).
  const running = state.phase === 'running';
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setState((s) => tick(s, configRef.current, Date.now())), 100);
    return () => clearInterval(id);
  }, [running]);

  // L'écran reste allumé pendant le décompte.
  useEffect(() => {
    if (!running) return;
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    return () => {
      void deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [running]);

  // Signal (vibration / bip) à chaque série terminée.
  const lastCompleted = useRef(0);
  useEffect(() => {
    if (state.completed > lastCompleted.current) notifySetDone(state.phase === 'done');
    lastCompleted.current = state.completed;
  }, [state.completed, state.phase]);

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
      if (s.phase === 'done') return reset(configRef.current);
      return s.phase === 'running' ? pause(s, Date.now()) : start(s, Date.now());
    });
  }, []);

  const restart = useCallback(() => setState(reset(configRef.current)), []);

  return { config, state, ready, editable, update, toggle, restart };
}
