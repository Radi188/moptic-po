import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BranchPickerSheet } from '@/components/branch-picker-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useThemePreference, type ThemePreference } from '@/contexts/theme';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const DANGER = '#e5484d';

const APPEARANCE_LABELS: Record<ThemePreference, string> = {
  system: 'System',
  light: 'Light',
  dark: 'Dark',
};
const APPEARANCE_OPTIONS = ['System', 'Light', 'Dark'];

function labelToPreference(label: string): ThemePreference {
  return label === 'Light' ? 'light' : label === 'Dark' ? 'dark' : 'system';
}

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
  const { session, switchBranch, signOut } = useAuth();
  const { preference, setPreference } = useThemePreference();
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);

  function confirmSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut() },
    ]);
  }

  const soon = () => Alert.alert('Coming soon', 'This feature is not available yet.');

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <ThemedText style={styles.title}>Settings</ThemedText>
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
              {session?.username ?? 'Guest'}
            </ThemedText>
            <View style={styles.profileBranch}>
              <Ionicons name="business-outline" size={13} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {session?.branch.name ?? 'No branch'}
              </ThemedText>
            </View>
          </View>
        </ThemedView>

        <Section title="Operations">
          <SettingRow
            icon="create-outline"
            color="#F5A623"
            label="Stock Adjustment"
            onPress={() => router.push('/stock-adjustment')}
            theme={theme}
          />
          <SettingRow
            icon="repeat-outline"
            color="#8E4EC6"
            label="Stock Refill"
            onPress={() => router.push('/stock-refill')}
            theme={theme}
          />
          <SettingRow
            icon="clipboard-outline"
            color="#30A46C"
            label="Stock Count"
            onPress={() => router.push('/stock-count')}
            theme={theme}
            last
          />
        </Section>

        <Section title="Reports">
          <SettingRow
            icon="layers-outline"
            color="#30A46C"
            label="Stock on Hand"
            onPress={() => router.push('/stock-on-hand')}
            theme={theme}
          />
          <SettingRow
            icon="bar-chart-outline"
            color={theme.tint}
            label="Stock Report"
            onPress={() => router.push('/stock-report')}
            theme={theme}
            last
          />
        </Section>

        <Section title="Account">
          <SettingRow
            icon="git-branch-outline"
            color="#30A46C"
            label="Switch Branch"
            value={session?.branch.name}
            onPress={() => setBranchPickerOpen(true)}
            theme={theme}
          />
          <SettingRow
            icon="person-outline"
            color="#8E4EC6"
            label="Profile"
            onPress={soon}
            theme={theme}
            last
          />
        </Section>

        <Section title="Preferences">
          <SettingRow
            icon="notifications-outline"
            color="#F5A623"
            label="Notifications"
            onPress={soon}
            theme={theme}
          />
          <SettingRow
            icon="color-palette-outline"
            color={theme.tint}
            label="Appearance"
            value={APPEARANCE_LABELS[preference]}
            onPress={() => setAppearanceOpen(true)}
            theme={theme}
            last
          />
        </Section>

        <Section title="About">
          <SettingRow
            icon="help-circle-outline"
            color="#30A46C"
            label="Help & Support"
            onPress={soon}
            theme={theme}
          />
          <SettingRow
            icon="information-circle-outline"
            color="#8B8D98"
            label="About moptic"
            value="v1.0.0"
            onPress={soon}
            theme={theme}
            last
          />
        </Section>

        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
          <Ionicons name="log-out-outline" size={18} color={DANGER} />
          <ThemedText style={styles.signOutText}>Sign out</ThemedText>
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
        title="Appearance"
        options={APPEARANCE_OPTIONS}
        selected={APPEARANCE_LABELS[preference]}
        onSelect={(value) => {
          setPreference(labelToPreference(value));
          setAppearanceOpen(false);
        }}
        onClose={() => setAppearanceOpen(false)}
      />
    </ThemedView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
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
  section: {
    gap: Spacing.two,
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
