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
import { GamepadIcon } from '../components/feed/NavIcons';

// Vector Icon Components (Independent of device font glyphs)
function BackChevron({ size = 11, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderLeftWidth: 2.4,
        borderBottomWidth: 2.4,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
        marginLeft: 3,
      }}
    />
  );
}

function ChevronRight({ size = 8, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderTopWidth: 2,
        borderRightWidth: 2,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
        marginLeft: 5,
      }}
    />
  );
}

function CloseIcon({ size = 13, color = '#FFFFFF' }: { size?: number; color?: string }) {
  const barH = 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size,
          height: barH,
          backgroundColor: color,
          borderRadius: 1,
          position: 'absolute',
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          width: size,
          height: barH,
          backgroundColor: color,
          borderRadius: 1,
          position: 'absolute',
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

function CheckIcon({ size = 10, color = '#FFFFFF' }: { size?: number; color?: string }) {
  return (
    <View
      style={{
        width: size * 0.55,
        height: size,
        borderRightWidth: 2.2,
        borderBottomWidth: 2.2,
        borderColor: color,
        transform: [{ rotate: '45deg' }],
        marginBottom: size * 0.2,
      }}
    />
  );
}

function SoundIcon({ size = 18, color = '#4F46E5' }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.28, height: size * 0.38, backgroundColor: color, borderRadius: 1.5 }} />
      <View
        style={{
          width: 0,
          height: 0,
          borderTopWidth: size * 0.32,
          borderBottomWidth: size * 0.32,
          borderRightWidth: size * 0.32,
          borderTopColor: 'transparent',
          borderBottomColor: 'transparent',
          borderRightColor: color,
          marginLeft: -1,
        }}
      />
      <View
        style={{
          width: size * 0.22,
          height: size * 0.44,
          borderRightWidth: 1.8,
          borderColor: color,
          borderRadius: size * 0.22,
          marginLeft: 2.5,
        }}
      />
      <View
        style={{
          width: size * 0.16,
          height: size * 0.68,
          borderRightWidth: 1.8,
          borderColor: color,
          borderRadius: size * 0.2,
          marginLeft: 2,
        }}
      />
    </View>
  );
}

function VibrateIcon({ size = 18, color = '#D97706' }: { size?: number; color?: string }) {
  return (
    <View style={{ width: size, height: size, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
      <View
        style={{
          width: size * 0.12,
          height: size * 0.48,
          borderLeftWidth: 1.8,
          borderColor: color,
          borderRadius: size * 0.1,
          marginRight: 2.5,
        }}
      />
      <View
        style={{
          width: size * 0.42,
          height: size * 0.76,
          borderWidth: 1.8,
          borderColor: color,
          borderRadius: 3,
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 2,
        }}
      >
        <View style={{ width: size * 0.16, height: 1.5, backgroundColor: color, borderRadius: 1 }} />
        <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: color }} />
      </View>
      <View
        style={{
          width: size * 0.12,
          height: size * 0.48,
          borderRightWidth: 1.8,
          borderColor: color,
          borderRadius: size * 0.1,
          marginLeft: 2.5,
        }}
      />
    </View>
  );
}

function CoinIcon({ size = 16 }: { size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#F59E0B',
        borderWidth: 1.5,
        borderColor: '#B45309',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: size * 0.54,
          height: size * 0.54,
          borderRadius: (size * 0.54) / 2,
          borderWidth: 1,
          borderColor: '#FEF3C7',
          backgroundColor: '#FBBF24',
        }}
      />
    </View>
  );
}

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

  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [diagnostics, setDiagnostics] = useState(false);
  const taps = useRef(0);

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
          style={[
            styles.backCircleBtn,
            {
              backgroundColor: theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
              borderColor: theme.border,
            },
          ]}
        >
          <BackChevron size={11} color={theme.textPrimary} />
        </Pressable>
        <Pressable onPress={revealDiagnostics} style={styles.titleCol}>
          <Text style={[styles.title, { color: theme.textPrimary }]}>{t('settingsTitle')}</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            Audio, Themes & Language
          </Text>
        </Pressable>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Audio & Haptics Card */}
        <Card theme={theme} title={t('audioHapticsSection')}>
          <View style={styles.featureRow}>
            <View style={[styles.iconBadge, { backgroundColor: '#E0E7FF' }]}>
              <SoundIcon size={19} color="#4F46E5" />
            </View>
            <View style={styles.featureInfo}>
              <Text style={[styles.featureTitle, { color: theme.textPrimary }]}>{t('sound')}</Text>
              <Text style={[styles.featureSub, { color: theme.textSecondary }]}>
                Game sounds, audio cues & music
              </Text>
            </View>
            <Switch
              value={!soundMuted}
              onValueChange={value => setSoundMuted(!value)}
              trackColor={{ true: theme.accent, false: theme.border }}
              thumbColor={!soundMuted ? '#FFFFFF' : theme.textSecondary}
            />
          </View>
          <View style={[styles.rowDivider, { backgroundColor: theme.border }]} />
          <View style={styles.featureRow}>
            <View style={[styles.iconBadge, { backgroundColor: '#FEF3C7' }]}>
              <VibrateIcon size={19} color="#D97706" />
            </View>
            <View style={styles.featureInfo}>
              <Text style={[styles.featureTitle, { color: theme.textPrimary }]}>{t('vibration')}</Text>
              <Text style={[styles.featureSub, { color: theme.textSecondary }]}>
                Tactile response on taps & scores
              </Text>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={setVibrationEnabled}
              trackColor={{ true: theme.accent, false: theme.border }}
              thumbColor={vibrationEnabled ? '#FFFFFF' : theme.textSecondary}
            />
          </View>
        </Card>

        {/* 2. Appearance & Visual Themes */}
        <Card theme={theme} title={t('themeSection')}>
          <View style={styles.themeRow}>
            {THEME_ORDER.map(id => {
              const option = THEMES[id];
              const active = id === themeId;
              const swatches =
                id === 'eibi_purple'
                  ? ['#B266FF', '#F2C200']
                  : id === 'pure_white'
                  ? ['#FFFFFF', '#6366F1']
                  : id === 'off_white'
                  ? ['#F8F6F0', '#D97706']
                  : ['#0F172A', '#38BDF8'];

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
                      borderWidth: active ? 2.5 : 1,
                      shadowColor: active ? theme.accent : '#000',
                      shadowOpacity: active ? 0.25 : 0.05,
                    },
                  ]}
                >
                  <View style={styles.themeTopRow}>
                    <Text style={styles.themeEmoji}>{option.emoji}</Text>
                    {active ? (
                      <View style={[styles.activeCheckBadge, { backgroundColor: theme.accent }]}>
                        <CheckIcon size={8} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </View>
                  <Text style={[styles.themeName, { color: option.textPrimary }]}>
                    {option.name}
                  </Text>
                  {/* Swatches */}
                  <View style={styles.swatchRow}>
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatches[0], borderColor: theme.border },
                      ]}
                    />
                    <View
                      style={[
                        styles.swatchDot,
                        { backgroundColor: swatches[1], borderColor: 'transparent' },
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </Card>

        {/* 3. Language Section */}
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
                {t('selectLanguage')}
              </Text>
              <ChevronRight size={8} color={theme.accent} />
            </View>
          </Pressable>
        </Card>

        {/* 4. Diagnostics (revealed on 5 taps on header title) */}
        {diagnostics ? <Diagnostics theme={theme} /> : null}
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
                accessibilityLabel="Close"
              >
                <CloseIcon size={12} color={theme.textSecondary} />
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
                        <CheckIcon size={11} color="#FFFFFF" />
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
  const [health, setHealth] = useState(analyticsHealth());
  const [store, setStore] = useState<Awaited<ReturnType<typeof bundleStatus>> | null>(null);
  const [pinged, setPinged] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      setHealth(analyticsHealth());
      const s = await bundleStatus();
      if (!cancelled) setStore(s);
    };
    void poll();
    const id = setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const ping = useCallback(() => {
    const tag = String(Date.now()).slice(-6);
    analytics.onGameAction('diagnostics', 'Diagnostics', 'analytics_ping', tag);
    setPinged(tag);
    toast(`Sent analytics_ping ${tag}`);
  }, []);

  return (
    <Card theme={theme} title="Diagnostics">
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Firebase: {health.available ? 'initialised' : `unavailable - ${health.error ?? 'unknown'}`}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>Session: {health.sessionId}</Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Game store: {store ? (store.available ? `serving on :${store.port}` : 'not serving') : 'checking...'}
      </Text>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        Stored: {store ? `${store.ready.length} builds, ${(store.usedBytes / (1024 * 1024)).toFixed(1)} MB` : '-'}
      </Text>
      {pinged ? (
        <Text style={[styles.hint, { color: theme.textSecondary }]}>
          Look for game_action with action_value = {pinged}
        </Text>
      ) : null}
      <Pressable onPress={ping} style={[styles.clearCacheBtn, { backgroundColor: theme.accent, borderColor: theme.accent }]}>
        <Text style={[styles.clearCacheBtnText, { color: '#FFFFFF' }]}>Send analytics ping</Text>
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
  backCircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
    marginHorizontal: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  subtitle: {
    fontSize: 11,
    marginTop: 1,
  },
  doneBtnPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 14,
    borderWidth: 1,
  },
  doneText: {
    fontSize: 13,
    fontWeight: '700',
  },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 14 },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  cardTitle: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2 },

  // Profile Hero
  profileHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  avatarBadge: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  profileIdText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '600',
  },
  walletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  coinsPill: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  coinsPillText: {
    color: '#B45309',
    fontSize: 13,
    fontWeight: '800',
  },
  walletHint: {
    fontSize: 12,
  },

  // Audio / Haptics Features
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  iconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureInfo: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  featureSub: {
    fontSize: 11.5,
    marginTop: 2,
  },
  rowDivider: { height: StyleSheet.hairlineWidth, width: '100%' },

  // Themes
  themeRow: { flexDirection: 'row', gap: 10 },
  themeCard: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 5,
    elevation: 2,
  },
  themeTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  themeEmoji: { fontSize: 22 },
  activeCheckBadge: {
    position: 'absolute',
    right: 0,
    top: -2,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeName: { fontSize: 11, fontWeight: '800', textAlign: 'center' },
  swatchRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  swatchDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 1,
  },

  hint: { fontSize: 12, lineHeight: 17 },

  // Storage / Cache
  clearCacheBtn: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  clearCacheBtnText: {
    fontWeight: '800',
    fontSize: 13,
  },

  // Confirm Return Button
  confirmButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
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
    flexDirection: 'row',
    alignItems: 'center',
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
});
