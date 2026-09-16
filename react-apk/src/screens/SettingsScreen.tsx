import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { STORAGE_KEYS } from '../config/env';
import type { RootScreenProps } from '../navigation/types';
import { adManager } from '../services/adManager';
import { analytics, analyticsHealth } from '../services/analytics';
import { bundleStatus } from '../services/gameBundles';
import { removeKeys } from '../services/storage';
import { useCatalogStore } from '../store/catalogStore';
import { usePlayerStore } from '../store/playerStore';
import { toast } from '../store/toastStore';
import { THEMES, THEME_ORDER } from '../theme/themes';
import { useTheme } from '../theme/useTheme';
import { getActiveBaseUrl } from '../api/http';

export function SettingsScreen({ navigation }: RootScreenProps<'Settings'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const playerId = usePlayerStore(state => state.playerId);
  const coins = usePlayerStore(state => state.coins);
  const soundMuted = usePlayerStore(state => state.soundMuted);
  const vibrationEnabled = usePlayerStore(state => state.vibrationEnabled);
  const themeId = usePlayerStore(state => state.themeId);
  const setSoundMuted = usePlayerStore(state => state.setSoundMuted);
  const setVibrationEnabled = usePlayerStore(state => state.setVibrationEnabled);
  const setTheme = usePlayerStore(state => state.setTheme);
  const [clearing, setClearing] = useState(false);
  /**
   * Hidden behind five taps on the Profile heading rather than behind
   * `__DEV__`, because the questions it answers — is Firebase actually
   * initialised, is the on-device store running, how much is stored — are
   * exactly the ones that only matter in a release build, where DebugView and
   * logcat are not part of the picture.
   */
  const [diagnostics, setDiagnostics] = useState(false);
  // A ref, not state: counting taps is not something the screen should re-render for.
  const taps = useRef(0);

  const clearCatalogCache = useCallback(async () => {
    setClearing(true);
    await removeKeys([STORAGE_KEYS.catalog, STORAGE_KEYS.adsConfig]);
    await useCatalogStore.getState().refresh({ force: true });
    void adManager.refreshConfig();
    setClearing(false);
    toast('✅ Catalogue cache refreshed');
  }, []);

  const revealDiagnostics = useCallback(() => {
    taps.current += 1;
    if (taps.current >= 5) {
      taps.current = 0;
      setDiagnostics(true);
    }
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />
      <View style={styles.toolbar}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} accessibilityLabel="Back">
          <Text style={[styles.back, { color: theme.textPrimary }]}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>Settings</Text>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={[styles.done, { color: theme.accent }]}>Done</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        <Card theme={theme} title="Audio & Haptics">
          <Row theme={theme} label="Sound">
            <Switch
              value={!soundMuted}
              onValueChange={value => setSoundMuted(!value)}
              trackColor={{ true: theme.accent }}
            />
          </Row>
          <Row theme={theme} label="Vibration">
            <Switch value={vibrationEnabled} onValueChange={setVibrationEnabled} trackColor={{ true: theme.accent }} />
          </Row>
        </Card>

        <Card theme={theme} title="Theme">
          <View style={styles.themeRow}>
            {THEME_ORDER.map(id => {
              const option = THEMES[id];
              const active = id === themeId;
              return (
                <Pressable
                  key={id}
                  onPress={() => {
                    setTheme(id);
                    toast(`${option.emoji} ${option.name} theme activated`);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  style={[
                    styles.themeCard,
                    {
                      backgroundColor: option.bg,
                      borderColor: active ? theme.accent : theme.border,
                      borderWidth: active ? 3 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={styles.themeEmoji}>{option.emoji}</Text>
                  <Text style={[styles.themeName, { color: option.textPrimary }]}>{option.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        <Pressable onPress={revealDiagnostics} accessibilityRole="button" accessibilityLabel="Profile">
          <Card theme={theme} title="Profile">
            <Text style={[styles.text, { color: theme.textPrimary }]}>Player ID: {playerId} (Guest)</Text>
            <Text style={[styles.text, { color: theme.textPrimary }]}>🪙 Total wallet: {coins} coins</Text>
          </Card>
        </Pressable>

        {diagnostics ? <Diagnostics theme={theme} /> : null}

        <Card theme={theme} title="Data">
          <Text style={[styles.hint, { color: theme.textSecondary }]}>Backend: {getActiveBaseUrl()}</Text>
          <Pressable
            onPress={clearCatalogCache}
            disabled={clearing}
            style={[styles.button, { backgroundColor: theme.accent, opacity: clearing ? 0.6 : 1 }]}
          >
            <Text style={styles.buttonText}>{clearing ? 'Refreshing…' : 'Refresh catalogue cache'}</Text>
          </Pressable>
        </Card>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Confirm and return to game"
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.confirmButton,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.confirmButtonText}>✓ Confirm & Return to Game</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

/**
 * What the app can actually verify about itself in a build nobody can attach a
 * debugger to: whether Firebase came up, whether the on-device store is
 * serving, and how much of the catalogue is local. The ping is the part that
 * matters most — an event fired on demand, from a release APK, with a value
 * you can search for in GA4 an hour later, which is the only honest way to
 * confirm the production pipeline end to end.
 */
function Diagnostics({ theme }: { theme: ReturnType<typeof useTheme> }) {
  const [store, setStore] = useState<Awaited<ReturnType<typeof bundleStatus>>>(null);
  const [pinged, setPinged] = useState<string | null>(null);
  const health = analyticsHealth();

  useEffect(() => {
    let cancelled = false;
    void bundleStatus().then(status => {
      if (!cancelled) setStore(status);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ping = useCallback(() => {
    const tag = String(Date.now()).slice(-6);
    analytics.onGameAction('diagnostics', 'Diagnostics', 'analytics_ping', tag);
    setPinged(tag);
    toast(`📡 Sent analytics_ping ${tag}`);
  }, []);

  return (
    <Card theme={theme} title="Diagnostics">
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Firebase: {health.available ? 'initialised' : `unavailable — ${health.error ?? 'unknown'}`}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>Session: {health.sessionId}</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Game store: {store ? (store.available ? `serving on :${store.port}` : 'not serving') : 'checking…'}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Stored: {store ? `${store.ready.length} builds, ${(store.usedBytes / (1024 * 1024)).toFixed(1)} MB` : '—'}
      </Text>
      {pinged ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Look for game_action with action_value = {pinged}
        </Text>
      ) : null}
      <Pressable onPress={ping} style={[styles.button, { backgroundColor: theme.accent }]}>
        <Text style={styles.buttonText}>Send analytics ping</Text>
      </Pressable>
    </Card>
  );
}

function Card({ theme, title, children }: { theme: ReturnType<typeof useTheme>; title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Row({ theme, label, children }: { theme: ReturnType<typeof useTheme>; label: string; children: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.text, { color: theme.textPrimary }]}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { fontSize: 24, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '900' },
  done: { fontSize: 15, fontWeight: '800' },
  content: { paddingHorizontal: 16, gap: 14 },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  text: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12 },
  themeRow: { flexDirection: 'row', gap: 10 },
  themeCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: 6,
  },
  themeEmoji: { fontSize: 22 },
  themeName: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  button: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  confirmButton: {
    height: 54,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    elevation: 4,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});
