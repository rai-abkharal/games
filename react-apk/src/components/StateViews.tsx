import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ThemeColors } from '../theme/themes';

interface MessageProps {
  theme: ThemeColors;
  emoji: string;
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  busy?: boolean;
}

/** Empty / error / offline states share one layout so they feel consistent. */
export function MessageView({ theme, emoji, title, body, actionLabel, onAction, busy }: MessageProps) {
  return (
    <View style={styles.center}>
      <Text style={styles.emoji}>{emoji}</Text>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
      {body ? <Text style={[styles.body, { color: theme.textSecondary }]}>{body}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          disabled={busy}
          style={[styles.button, { backgroundColor: theme.accent, opacity: busy ? 0.6 : 1 }]}
          accessibilityRole="button"
        >
          {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{actionLabel}</Text>}
        </Pressable>
      ) : null}
    </View>
  );
}

export function LoadingView({ theme, label = 'Loading games…' }: { theme: ThemeColors; label?: string }) {
  return (
    <View style={styles.center}>
      <ActivityIndicator size="large" color={theme.accent} />
      <Text style={[styles.body, { color: theme.textSecondary, marginTop: 12 }]}>{label}</Text>
    </View>
  );
}

export function OfflineBanner({ theme, stale }: { theme: ThemeColors; stale: boolean }) {
  return (
    <View style={[styles.banner, { backgroundColor: theme.isDark ? '#7F1D1D' : '#FEE2E2' }]}>
      <Text style={[styles.bannerText, { color: theme.isDark ? '#FECACA' : '#991B1B' }]}>
        {stale
          ? 'You are offline — showing the last downloaded catalogue.'
          : 'You are offline — games need a connection to load.'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 40,
  },
  emoji: { fontSize: 44, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  body: { fontSize: 14, textAlign: 'center', marginTop: 6, lineHeight: 20 },
  button: {
    marginTop: 18,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 140,
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  bannerText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
});
