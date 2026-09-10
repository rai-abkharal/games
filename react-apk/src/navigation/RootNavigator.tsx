import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useMemo } from 'react';
import { FeedScreen } from '../screens/FeedScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { useTheme } from '../theme/useTheme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Feed → Settings, mirroring MainActivity → SettingsActivity. The feed stays
 * mounted underneath Settings (its games are paused via the focus effect), so
 * coming back is instant and nothing reloads.
 */
export function RootNavigator() {
  const theme = useTheme();
  const navTheme = useMemo(() => {
    const base = theme.isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: theme.accent,
        background: theme.bg,
        card: theme.card,
        text: theme.textPrimary,
        border: theme.border,
      },
    };
  }, [theme]);

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName="Feed"
        screenOptions={{ headerShown: false, animation: 'fade', orientation: 'portrait' }}
      >
        <Stack.Screen
          name="Feed"
          component={FeedScreen}
          options={{
            contentStyle: { backgroundColor: theme.bg },
            // The pager owns vertical drags; the stack must never pop it from an edge swipe.
            gestureEnabled: false,
          }}
        />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ animation: 'fade' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
