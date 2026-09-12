/**
 * Relay's design system: docs/decisions/0009-one-design-system-two-densities.md.
 * These tokens are the source of truth, duplicated here because this repo
 * cannot import them from the other two clients (`backend-laravel`'s
 * `resources/css/app.css` carries the same nine values).
 *
 * Two palettes, selected by the OS colour scheme. The dark set is not an
 * inversion: the ground is lifted off black, text stops short of pure white to
 * avoid haloing, and the accent and status colours are lifted because the light
 * ones are close to invisible on a dark ground. React Native has no color-mix,
 * so every derived value here is a flat hex computed from the same rules the
 * web client applies.
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

const darkInk = '#E6EAF0';
const darkGround = '#0E1319';
const darkSurface = '#161D26';
const darkRule = '#242E3A';
const darkAccent = '#4FA8C4';

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
    // The tint behind your own messages. A single opacity cannot serve both
    // themes: 12% of a dark accent reads on white, 12% of a light accent on a
    // dark surface is almost nothing and own and other messages stop being
    // tellable apart.
    surfaceOwn: '#E8F0F3',
    statusOpen: '#B45309',
    statusPending: '#5B6676',
    statusResolved: '#15803D',
    statusClosed: '#8A8F98',
  },
  dark: {
    text: darkInk,
    background: darkGround,
    surface: darkSurface,
    rule: darkRule,
    accent: darkAccent,
    backgroundElement: '#1D2530',
    backgroundSelected: '#252E3A',
    textSecondary: '#8A96A6',
    surfaceOwn: '#22414F',
    statusOpen: '#E0A159',
    statusPending: '#8A96A6',
    statusResolved: '#5CC489',
    statusClosed: '#6C7887',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/**
 * The status edge colour for the active colour scheme. Status lives on the
 * theme rather than in a flat record because the light values are close to
 * invisible on a dark ground: #15803D green in particular disappears.
 */
export function statusColor(
  theme: (typeof Colors)['light'] | (typeof Colors)['dark'],
  status: TicketStatus,
): string {
  switch (status) {
    case 'open':
      return theme.statusOpen;
    case 'pending':
      return theme.statusPending;
    case 'resolved':
      return theme.statusResolved;
    case 'closed':
      return theme.statusClosed;
  }
}

/** Mirrors web's `--destructive`: a failed send or a load error, never a status. */
export const DangerColor = '#B3261E';

/**
 * Status is a 3px coloured left edge, never a pill: decision 0009.
 *
 * Prefer reading these off `useTheme()` (`statusOpen` and friends), which
 * follows the OS colour scheme. This flat record is the light set, kept for
 * call sites that have no theme in scope.
 */
export const StatusColors: Record<TicketStatus, string> = {
  open: '#B45309',
  pending: '#5B6676',
  resolved: '#15803D',
  closed: '#8A8F98',
};

/** The same four, lifted for a dark ground. */
export const StatusColorsDark: Record<TicketStatus, string> = {
  open: '#E0A159',
  pending: '#8A96A6',
  resolved: '#5CC489',
  closed: '#6C7887',
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
