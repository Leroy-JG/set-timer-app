import { memo, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from './theme';

const NATIVE = Platform.OS !== 'web';

/** Vague : `count` périodes de largeur `period`, creux/crête de `2 × amp`, fermée vers le bas jusqu'à `height`. */
function wavePath(period: number, amp: number, count: number, height: number) {
  let d = `M0 ${amp} Q ${period / 4} ${-amp} ${period / 2} ${amp}`;
  for (let i = 1; i < count * 2; i++) d += ` T ${(period / 2) * (i + 1)} ${amp}`;
  return { open: d, closed: `${d} V ${height} H 0 Z` };
}

const BUBBLES = [
  { x: 0.24, size: 0.026, ms: 5200, delay: 0 },
  { x: 0.42, size: 0.018, ms: 7300, delay: 1800 },
  { x: 0.63, size: 0.03, ms: 6100, delay: 900 },
  { x: 0.78, size: 0.02, ms: 8600, delay: 3200 },
];

function Bubble({ d, spec, running, color }: { d: number; spec: (typeof BUBBLES)[number]; running: boolean; color: string }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!running) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(spec.delay),
        Animated.timing(t, { toValue: 1, duration: spec.ms, easing: Easing.linear, useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [running, t, spec]);
  const size = Math.max(4, d * spec.size);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: d * spec.x,
        top: 0,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity: t.interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 0.7, 0.7, 0] }),
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [d * 0.92, d * 0.06] }) }],
      }}
    />
  );
}

/**
 * Eau dans le cadran : un disque rempli d'eau dont le niveau baisse avec le temps restant (pas réaliste, mais on comprend).
 * Deux vagues se déplacent en sens inverse, une ligne claire marque la surface, quelques bulles montent.
 * Tout est animé par le système (pilote natif) : le niveau descend d'un seul geste jusqu'à l'heure de fin, sans redessiner l'écran.
 */
export const Water = memo(function Water({
  d,
  running,
  endAt,
  totalMs,
  fraction,
}: {
  /** Diamètre du disque. */
  d: number;
  running: boolean;
  /** Heure de fin du décompte (ms) quand il tourne. */
  endAt: number | null;
  totalMs: number;
  /** Niveau fixe (0–1) quand le décompte ne tourne pas. */
  fraction: number;
}) {
  const theme = useTheme();
  const amp = Math.max(4, d * 0.022);
  const period = d / 2;
  const lift = amp * 0.9; // la vague de derrière dépasse un peu
  const waveH = 2 * amp + lift + 8;
  const empty = d + 2 * amp + lift + 6; // niveau « vide » : les vagues sont entièrement sous le disque
  const front = useRef(wavePath(period, amp, 4, waveH)).current;
  const back = useRef(wavePath(period, amp * 1.15, 4, waveH)).current;

  const level = useRef(new Animated.Value(empty)).current;
  const driftFront = useRef(new Animated.Value(0)).current;
  const driftBack = useRef(new Animated.Value(-period)).current;

  // Au retour au premier plan, le niveau est recalé sur l'heure réelle.
  const [sync, setSync] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') setSync((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  const fixed = running ? -1 : fraction;
  useEffect(() => {
    level.stopAnimation();
    if (running && endAt !== null) {
      const left = Math.max(0, endAt - Date.now());
      level.setValue(empty * (1 - Math.min(1, left / totalMs)));
      const anim = Animated.timing(level, { toValue: empty, duration: left, easing: Easing.linear, useNativeDriver: NATIVE });
      anim.start();
      return () => anim.stop();
    }
    level.setValue(empty * (1 - Math.min(1, Math.max(0, fixed))));
  }, [level, running, endAt, totalMs, empty, fixed, sync]);

  useEffect(() => {
    if (!running) return;
    const a = Animated.loop(Animated.timing(driftFront, { toValue: -period, duration: 3800, easing: Easing.linear, useNativeDriver: NATIVE }));
    const b = Animated.loop(Animated.timing(driftBack, { toValue: 0, duration: 5600, easing: Easing.linear, useNativeDriver: NATIVE }));
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [running, driftFront, driftBack, period]);

  const crest = theme.dark ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)';
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: d,
        height: d,
        borderRadius: d / 2,
        overflow: 'hidden',
        backgroundColor: theme.dark ? 'rgba(255,255,255,0.045)' : 'rgba(40,20,60,0.05)',
      }}
    >
      <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: d, height: d, transform: [{ translateY: level }] }}>
        <Animated.View style={{ position: 'absolute', left: -period, top: -(2 * amp + lift), transform: [{ translateX: driftBack }] }}>
          <Svg width={period * 4} height={waveH}>
            <Path d={back.closed} fill={theme.waterBack} />
          </Svg>
        </Animated.View>
        <Animated.View style={{ position: 'absolute', left: -period, top: -2 * amp, transform: [{ translateX: driftFront }] }}>
          <Svg width={period * 4} height={waveH}>
            <Path d={front.closed} fill={theme.water} />
            <Path d={front.open} fill="none" stroke={crest} strokeWidth={Math.max(1.5, d * 0.006)} strokeLinecap="round" />
          </Svg>
        </Animated.View>
        <View style={{ position: 'absolute', left: 0, top: 0, width: d, height: empty, backgroundColor: theme.water }} />
        {BUBBLES.map((spec) => (
          <Bubble key={spec.x} d={d} spec={spec} running={running} color={crest} />
        ))}
      </Animated.View>
    </View>
  );
});
