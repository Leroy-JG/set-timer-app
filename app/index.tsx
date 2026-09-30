import { ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTime, remainingFraction } from '../src/domain/timer';
import { Dashes, PlayPauseButton, Ring, ResetButton, SettingsCard } from '../src/ui/components';
import { FONT, useTheme } from '../src/ui/theme';
import { useTimer } from '../src/ui/useTimer';

export default function TimerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { config, state, ready, editable, update, toggle, restart } = useTimer();

  const ringSize = Math.min(Math.max(width - 64, 200), 320);
  const fraction = remainingFraction(state, config);
  const running = state.phase === 'running';
  const finished = state.phase === 'done';
  const inProgress = state.completed < config.sets;
  const caption = finished
    ? 'Terminé'
    : running
      ? `Série ${state.completed + 1} sur ${config.sets}`
      : state.phase === 'paused'
        ? 'En pause'
        : `Série ${state.completed + 1} sur ${config.sets}`;

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.bg }}
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

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 24 }}>
        <Ring size={ringSize} fraction={fraction}>
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
          <Text style={{ color: theme.muted, fontFamily: FONT.semibold, fontSize: 15, marginTop: 4 }}>{caption}</Text>
        </Ring>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20 }}>
          <ResetButton onPress={restart} disabled={state.phase === 'idle' && state.completed === 0} />
          <PlayPauseButton running={running} finished={finished} onPress={toggle} />
          <View style={{ width: 52 }} />
        </View>
      </View>

      <Dashes total={config.sets} completed={state.completed} current={inProgress ? 1 - fraction : 0} />
    </ScrollView>
  );
}
