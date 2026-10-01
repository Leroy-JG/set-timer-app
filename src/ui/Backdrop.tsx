import { memo, useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { FAMILY, PIGMENTS } from '../brand';
import { useTheme } from './theme';

export type Tone = 'idle' | 'running' | 'done';

interface Halo {
  /** Position en fractions de l'écran (x, y) et rayon en fraction de la largeur. */
  x: number;
  y: number;
  r: number;
  color: string;
  /** Opacité au centre (thème sombre, thème clair). */
  a: [number, number];
}

// Halos fixes : des pigments de la famille, doux, pour donner de la profondeur sans gêner la lecture.
const BASE: Halo[] = [
  { x: 0.05, y: 0.04, r: 1.0, color: PIGMENTS.roseDamas, a: [0.34, 0.28] },
  { x: 0.98, y: 0.3, r: 0.85, color: PIGMENTS.ciel, a: [0.26, 0.24] },
  { x: 0.2, y: 0.98, r: 1.0, color: PIGMENTS.pourpre, a: [0.42, 0.2] },
  { x: 0.95, y: 0.97, r: 0.85, color: PIGMENTS.turquoise, a: [0.3, 0.24] },
];

// Halo derrière le cercle, qui change avec l'état : violet au repos, bleu pendant le décompte, vert à la fin (l'or est réservé aux actions).
const RING: Record<Tone, { color: string; a: [number, number]; r: number }> = {
  idle: { color: PIGMENTS.pourpre, a: [0.55, 0.3], r: 0.95 },
  running: { color: PIGMENTS.ciel, a: [0.4, 0.34], r: 1.0 },
  done: { color: FAMILY.success.dark, a: [0.42, 0.3], r: 1.0 },
};

function Layer({ width, height, halos, id }: { width: number; height: number; halos: { cx: number; cy: number; r: number; color: string; a: number }[]; id: string }) {
  return (
    <Svg width={width} height={height}>
      <Defs>
        {halos.map((h, i) => (
          <RadialGradient key={i} id={`${id}${i}`} cx={h.cx} cy={h.cy} r={h.r} gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor={h.color} stopOpacity={h.a} />
            <Stop offset="0.55" stopColor={h.color} stopOpacity={h.a * 0.35} />
            <Stop offset="1" stopColor={h.color} stopOpacity={0} />
          </RadialGradient>
        ))}
      </Defs>
      {halos.map((h, i) => (
        <Rect key={i} x={0} y={0} width={width} height={height} fill={`url(#${id}${i})`} />
      ))}
    </Svg>
  );
}

/** Fond : halos de couleur derrière l'écran (`focus` = centre du cercle, en pixels). */
export const Backdrop = memo(function Backdrop({ tone, focus }: { tone: Tone; focus?: { x: number; y: number } | null }) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const k = theme.dark ? 0 : 1;
  const span = Math.max(width, 360);
  const fx = focus?.x ?? width / 2;
  const fy = focus?.y ?? height * 0.46;

  const base = BASE.map((h, i) => ({ cx: h.x * width, cy: h.y * height, r: h.r * span, color: h.color, a: h.a[k] ?? 0, key: i }));

  // Fondu enchaîné entre les trois ambiances du halo central.
  const values = useRef({ idle: new Animated.Value(1), running: new Animated.Value(0), done: new Animated.Value(0) }).current;
  useEffect(() => {
    const anims = (Object.keys(values) as Tone[]).map((t) =>
      Animated.timing(values[t], { toValue: t === tone ? 1 : 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== 'web' }),
    );
    Animated.parallel(anims).start();
  }, [tone, values]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Layer width={width} height={height} halos={base} id="b" />
      {(Object.keys(RING) as Tone[]).map((t) => (
        <Animated.View key={t} style={[StyleSheet.absoluteFill, { opacity: values[t] }]}>
          <Layer
            width={width}
            height={height}
            id={`r${t}`}
            halos={[{ cx: fx, cy: fy, r: RING[t].r * span, color: RING[t].color, a: RING[t].a[k] ?? 0 }]}
          />
        </Animated.View>
      ))}
    </View>
  );
});
