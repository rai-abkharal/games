/** The three palettes from the native ThemeManager, plus shared HUD colours. */

export type ThemeId = 'eibi_purple' | 'pure_white' | 'off_white' | 'midnight_dark';

export interface ThemeColors {
  id: ThemeId;
  name: string;
  emoji: string;
  bg: string;
  card: string;
  textPrimary: string;
  textSecondary: string;
  accent: string;
  secondaryAccent?: string;
  nav: string;
  banner: string;
  border: string;
  isDark: boolean;
}

export const THEMES: Record<ThemeId, ThemeColors> = {
  eibi_purple: {
    id: 'eibi_purple',
    name: 'EiBi Violet',
    emoji: '🔮',
    bg: '#F6F3FC',
    card: '#FFFFFF',
    textPrimary: '#1E1035',
    textSecondary: '#6D5D8A',
    accent: '#8B5CF6',
    secondaryAccent: '#F59E0B',
    nav: '#FFFFFF',
    banner: '#EDE6FD',
    border: 'rgba(139, 92, 246, 0.18)',
    isDark: false,
  },
  pure_white: {
    id: 'pure_white',
    name: 'Pure White',
    emoji: '☀️',
    bg: '#FFFFFF',
    card: '#F8FAFC',
    textPrimary: '#0F172A',
    textSecondary: '#64748B',
    accent: '#6366F1',
    nav: '#FFFFFF',
    banner: '#F1F5F9',
    border: '#E2E8F0',
    isDark: false,
  },
  off_white: {
    id: 'off_white',
    name: 'Soft Warm',
    emoji: '🍦',
    bg: '#F8F6F0',
    card: '#EFECE6',
    textPrimary: '#1E293B',
    textSecondary: '#475569',
    accent: '#D97706',
    nav: '#F8F6F0',
    banner: '#EAE6DE',
    border: '#E4DFD5',
    isDark: false,
  },
  midnight_dark: {
    id: 'midnight_dark',
    name: 'Midnight Dark',
    emoji: '🌙',
    bg: '#0F172A',
    card: '#1E293B',
    textPrimary: '#F8FAFC',
    textSecondary: '#94A3B8',
    accent: '#38BDF8',
    nav: '#0B1120',
    banner: '#1E293B',
    border: '#243044',
    isDark: true,
  },
};

export const THEME_ORDER: ThemeId[] = ['eibi_purple', 'pure_white', 'off_white', 'midnight_dark'];

/** The game surface is always this colour, matching item_game_page.xml. */
export const GAME_SURFACE = '#070D1E';

/** HUD text floats over live game canvases, so it is fixed regardless of theme. */
export const HUD = {
  text: '#F8FAFC',
  muted: '#BFDBFE',
  heart: '#EF4444',
  gold: '#FBBF24',
  glass: 'rgba(15, 23, 42, 0.62)',
  glassBorder: 'rgba(191, 227, 255, 0.35)',
  success: '#10B981',
  danger: '#EF4444',
} as const;

/**
 * Translucent "crystal glass" surfaces from the native drawables
 * (bg_top_bar_glass*, bg_nav_bar*, bg_handle_pill, bg_stats_badge,
 * bg_pill_gold), converted from #AARRGGBB to rgba().
 */
export const GLASS = {
  topBar: {
    light: { fill: 'rgba(18, 58, 112, 0.27)', border: 'rgba(191, 227, 255, 0.55)', sheen: 'rgba(255, 255, 255, 0.18)' },
    dark: { fill: 'rgba(6, 20, 45, 0.32)', border: 'rgba(178, 102, 255, 0.46)', sheen: 'rgba(255, 255, 255, 0.15)' },
  },
  dock: {
    light: { fill: 'rgba(18, 58, 112, 0.28)', border: 'rgba(191, 227, 255, 0.65)', sheen: 'rgba(255, 255, 255, 0.22)' },
    dark: { fill: 'rgba(6, 20, 45, 0.35)', border: 'rgba(178, 102, 255, 0.48)', sheen: 'rgba(255, 255, 255, 0.18)' },
  },
  handle: { fill: 'rgba(18, 58, 112, 0.60)', border: 'rgba(255, 255, 255, 0.50)' },
  coinsPill: { fill: 'rgba(242, 194, 0, 0.22)', border: 'rgba(242, 194, 0, 0.70)', text: '#F2C200' },
  bestPill: { fill: 'rgba(242, 194, 0, 0.22)', border: 'rgba(242, 194, 0, 0.70)', text: '#F2C200' },
  /** Inactive dock tint: #D6E9FF on light themes, #D9D3EE on Dark. */
  navInactive: { light: '#D6E9FF', dark: '#D9D3EE' },
  placeholderAccent: '#8B5CF6',
  placeholderCircle: '#EDE6FD',
} as const;
