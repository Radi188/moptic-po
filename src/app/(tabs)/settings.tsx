import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BranchPickerSheet } from '@/components/branch-picker-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTranslation } from '@/contexts/i18n';
import { useThemePreference, type ThemePreference } from '@/contexts/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import type { Language } from '@/i18n/translations';

const BRAND = '#232843';
const DANGER = '#e5484d';

// Fixed display order for each picker; the label at each position is looked up
// via `t()`, and selection maps back to the code by index.
const APPEARANCE_ORDER: ThemePreference[] = ['system', 'light', 'dark'];
const LANGUAGE_ORDER: Language[] = ['en', 'km'];

function getInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { isTablet } = useResponsive();
  const { session, switchBranch, signOut } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const { language, setLanguage, t } = useTranslation();
  const km = language === 'km';
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);

  const appearanceLabels: Record<ThemePreference, string> = {
    system: t('appearance.system'),
    light: t('appearance.light'),
    dark: t('appearance.dark'),
  };
  const appearanceOptions = APPEARANCE_ORDER.map((p) => appearanceLabels[p]);

  const languageLabels: Record<Language, string> = {
    en: t('language.en'),
    km: t('language.km'),
  };
  const languageOptions = LANGUAGE_ORDER.map((l) => languageLabels[l]);

  function confirmSignOut() {
    Alert.alert(t('settings.signOut'), t('settings.signOutConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('settings.signOut'), style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const soon = () => Alert.alert(t('common.comingSoon'), t('common.comingSoonBody'));

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText
          style={[
            styles.title,
            isTablet && styles.titleTablet,
            km && (isTablet ? styles.titleTabletKm : styles.titleKm),
          ]}>
          {t('settings.title')}
        </ThemedText>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <ThemedView type="backgroundElement" style={styles.profile}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {getInitials(session?.username ?? '')}
            </ThemedText>
          </View>
          <View style={styles.profileText}>
            <ThemedText type="smallBold" style={styles.profileName} numberOfLines={1}>
              {session?.username ?? t('settings.guest')}
            </ThemedText>
            <View style={styles.profileBranch}>
              <Ionicons name="business-outline" size={13} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {session?.branch.name ?? t('settings.noBranch')}
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        <View style={[styles.sectionGrid, isTablet && styles.sectionGridTablet]}>
        <Section title={t('settings.section.operations')} style={isTablet ? styles.sectionTablet : undefined}>
          <SettingRow
            icon="create-outline"
            color="#F5A623"
            label={t('settings.row.stockAdjustment')}
            onPress={() => router.push('/stock-adjustment')}
            theme={theme}
          />
          <SettingRow
            icon="repeat-outline"
            color="#8E4EC6"
            label={t('settings.row.stockRefill')}
            onPress={() => router.push('/stock-refill')}
            theme={theme}
          />
          <SettingRow
            icon="clipboard-outline"
            color="#30A46C"
            label={t('settings.row.stockCount')}
            onPress={soon}
            theme={theme}
            last
          />
        </Section>

        <Section title={t('settings.section.reports')} style={isTablet ? styles.sectionTablet : undefined}>
          <SettingRow
            icon="layers-outline"
            color="#30A46C"
            label={t('settings.row.stockOnHand')}
            onPress={() => router.push('/stock-on-hand')}
            theme={theme}
          />
          <SettingRow
            icon="stats-chart-outline"
            color="#8E4EC6"
            label={t('settings.row.saleSummaryReport')}
            onPress={() => router.push('/sale-summary-report')}
            theme={theme}
          />
          <SettingRow
            icon="swap-horizontal-outline"
            color="#F5A623"
            label={t('settings.row.transferInReport')}
            onPress={() => router.push('/transfer-in-report')}
            theme={theme}
            last
          />
        </Section>

        <Section title={t('settings.section.account')} style={isTablet ? styles.sectionTablet : undefined}>
          <SettingRow
            icon="git-branch-outline"
            color="#30A46C"
            label={t('settings.row.switchBranch')}
            value={session?.branch.name}
            onPress={() => setBranchPickerOpen(true)}
            theme={theme}
          />
          <SettingRow
            icon="person-outline"
            color="#8E4EC6"
            label={t('settings.row.profile')}
            onPress={soon}
            theme={theme}
            last
          />
        </Section>

        <Section title={t('settings.section.preferences')} style={isTablet ? styles.sectionTablet : undefined}>
          <SettingRow
            icon="notifications-outline"
            color="#F5A623"
            label={t('settings.row.notifications')}
            onPress={soon}
            theme={theme}
          />
          <SettingRow
            icon="language-outline"
            color="#30A46C"
            label={t('settings.row.language')}
            value={languageLabels[language]}
            onPress={() => setLanguageOpen(true)}
            theme={theme}
          />
          <SettingRow
            icon="color-palette-outline"
            color={theme.tint}
            label={t('settings.row.appearance')}
            value={appearanceLabels[preference]}
            onPress={() => setAppearanceOpen(true)}
            theme={theme}
            last
          />
        </Section>

        <Section title={t('settings.section.about')} style={isTablet ? styles.sectionTablet : undefined}>
          <SettingRow
            icon="help-circle-outline"
            color="#30A46C"
            label={t('settings.row.helpSupport')}
            onPress={soon}
            theme={theme}
          />
          <SettingRow
            icon="information-circle-outline"
            color="#8B8D98"
            label={t('settings.row.aboutApp')}
            value="v1.0.0"
            onPress={soon}
            theme={theme}
            last
          />
        </Section>
        </View>

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
          <Ionicons name="log-out-outline" size={18} color={DANGER} />
          <ThemedText style={styles.signOutText}>{t('settings.signOut')}</ThemedText>
        </Pressable>
      </ScrollView>

      <BranchPickerSheet
        visible={branchPickerOpen}
        selectedId={session?.branch.id}
        onSelect={(branch) => {
          switchBranch(branch);
          setBranchPickerOpen(false);
        }}
        onClose={() => setBranchPickerOpen(false)}
      />

      <OptionSheet
        visible={appearanceOpen}
        title={t('settings.row.appearance')}
        options={appearanceOptions}
        selected={appearanceLabels[preference]}
        onSelect={(value) => {
          const index = appearanceOptions.indexOf(value);
          if (index >= 0) setPreference(APPEARANCE_ORDER[index]);
          setAppearanceOpen(false);
        }}
        onClose={() => setAppearanceOpen(false)}
      />

      <OptionSheet
        visible={languageOpen}
        title={t('settings.row.language')}
        options={languageOptions}
        selected={languageLabels[language]}
        onSelect={(value) => {
          const index = languageOptions.indexOf(value);
          if (index >= 0) setLanguage(LANGUAGE_ORDER[index]);
          setLanguageOpen(false);
        }}
        onClose={() => setLanguageOpen(false)}
      />
    </ThemedView>
  );
}

function Section({
  title,
  children,
  style,
}: {
  title: string;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.section, style]}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.sectionCard}>
        {children}
      </ThemedView>
    </View>
  );
}

function SettingRow({
  icon,
  color,
  label,
  value,
  onPress,
  theme,
  last,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  label: string;
  value?: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[styles.row, !last && { borderBottomColor: theme.background, borderBottomWidth: 1 }]}>
        <View style={[styles.rowIcon, { backgroundColor: `${color}22` }]}>
          <Ionicons name={icon} size={18} color={color} />
        </View>
        <ThemedText type="smallBold" style={styles.rowLabel}>
          {label}
        </ThemedText>
        {value ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.rowValue}>
            {value}
          </ThemedText>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  titleTablet: {
    fontSize: 32,
    lineHeight: 40,
  },
  // Khmer titles need more line height so tall stacked glyphs don't clip.
  titleKm: {
    lineHeight: 42,
  },
  titleTabletKm: {
    lineHeight: 50,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.four,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  profileText: {
    flex: 1,
    gap: Spacing.half,
  },
  profileName: {
    fontSize: 17,
  },
  profileBranch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  // Sections stack on phones; on tablets they flow into a two-column grid.
  sectionGrid: {
    gap: Spacing.four,
  },
  sectionGridTablet: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
  },
  section: {
    gap: Spacing.two,
  },
  sectionTablet: {
    width: '48%',
  },
  sectionTitle: {
    marginLeft: Spacing.one,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCard: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowLabel: {
    flex: 1,
  },
  rowValue: {
    maxWidth: 140,
  },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: `${DANGER}1A`,
  },
  signOutText: {
    color: DANGER,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
