import { usePlayerStore } from '../store/playerStore';
import { THEMES, type ThemeColors } from './themes';

export function useTheme(): ThemeColors {
  const themeId = usePlayerStore(state => state.themeId);
  return THEMES[themeId] ?? THEMES.pure_white;
}
