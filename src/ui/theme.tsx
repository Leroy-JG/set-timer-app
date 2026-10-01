import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';
import { FAMILY, PALETTE, type Palette } from '../brand';

export interface Theme {
  dark: boolean;
  bg: string;
  card: string;
  text: string;
  /** Texte secondaire (contraste ≥ 4,5:1 sur le fond). */
  muted: string;
  border: string;
  track: string;
  /** Bouton principal et éléments actifs. */
  action: string;
  onAction: string;
  /** Anneau de progression. */
  bar: string;
  /** Eau du cadran : vague de devant et vague de derrière (le texte reste lisible dessus). */
  water: string;
  waterBack: string;
  /** Tiret de série terminée (blanc en sombre). */
  done: string;
  success: string;
  error: string;
  accent: string;
}

export function themeFor(p: Palette, dark: boolean): Theme {
  if (dark) {
    return {
      dark,
      bg: p.night,
      card: p.card,
      text: FAMILY.cream,
      muted: FAMILY.muted.dark,
      border: p.border,
      track: p.track,
      action: FAMILY.accent, // le fond de marque est trop sombre sur la nuit : l'or porte l'action
      onAction: FAMILY.warmBlack,
      bar: p.secondary,
      water: '#2B5F99',
      waterBack: '#3A78B5',
      done: '#FFFFFF',
      success: FAMILY.success.dark,
      error: FAMILY.error.dark,
      accent: FAMILY.accentWarm,
    };
  }
  return {
    dark,
    bg: FAMILY.cream,
    card: FAMILY.light.card,
    text: FAMILY.warmBlack,
    muted: FAMILY.muted.light,
    border: FAMILY.light.border,
    track: FAMILY.light.track,
    action: p.ground,
    onAction: '#FFFFFF',
    bar: p.ground,
    water: '#8DB2DD',
    waterBack: '#A9C8EA',
    done: p.ground,
    success: FAMILY.success.light,
    error: FAMILY.error.light,
    accent: FAMILY.accent,
  };
}

const ThemeContext = createContext<Theme>(themeFor(PALETTE, false));

/** Thème clair / sombre : suit le téléphone. */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const theme = useMemo(() => themeFor(PALETTE, scheme === 'dark'), [scheme]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export const FONT = {
  semibold: 'Raleway_600SemiBold',
  bold: 'Raleway_700Bold',
  extrabold: 'Raleway_800ExtraBold',
} as const;
