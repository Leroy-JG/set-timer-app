import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { FONT, useTheme } from './theme';

/** Anneau de progression : l'arc se vide vers 00:00 (`fraction` = temps restant, 1 → 0). */
export function Ring({ size, fraction, children }: { size: number; fraction: number; children?: React.ReactNode }) {
  const theme = useTheme();
  const stroke = Math.max(10, Math.round(size * 0.05));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * Math.min(1, Math.max(0, fraction));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={theme.track} strokeWidth={stroke} fill="none" />
        {arc > 0.5 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={theme.bar}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${arc} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}

/**
 * Une série = un tiret. Gris tant qu'elle n'est pas faite, blanc une fois terminée ;
 * le tiret de la série en cours se remplit au fil du temps (`current` = part écoulée, 0 → 1).
 */
export function Dashes({ total, completed, current }: { total: number; completed: number; current: number }) {
  const theme = useTheme();
  return (
    <View
      style={styles.dashes}
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
}

function RoundButton({
  label,
  onPress,
  disabled,
  size = 44,
  filled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
  filled?: boolean;
  children: (color: string) => React.ReactNode;
}) {
  const theme = useTheme();
  const color = filled ? theme.onAction : theme.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: filled ? theme.action : 'transparent',
          borderWidth: filled ? 0 : 1,
          borderColor: theme.border,
          opacity: disabled ? 0.35 : pressed ? 0.75 : 1,
        },
      ]}
    >
      {children(color)}
    </Pressable>
  );
}

export function PlayPauseButton({ running, finished, onPress }: { running: boolean; finished: boolean; onPress: () => void }) {
  return (
    <RoundButton
      size={84}
      filled
      onPress={onPress}
      label={finished ? 'Recommencer' : running ? 'Pause' : 'Démarrer'}
    >
      {(color) => (
        <Svg width={34} height={34} viewBox="0 0 24 24">
          {finished ? (
            <ResetShape color={color} />
          ) : running ? (
            <>
              <Rect x={6} y={4} width={4} height={16} rx={1.5} fill={color} />
              <Rect x={14} y={4} width={4} height={16} rx={1.5} fill={color} />
            </>
          ) : (
            <Path d="M8 4.8v14.4a1 1 0 0 0 1.5.86l12-7.2a1 1 0 0 0 0-1.72l-12-7.2A1 1 0 0 0 8 4.8z" fill={color} />
          )}
        </Svg>
      )}
    </RoundButton>
  );
}

function ResetShape({ color }: { color: string }) {
  return (
    <Path
      d="M4 12a8 8 0 1 0 2.6-5.9M4 4v4.5h4.5"
      stroke={color}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  );
}

export function ResetButton({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  return (
    <RoundButton size={52} onPress={onPress} disabled={disabled} label="Réinitialiser">
      {(color) => (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <ResetShape color={color} />
        </Svg>
      )}
    </RoundButton>
  );
}

function StepButton({ sign, onPress, disabled, label }: { sign: '−' | '+'; onPress: () => void; disabled: boolean; label: string }) {
  return (
    <RoundButton size={44} onPress={onPress} disabled={disabled} label={label}>
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
  disabled,
  width = 56,
}: {
  value: number;
  onCommit: (n: number) => void;
  label: string;
  pad?: boolean;
  disabled: boolean;
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
      editable={!disabled}
      onChangeText={(v) => setText(v.replace(/\D/g, '').slice(0, 2))}
      onFocus={() => setFocused(true)}
      onBlur={commit}
      onSubmitEditing={commit}
      selectTextOnFocus
      keyboardType="number-pad"
      returnKeyType="done"
      maxLength={2}
      style={[styles.field, { width, color: theme.text, fontFamily: FONT.bold, fontVariant: ['lining-nums', 'tabular-nums'], opacity: disabled ? 0.55 : 1 }]}
    />
  );
}

export function SettingsCard({
  seconds,
  sets,
  editable,
  onChange,
}: {
  seconds: number;
  sets: number;
  editable: boolean;
  onChange: (patch: { seconds?: number; sets?: number }) => void;
}) {
  const theme = useTheme();
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const disabled = !editable;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted, fontFamily: FONT.semibold }]}>Durée</Text>
        <View style={styles.control}>
          <StepButton sign="−" label="Durée −5 secondes" disabled={disabled} onPress={() => onChange({ seconds: seconds - 5 })} />
          <NumberField value={minutes} label="Minutes" pad disabled={disabled} onCommit={(m) => onChange({ seconds: m * 60 + secs })} />
          <Text style={[styles.colon, { color: theme.muted, fontFamily: FONT.bold }]}>:</Text>
          <NumberField value={secs} label="Secondes" pad disabled={disabled} onCommit={(s) => onChange({ seconds: minutes * 60 + Math.min(s, 59) })} />
          <StepButton sign="+" label="Durée +5 secondes" disabled={disabled} onPress={() => onChange({ seconds: seconds + 5 })} />
        </View>
      </View>
      <View style={[styles.divider, { backgroundColor: theme.border }]} />
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.muted, fontFamily: FONT.semibold }]}>Séries</Text>
        <View style={styles.control}>
          <StepButton sign="−" label="Une série de moins" disabled={disabled} onPress={() => onChange({ sets: sets - 1 })} />
          <NumberField value={sets} label="Nombre de séries" disabled={disabled} width={88} onCommit={(n) => onChange({ sets: n })} />
          <StepButton sign="+" label="Une série de plus" disabled={disabled} onPress={() => onChange({ sets: sets + 1 })} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dashes: { flexDirection: 'row', gap: 6, alignSelf: 'stretch' },
  dash: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden', maxWidth: 64 },
  card: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 68 },
  divider: { height: 1 },
  label: { fontSize: 15, letterSpacing: 0.4 },
  control: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  field: { fontSize: 26, textAlign: 'center', paddingVertical: 4, paddingHorizontal: 0 },
  colon: { fontSize: 24, marginHorizontal: -2 },
});
