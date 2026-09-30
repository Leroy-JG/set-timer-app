import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTime, isWaitingNext, remainingFraction } from '../src/domain/timer';
import { openNotificationSettings, useNotificationStatus } from '../src/notifications';
import { Backdrop, type Tone } from '../src/ui/Backdrop';
import { Dashes, PlayPauseButton, ResetButton, Ring, SettingsCard } from '../src/ui/components';
import { FONT, useTheme } from '../src/ui/theme';
import { useTimer } from '../src/ui/useTimer';

export default function TimerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { config, state, ready, editable, update, toggle, finishSet, seekTo, restart } = useTimer();
  const notifications = useNotificationStatus();

  // Centre du cercle à l'écran : le halo de fond s'y place.
  const ringBox = useRef<View>(null);
  const [focus, setFocus] = useState<{ x: number; y: number } | null>(null);
  const measure = useCallback(() => {
    ringBox.current?.measureInWindow((x, y, w, h) => {
      if (w <= 0 || h <= 0) return;
      const next = { x: x + w / 2, y: y + h / 2 };
      setFocus((old) => (old && Math.abs(old.x - next.x) < 1 && Math.abs(old.y - next.y) < 1 ? old : next));
    });
  }, []);

  const ringSize = Math.min(Math.max(width - 64, 200), 320);
  const fraction = remainingFraction(state, config);
  const running = state.phase === 'running';
  const paused = state.phase === 'paused';
  const finished = state.phase === 'done';
  const live = running || paused; // décompte en cours ou en pause : le cercle et le chrono répondent aux appuis
  const waiting = isWaitingNext(state);
  const tone: Tone = finished ? 'done' : running ? 'running' : 'idle';

  const n = state.completed + 1;
  const caption = finished
    ? 'Terminé'
    : paused
      ? `En pause · série ${n} sur ${config.sets}`
      : waiting
        ? `Prêt · série ${n} sur ${config.sets}`
        : `Série ${n} sur ${config.sets}`;

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  const time = (
    <>
      <Text
        accessibilityRole="timer"
        style={{
          color: finished ? theme.success : theme.text,
          fontFamily: FONT.extrabold,
          fontSize: ringSize * 0.22,
          fontVariant: ['lining-nums', 'tabular-nums'],
          letterSpacing: 1,
        }}
      >
        {formatTime(state.remainingMs)}
      </Text>
      <Text style={{ color: theme.muted, fontFamily: FONT.semibold, fontSize: 15, marginTop: 4, textAlign: 'center' }}>{caption}</Text>
    </>
  );
  const centerStyle = { width: ringSize * 0.66, height: ringSize * 0.5, borderRadius: ringSize * 0.25, alignItems: 'center', justifyContent: 'center' } as const;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Backdrop tone={tone} focus={focus} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          gap: 28,
          paddingHorizontal: 20,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 28,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <SettingsCard seconds={config.seconds} sets={config.sets} editable={editable} onChange={update} />

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <View ref={ringBox} onLayout={measure}>
            <Ring size={ringSize} fraction={fraction} complete={finished} interactive={live} onSeek={seekTo}>
              {live ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Terminer la série"
                  accessibilityHint="Compte la série comme faite et attend le prochain départ"
                  onPress={finishSet}
                  style={({ pressed }) => [centerStyle, { opacity: pressed ? 0.55 : 1 }]}
                >
                  {time}
                </Pressable>
              ) : (
                <View style={centerStyle}>{time}</View>
              )}
            </Ring>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
            <ResetButton onPress={restart} disabled={state.phase === 'idle' && state.completed === 0} />
            <PlayPauseButton running={running} finished={finished} onPress={toggle} />
            <View style={{ width: 52 }} />
          </View>

          {live ? (
            <Text style={{ color: theme.muted, fontFamily: FONT.medium, fontSize: 12.5, textAlign: 'center', lineHeight: 18, maxWidth: 280 }}>
              Touchez le cercle pour avancer ou reculer{'\n'}Touchez le chrono pour terminer la série
            </Text>
          ) : Platform.OS !== 'web' && notifications === 'denied' ? (
            <Pressable accessibilityRole="link" onPress={openNotificationSettings}>
              <Text style={{ color: theme.error, fontFamily: FONT.semibold, fontSize: 13, textAlign: 'center', maxWidth: 290, lineHeight: 18 }}>
                Notifications désactivées : le téléphone ne sonnera pas en arrière-plan. Touchez ici pour les activer.
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Dashes total={config.sets} completed={state.completed} current={live ? 1 - fraction : 0} />
      </ScrollView>
    </View>
  );
}
