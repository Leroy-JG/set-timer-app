import {
  Raleway_600SemiBold,
  Raleway_700Bold,
  Raleway_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/raleway';
import { Stack, type ErrorBoundaryProps } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Pressable, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from '../src/ui/theme';

/**
 * Filet de sécurité : si un écran plante, on affiche ceci (au lieu d'une app qui se ferme) ; le chrono en cours est enregistré
 * à chaque changement, donc « Réessayer » le retrouve à sa vraie valeur.
 */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32, backgroundColor: '#29143D' }}>
      <Text style={{ color: '#F4EBD9', fontSize: 20, fontWeight: '700', textAlign: 'center' }}>Oups, un incident est survenu</Text>
      <Text style={{ color: '#B4AC9A', fontSize: 15, textAlign: 'center' }}>Votre chrono en cours n’est pas perdu.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={{ backgroundColor: '#C9A227', paddingHorizontal: 28, paddingVertical: 14, borderRadius: 999 }}>
        <Text style={{ color: '#1C1A17', fontSize: 16, fontWeight: '700' }}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

function Themed() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      <StatusBar style={theme.dark ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: theme.bg } }} />
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Raleway_600SemiBold,
    Raleway_700Bold,
    Raleway_800ExtraBold,
  });
  // Si la police ne se charge pas, on affiche quand même l'app avec la police système.
  if (!loaded && !error) return null;
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Themed />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
