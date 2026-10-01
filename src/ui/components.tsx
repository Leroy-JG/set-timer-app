import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { PanResponder, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { angleFraction, unwrapFraction } from '../domain/timer';
import { FONT, useTheme } from './theme';
import { Water } from './Water';

/** Part de temps restante (1 → 0). Pendant le décompte, ce composant se redessine seul (assez souvent pour un mouvement fluide). */
function useFraction(running: boolean, endAt: number | null, totalMs: number, remainingMs: number): number {
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    if (!running) return;
    const every = Math.min(250, Math.max(33, Math.round(totalMs / 720))); // environ un demi-degré par image
    const id = setInterval(redraw, every);
    return () => clearInterval(id);
  }, [running, totalMs]);
  const left = running && endAt !== null ? endAt - Date.now() : remainingMs;
  return Math.min(1, Math.max(0, left / totalMs));
}

/**
 * Anneau de progression : la partie colorée est le temps qui reste ; elle se vide dans le sens des aiguilles d'une montre
 * vers 00:00 (le point de départ de l'arc avance autour du cercle).
 * Quand `interactive`, on peut appuyer ou glisser sur l'anneau pour déplacer l'horloge : le point touché devient le point de départ
 * de l'arc (un quart du cercle = un quart du temps écoulé). Le centre (`children`) reçoit ses propres appuis.
 */
export function Ring({
  size,
  running,
  endAt,
  totalMs,
  remainingMs,
  complete,
  onSeek,
  children,
}: {
  size: number;
  /** Décompte en cours : le cercle et l'eau suivent l'heure réelle (`endAt`) ; sinon ils restent sur `remainingMs`. */
  running: boolean;
  endAt: number | null;
  totalMs: number;
  remainingMs: number;
  /** Toutes les séries sont faites : anneau plein, en vert. */
  complete?: boolean;
  onSeek?: (elapsed: number) => void;
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const interactive = running;
  const fraction = useFraction(running, endAt, totalMs, remainingMs);
  const stroke = Math.max(12, Math.round(size * 0.055));
  const pad = Math.round(stroke * 1.2); // marge pour la lueur de l'arc et le curseur, qui dépassent du cercle
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const f = complete ? 1 : Math.min(1, Math.max(0, fraction));
  const arc = c * f;
  const color = complete ? theme.success : theme.bar;
  const startDeg = complete ? 0 : (1 - f) * 360; // angle du point de départ de l'arc, depuis le haut
  const rad = (startDeg * Math.PI) / 180;
  const knob = { x: size / 2 + r * Math.sin(rad), y: size / 2 - r * Math.cos(rad) };

  // Geste : appui ou glissement. Les valeurs « vivantes » passent par des refs (le PanResponder n'est créé qu'une fois).
  const box = useRef<View>(null);
  const live = useRef({ interactive: !!interactive, onSeek, size });
  live.current = { interactive: !!interactive, onSeek, size };
  const center = useRef<{ x: number; y: number } | null>(null);
  const active = useRef(false);
  const moved = useRef(false);
  const start = useRef({ x: 0, y: 0 });
  const last = useRef(0);

  const refreshCenter = useCallback((then?: (old: { x: number; y: number } | null, fresh: { x: number; y: number }) => void) => {
    box.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      const fresh = { x: x + w / 2, y: y + h / 2 };
      const old = center.current;
      center.current = fresh;
      then?.(old, fresh);
    });
  }, []);

  const apply = useCallback((pageX: number, pageY: number, first: boolean) => {
    const origin = center.current;
    if (!origin || !active.current) return;
    const dx = pageX - origin.x;
    const dy = pageY - origin.y;
    if (first && Math.hypot(dx, dy) > live.current.size * 0.62) {
      active.current = false; // touche hors du cercle
      return;
    }
    const raw = angleFraction(dx, dy);
    const next = first ? raw : unwrapFraction(last.current, raw);
    last.current = next;
    live.current.onSeek?.(next);
  }, []);

  // La position du cercle est mesurée à l'avance : un appui très bref (le doigt repart avant la fin d'une mesure) compte quand même.
  useEffect(() => {
    if (interactive) refreshCenter();
  }, [interactive, size, refreshCenter]);

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => live.current.interactive,
        onMoveShouldSetPanResponder: () => false,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => {
          const { pageX, pageY } = e.nativeEvent;
          start.current = { x: pageX, y: pageY };
          active.current = true;
          moved.current = false;
          if (center.current) apply(pageX, pageY, true);
          // Vérifie la position (l'écran a pu bouger depuis la dernière mesure) ; si elle a changé, on recalcule le point touché.
          refreshCenter((old, fresh) => {
            if (old && Math.hypot(old.x - fresh.x, old.y - fresh.y) < 2) return;
            if (moved.current) return;
            active.current = true;
            apply(start.current.x, start.current.y, true);
          });
        },
        onPanResponderMove: (_e, g) => {
          moved.current = true;
          apply(g.moveX, g.moveY, false);
        },
        onPanResponderRelease: () => {
          active.current = false;
        },
        onPanResponderTerminate: () => {
          active.current = false;
        },
      }),
    [apply, refreshCenter],
  );

  return (
    <View
      ref={box}
      onLayout={() => refreshCenter()}
      {...pan.panHandlers}
      accessibilityHint={interactive ? 'Touchez le cercle pour avancer ou reculer le chrono' : undefined}
      style={[
        { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
        Platform.OS === 'web' ? ({ touchAction: 'none', userSelect: 'none', cursor: interactive ? 'pointer' : 'default' } as object) : null,
      ]}
    >
      <View pointerEvents="none" style={{ position: 'absolute', alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
        <Water d={Math.round(size - 2 * stroke - 8)} running={running} endAt={endAt} totalMs={totalMs} fraction={complete ? 0 : fraction} />
      </View>
      <View pointerEvents="none" style={{ position: 'absolute', left: -pad, top: -pad, width: size + 2 * pad, height: size + 2 * pad }}>
        <Svg width={size + 2 * pad} height={size + 2 * pad} viewBox={`${-pad} ${-pad} ${size + 2 * pad} ${size + 2 * pad}`}>
          <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.track} strokeWidth={stroke} fill="none" />
          {arc > 0.5 && (
            <>
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={color}
                strokeOpacity={0.18}
                strokeWidth={stroke * 1.9}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${arc} ${c}`}
                transform={`rotate(${-90 + startDeg} ${size / 2} ${size / 2})`}
              />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={color}
                strokeWidth={stroke}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${arc} ${c}`}
                transform={`rotate(${-90 + startDeg} ${size / 2} ${size / 2})`}
              />
            </>
          )}
          {interactive && !complete && (
            <>
              <Circle cx={knob.x} cy={knob.y} r={stroke * 0.95} fill={theme.bg} fillOpacity={0.85} />
              <Circle cx={knob.x} cy={knob.y} r={stroke * 0.62} fill={theme.done} />
            </>
          )}
        </Svg>
      </View>
      {children}
    </View>
  );
}

/**
 * Une série = un tiret. Gris tant qu'elle n'est pas faite, blanc une fois terminée ;
 * le tiret de la série en cours se remplit au fil du temps (`current` = part écoulée, 0 → 1).
 * Les tirets se partagent toute la largeur disponible, quel que soit leur nombre.
 */
export const Dashes = memo(function Dashes({ total, completed, current }: { total: number; completed: number; current: number }) {
  const theme = useTheme();
  const gap = total > 40 ? 1 : total > 20 ? 3 : 6;
  return (
    <View
      style={[styles.dashes, { gap }]}
      role="progressbar"
      aria-label={`Série ${Math.min(completed + 1, total)} sur ${total}`}
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={completed}
    >
      {Array.from({ length: total }, (_, i) => {
        const fill = i < completed ? 1 : i === completed ? current : 0;
        return (
          <View key={i} style={[styles.dash, { backgroundColor: theme.track }]}>
            <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: theme.done }} />
          </View>
        );
      })}
    </View>
  );
});

function RoundButton({ label, onPress, children }: { label: string; onPress: () => void; children: (color: string) => React.ReactNode }) {
  const theme = useTheme();
  const color = theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: theme.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
    >
      {children(color)}
    </Pressable>
  );
}

/** Petit bouton à bascule (son, notifications, écran allumé) : plein quand il est activé, barré quand il est coupé. */
export const ToggleButton = memo(function ToggleButton({
  label,
  caption,
  on,
  onToggle,
  icon,
}: {
  label: string;
  caption: string;
  on: boolean;
  onToggle: (next: boolean) => void;
  icon: 'sound' | 'bell' | 'sun';
}) {
  const theme = useTheme();
  const color = on ? theme.onAction : theme.muted;
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={label}
      aria-checked={on}
      onPress={() => onToggle(!on)}
      style={({ pressed }) => [{ alignItems: 'center', gap: 5, opacity: pressed ? 0.7 : 1 }]}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: on ? theme.action : theme.card,
          borderWidth: on ? 0 : 1,
          borderColor: theme.border,
        }}
      >
        <Svg width={24} height={24} viewBox="0 0 24 24">
          {icon === 'sound' && (
            <>
              <Path d="M4 9.5v5h3.5l4.5 4V5.5l-4.5 4H4z" fill={color} />
              <Path d="M15.5 9.2a4 4 0 0 1 0 5.6M18.2 6.6a7.8 7.8 0 0 1 0 10.8" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
            </>
          )}
          {icon === 'bell' && (
            <>
              <Path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 1.6H4.4L6 16.5z" fill={color} />
              <Path d="M10 20.4a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.9} strokeLinecap="round" fill="none" />
            </>
          )}
          {icon === 'sun' && (
            <>
              <Circle cx={12} cy={12} r={4} fill={color} />
              <Path
                d="M12 3v2.4M12 18.6V21M3 12h2.4M18.6 12H21M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M5.6 18.4l1.7-1.7M16.7 7.3l1.7-1.7"
                stroke={color}
                strokeWidth={1.9}
                strokeLinecap="round"
              />
            </>
          )}
          {!on && (
            <>
              <Line x1={4.5} y1={4.5} x2={19.5} y2={19.5} stroke={theme.card} strokeWidth={5} strokeLinecap="round" />
              <Line x1={4.5} y1={4.5} x2={19.5} y2={19.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
            </>
          )}
        </Svg>
      </View>
      <Text style={{ color: theme.muted, fontFamily: FONT.semibold, fontSize: 11, letterSpacing: 0.3 }}>{caption}</Text>
    </Pressable>
  );
});

function StepButton({ sign, onPress, label }: { sign: '−' | '+'; onPress: () => void; label: string }) {
  return (
    <RoundButton onPress={onPress} label={label}>
      {(color) => (
        <Svg width={18} height={18} viewBox="0 0 24 24">
          <Path d={sign === '+' ? 'M12 4v16M4 12h16' : 'M4 12h16'} stroke={color} strokeWidth={2.4} strokeLinecap="round" fill="none" />
        </Svg>
      )}
    </RoundButton>
  );
}

/** Champ numérique : on tape, la valeur est validée (bornée) quand on quitte le champ. */
function NumberField({
  value,
  onCommit,
  label,
  pad,
  width = 56,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  pad?: boolean;
  width?: number;
}) {
  const theme = useTheme();
  const shown = pad ? String(value).padStart(2, '0') : String(value);
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(shown);
  }, [shown, focused]);

  const commit = () => {
    setFocused(false);
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) onCommit(n);
    else setText(shown);
  };

  return (
    <TextInput
      accessibilityLabel={label}
      value={text}
      onChangeText={(v) => setText(v.replace(/\D/g, '').slice(0, 2))}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onSubmitEditing={commit}
      selectTextOnFocus
      keyboardType="number-pad"
      returnKeyType="done"
      maxLength={2}
      style={[styles.field, { width, color: theme.text, fontFamily: FONT.bold, fontVariant: ['lining-nums', 'tabular-nums'] }]}
    />
  );
}

/** Durée et nombre de séries : modifiables à tout moment (changer l'un ou l'autre remet le chrono à zéro). */
export const SettingsCard = memo(function SettingsCard({
  seconds,
  sets,
  onChange,
}: {
  seconds: number;
  sets: number;
  onChange: (patch: { seconds?: number; sets?: number }) => void;
}) {
  const theme = useTheme();
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted, fontFamily: FONT.semibold }]}>Durée</Text>
        <View style={styles.control}>
          <StepButton sign="−" label="Durée −5 secondes" onPress={() => onChange({ seconds: seconds - 5 })} />
          <NumberField value={minutes} label="Minutes" pad onCommit={(m) => onChange({ seconds: m * 60 + secs })} />
          <Text style={[styles.colon, { color: theme.muted, fontFamily: FONT.bold }]}>:</Text>
          <NumberField value={secs} label="Secondes" pad onCommit={(s) => onChange({ seconds: minutes * 60 + Math.min(s, 59) })} />
          <StepButton sign="+" label="Durée +5 secondes" onPress={() => onChange({ seconds: seconds + 5 })} />
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted, fontFamily: FONT.semibold }]}>Séries</Text>
        <View style={styles.control}>
          <StepButton sign="−" label="Une série de moins" onPress={() => onChange({ sets: sets - 1 })} />
          <NumberField value={sets} label="Nombre de séries" width={88} onCommit={(n) => onChange({ sets: n })} />
          <StepButton sign="+" label="Une série de plus" onPress={() => onChange({ sets: sets + 1 })} />
        </View>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  dashes: { flexDirection: 'row', alignSelf: 'stretch' },
  dash: { flex: 1, flexBasis: 0, minWidth: 0, height: 8, borderRadius: 4, overflow: 'hidden' },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 68 },
  divider: { height: 1 },
  label: { fontSize: 15, letterSpacing: 0.4 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  field: { fontSize: 26, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 0 },
  colon: { fontSize: 24, marginHorizontal: -2 },
});
