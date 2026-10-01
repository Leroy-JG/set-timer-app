import { useCallback, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatTime, remainingFraction } from '../src/domain/timer';
import { openNotificationSettings, useNotificationStatus } from '../src/notifications';
import { Backdrop, type Tone } from '../src/ui/Backdrop';
import { Dashes, Ring, SettingsCard, ToggleButton } from '../src/ui/components';
import { FONT, useTheme } from '../src/ui/theme';
import { useTimer } from '../src/ui/useTimer';

export default function TimerScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { config, state, prefs, ready, update, press, seekTo, setPref } = useTimer();
  const notifications = useNotificationStatus();

  const onSound = useCallback((v: boolean) => setPref('sound', v), [setPref]);
  const onNotifications = useCallback((v: boolean) => setPref('notifications', v), [setPref]);
  const onAwake = useCallback((v: boolean) => setPref('awake', v), [setPref]);

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

  // Le cercle prend toute la largeur utile (sans dépasser la hauteur de l'écran, pour que tout reste visible).
  const ringSize = Math.round(Math.min(Math.max(width - 40, 200), 360, Math.max(height - 400, 220)));
  const total = config.seconds * 1000;
  const running = state.phase === 'running';
  const finished = state.phase === 'done';
  const tone: Tone = finished ? 'done' : running ? 'running' : 'idle';

  const n = state.completed + 1;
  const caption = finished ? 'Terminé' : `Série ${n} sur ${config.sets}`;

  if (!ready) return <View style={{ flex: 1, backgroundColor: theme.bg }} />;

  // Au centre : « GO » tant que le chrono ne tourne pas, puis le temps restant. Un seul appui lance, un autre termine la série.
  const center = running ? (
    <Text
      accessibilityRole="timer"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={{
        color: theme.text,
        fontFamily: FONT.extrabold,
        fontSize: ringSize * 0.2,
        fontVariant: ['lining-nums', 'tabular-nums'],
        letterSpacing: 0.5,
        ...(Platform.OS === 'web' ? ({ whiteSpace: 'nowrap' } as object) : null),
      }}
    >
      {formatTime(state.remainingMs)}
    </Text>
  ) : (
    <Text
      numberOfLines={1}
      style={{ color: theme.text, fontFamily: FONT.extrabold, fontSize: ringSize * 0.26, letterSpacing: 4, paddingLeft: 4 }}
    >
      GO
    </Text>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <Backdrop tone={tone} focus={focus} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: 'center',
          gap: 24,
          paddingHorizontal: 20,
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 28,
          maxWidth: 520,
          width: '100%',
          alignSelf: 'center',
        }}
        keyboardShouldPersistTaps="handled"
      >
        <SettingsCard seconds={config.seconds} sets={config.sets} onChange={update} />

        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
          <View ref={ringBox} onLayout={measure}>
            <Ring size={ringSize} running={running} endAt={state.endAt} totalMs={total} remainingMs={state.remainingMs} complete={finished} onSeek={seekTo}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={running ? 'Terminer la série' : 'Go, lancer le chrono'}
                onPress={press}
                style={({ pressed }) => ({
                  width: ringSize * 0.72,
                  height: ringSize * 0.72,
                  borderRadius: ringSize * 0.36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                {center}
                <Text style={{ color: theme.text, opacity: 0.85, fontFamily: FONT.semibold, fontSize: 15, marginTop: 4, textAlign: 'center' }}>
                  {caption}
                </Text>
              </Pressable>
            </Ring>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 26 }}>
            <ToggleButton label="Son dans l’app" caption="Son" icon="sound" on={prefs.sound} onToggle={onSound} />
            <ToggleButton label="Notifications : chrono en direct et fin de série" caption="Notifs" icon="bell" on={prefs.notifications} onToggle={onNotifications} />
            <ToggleButton label="Écran toujours allumé" caption="Écran" icon="sun" on={prefs.awake} onToggle={onAwake} />
          </View>

          {Platform.OS !== 'web' && prefs.notifications && notifications === 'denied' ? (
            <Pressable accessibilityRole="link" onPress={openNotificationSettings}>
              <Text style={{ color: theme.error, fontFamily: FONT.semibold, fontSize: 13, textAlign: 'center', maxWidth: 290, lineHeight: 18 }}>
                Notifications désactivées : le téléphone ne sonnera pas en arrière-plan. Touchez ici pour les activer.
              </Text>
            </Pressable>
          ) : null}
        </View>

        <Dashes total={config.sets} completed={state.completed} current={running ? 1 - remainingFraction(state, config) : 0} />
      </ScrollView>
    </View>
  );
}
