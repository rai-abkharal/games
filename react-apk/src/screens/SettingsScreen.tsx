import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getActiveBaseUrl } from '../api/http';
import { STORAGE_KEYS } from '../config/env';
import {
  LANGUAGES,
  LANGUAGE_LIST,
  useTranslation,
  type LanguageCode,
  type LanguageInfo,
} from '../i18n/translations';
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

export function SettingsScreen({ navigation }: RootScreenProps<'Settings'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t, language, setLanguage, currentLanguageInfo } = useTranslation();

  const playerId = usePlayerStore(state => state.playerId);
  const coins = usePlayerStore(state => state.coins);
  const soundMuted = usePlayerStore(state => state.soundMuted);
  const vibrationEnabled = usePlayerStore(state => state.vibrationEnabled);
  const themeId = usePlayerStore(state => state.themeId);
  const setSoundMuted = usePlayerStore(state => state.setSoundMuted);
  const setVibrationEnabled = usePlayerStore(state => state.setVibrationEnabled);
  const setTheme = usePlayerStore(state => state.setTheme);

  const [clearing, setClearing] = useState(false);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const taps = useRef(0);

  const clearCatalogCache = useCallback(async () => {
    setClearing(true);
    await removeKeys([STORAGE_KEYS.catalog, STORAGE_KEYS.adsConfig]);
    await useCatalogStore.getState().refresh({ force: true });
    void adManager.refreshConfig();
    setClearing(false);
    toast(t('cacheRefreshedToast'));
  }, [t]);

  const revealDiagnostics = useCallback(() => {
    taps.current += 1;
    if (taps.current >= 5) {
      taps.current = 0;
      setDiagnostics(true);
    }
  }, []);

  const handleSelectLanguage = (langCode: LanguageCode) => {
    setLanguage(langCode);
    setLanguageModalVisible(false);
    toast(t('languageChangedToast'));
  };

  return (
    <View style={[styles.root, { backgroundColor: theme.bg, paddingTop: insets.top }]}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      {/* Top Header Bar */}
      <View style={[styles.toolbar, { borderBottomColor: theme.border }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          accessibilityLabel="Back"
          style={styles.toolbarBtn}
        >
          <Text style={[styles.back, { color: theme.textPrimary }]}>←</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.textPrimary }]}>{t('settingsTitle')}</Text>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={12}
          style={styles.toolbarBtn}
        >
          <Text style={[styles.done, { color: theme.accent }]}>{t('done')}</Text>
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Language Section */}
        <Card theme={theme} title={t('languageSection')}>
          <Pressable
            onPress={() => setLanguageModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel={t('selectLanguage')}
            style={({ pressed }) => [
              styles.languageCard,
              {
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                borderColor: theme.border,
                opacity: pressed ? 0.8 : 1,
              },
            ]}
          >
            <View style={styles.languageCardLeft}>
              <Text style={styles.languageFlag}>{currentLanguageInfo.flag}</Text>
              <View>
                <Text style={[styles.languageNative, { color: theme.textPrimary }]}>
                  {currentLanguageInfo.nativeName}
                </Text>
                <Text style={[styles.languageEnglish, { color: theme.textSecondary }]}>
                  {currentLanguageInfo.name}
                </Text>
              </View>
            </View>
            <View style={[styles.changeBadge, { backgroundColor: theme.accent + '22' }]}>
              <Text style={[styles.changeBadgeText, { color: theme.accent }]}>
                {t('selectLanguage')} ›
              </Text>
            </View>
          </Pressable>
        </Card>

        {/* 2. Audio & Haptics */}
        <Card theme={theme} title={t('audioHapticsSection')}>
          <Row theme={theme} label={t('sound')}>
            <Switch
              value={!soundMuted}
              onValueChange={value => setSoundMuted(!value)}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </Row>
          <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
          <Row theme={theme} label={t('vibration')}>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ true: theme.accent, false: theme.border }}
            />
          </Row>
        </Card>

        {/* 3. Theme */}
        <Card theme={theme} title={t('themeSection')}>
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
                      borderWidth: active ? 2.5 : StyleSheet.hairlineWidth,
                    },
                  ]}
                >
                  <Text style={styles.themeEmoji}>{option.emoji}</Text>
                  <Text style={[styles.themeName, { color: option.textPrimary }]}>
                    {option.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 4. Profile */}
        <Pressable onPress={revealDiagnostics} accessibilityRole="button" accessibilityLabel="Profile">
          <Card theme={theme} title={t('profileSection')}>
            <View style={styles.profileRow}>
              <Text style={[styles.text, { color: theme.textPrimary }]}>
                {t('playerId')}: {playerId || t('guest')}
              </Text>
            </View>
            <View style={styles.profileRow}>
              <Text style={[styles.text, { color: theme.textPrimary }]}>
                🪙 {t('totalWallet')}: {coins} {t('coins')}
              </Text>
            </View>
          </Card>
        </Pressable>

        {/* 5. Diagnostics (revealed on 5 taps) */}
        {diagnostics ? <Diagnostics theme={theme} /> : null}

        {/* 6. Data & Storage */}
        <Card theme={theme} title={t('dataSection')}>
          <Text style={[styles.hint, { color: theme.textSecondary }]}>
            {t('backendServer')}: {getActiveBaseUrl()}
          </Text>
          <Pressable
            onPress={clearCatalogCache}
            disabled={clearing}
            style={({ pressed }) => [
              styles.button,
              {
                backgroundColor: theme.accent,
                opacity: clearing ? 0.6 : pressed ? 0.85 : 1,
              },
            ]}
          >
            <Text style={styles.buttonText}>
              {clearing ? t('refreshing') : t('refreshCache')}
            </Text>
          </Pressable>
        </Card>

        {/* 7. Confirm & Return */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('confirmReturn')}
          onPress={() => navigation.goBack()}
          style={({ pressed }) => [
            styles.confirmButton,
            { backgroundColor: theme.accent, opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Text style={styles.confirmButtonText}>{t('confirmReturn')}</Text>
        </Pressable>
      </ScrollView>

      {/* Language Selection Modal */}
      <Modal
        visible={languageModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setLanguageModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={styles.modalDismissOverlay}
            onPress={() => setLanguageModalVisible(false)}
          />
          <View
            style={[
              styles.modalSheet,
              { backgroundColor: theme.card, borderColor: theme.border },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
                {t('selectLanguage')}
              </Text>
              <Pressable
                onPress={() => setLanguageModalVisible(false)}
                hitSlop={12}
                style={styles.modalCloseBtn}
              >
                <Text style={[styles.modalCloseText, { color: theme.textSecondary }]}>✕</Text>
              </Pressable>
            </View>

            <FlatList
              data={LANGUAGE_LIST}
              keyExtractor={item => item.code}
              contentContainerStyle={styles.languageListContent}
              renderItem={({ item }: { item: LanguageInfo }) => {
                const isSelected = item.code === language;
                return (
                  <Pressable
                    onPress={() => handleSelectLanguage(item.code)}
                    style={({ pressed }) => [
                      styles.languageItem,
                      {
                        backgroundColor: isSelected
                          ? theme.accent + '18'
                          : pressed
                          ? 'rgba(0,0,0,0.04)'
                          : 'transparent',
                        borderColor: isSelected ? theme.accent : theme.border,
                      },
                    ]}
                  >
                    <View style={styles.languageItemLeft}>
                      <Text style={styles.languageItemFlag}>{item.flag}</Text>
                      <View>
                        <Text
                          style={[
                            styles.languageItemNative,
                            {
                              color: isSelected ? theme.accent : theme.textPrimary,
                              fontWeight: isSelected ? '800' : '600',
                            },
                          ]}
                        >
                          {item.nativeName}
                        </Text>
                        <Text style={[styles.languageItemEng, { color: theme.textSecondary }]}>
                          {item.name}
                        </Text>
                      </View>
                    </View>
                    {isSelected ? (
                      <View style={[styles.checkCircle, { backgroundColor: theme.accent }]}>
                        <Text style={styles.checkText}>✓</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

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

function Card({
  theme,
  title,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: theme.isDark ? 0.25 : 0.06,
          shadowRadius: 6,
          elevation: 2,
        },
      ]}
    >
      <Text style={[styles.cardTitle, { color: theme.textSecondary }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

function Row({
  theme,
  label,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  children: React.ReactNode;
}) {
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
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarBtn: {
    minWidth: 44,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: { fontSize: 22, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '900', letterSpacing: 0.2 },
  done: { fontSize: 15, fontWeight: '800' },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  card: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 },
  rowDivider: { height: StyleSheet.hairlineWidth, width: '100%' },
  profileRow: { paddingVertical: 2 },
  text: { fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 12, lineHeight: 17 },
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
  buttonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 14 },
  confirmButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  confirmButtonText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
    letterSpacing: 0.3,
  },

  // Language Card Styles
  languageCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  languageCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  languageFlag: {
    fontSize: 28,
  },
  languageNative: {
    fontSize: 16,
    fontWeight: '700',
  },
  languageEnglish: {
    fontSize: 12,
    marginTop: 1,
  },
  changeBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  changeBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  // Modal Styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'flex-end',
  },
  modalDismissOverlay: {
    flex: 1,
  },
  modalSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    paddingTop: 16,
    paddingBottom: 32,
    maxHeight: '75%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(150, 150, 150, 0.2)',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(150, 150, 150, 0.15)',
  },
  modalCloseText: {
    fontSize: 14,
    fontWeight: '700',
  },
  languageListContent: {
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 8,
  },
  languageItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  languageItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  languageItemFlag: {
    fontSize: 24,
  },
  languageItemNative: {
    fontSize: 15,
  },
  languageItemEng: {
    fontSize: 11.5,
    marginTop: 1,
  },
  checkCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
});
