/**
 * Relay's design system: docs/decisions/0009-one-design-system-two-densities.md.
 * These tokens are the source of truth, duplicated here because this repo
 * cannot import them from the other two clients (`backend-laravel`'s
 * `resources/css/app.css` carries the same nine values). Dark mode is
 * deferred by that decision, so there is one palette, not two - `dark`
 * mirrors `light` rather than inventing a second one.
 */

import '@/global.css';

import {
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
} from '@expo-google-fonts/ibm-plex-mono';
import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
} from '@expo-google-fonts/ibm-plex-sans';
import { Platform } from 'react-native';

import type { TicketStatus } from '@/types/api';

const ink = '#131A24';
const ground = '#F7F8FA';
const surface = '#FFFFFF';
const rule = '#DFE4EC';
const accent = '#1D6F8B';

export const Colors = {
  light: {
    text: ink,
    background: ground,
    surface,
    rule,
    accent,
    // Muted fill and muted text, derived the same way the web client's
    // Tailwind theme derives --muted / --muted-foreground: ink mixed 4% and
    // 55% into ground. Kept as flat hex here because React Native has no
    // color-mix().
    backgroundElement: '#EEEFF1',
    backgroundSelected: '#E5E6E9',
    textSecondary: '#7A7E84',
  },
  dark: {
    text: ink,
    background: ground,
    surface,
    rule,
    accent,
    backgroundElement: '#EEEFF1',
    backgroundSelected: '#E5E6E9',
    textSecondary: '#7A7E84',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Mirrors web's `--destructive`: a failed send or a load error, never a status. */
export const DangerColor = '#B3261E';

/** Status is a 3px coloured left edge, never a pill: decision 0009. */
export const StatusColors: Record<TicketStatus, string> = {
  open: '#B45309',
  pending: '#5B6676',
  resolved: '#15803D',
  closed: '#8A8F98',
};

export const StatusLabels: Record<TicketStatus, string> = {
  open: 'Open',
  pending: 'Pending',
  resolved: 'Resolved',
  closed: 'Closed',
};

/**
 * IBM Plex Sans throughout, IBM Plex Mono for ticket ids and timestamps
 * (decision 0009). Each weight is a distinct font file rather than a
 * synthetic bold/medium, so a style needs the matching family here, not a
 * numeric fontWeight.
 */
export const FontFamily = {
  sans: 'IBMPlexSans_400Regular',
  sansMedium: 'IBMPlexSans_500Medium',
  sansSemiBold: 'IBMPlexSans_600SemiBold',
  sansBold: 'IBMPlexSans_700Bold',
  mono: 'IBMPlexMono_400Regular',
  monoMedium: 'IBMPlexMono_500Medium',
} as const;

/** Passed to expo-font's `useFonts` once, in the root layout. */
export const FontAssets = {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
  IBMPlexSans_700Bold,
  IBMPlexMono_400Regular,
  IBMPlexMono_500Medium,
};

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
