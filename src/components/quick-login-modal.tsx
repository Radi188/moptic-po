import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

function getInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}

export function QuickLoginModal() {
  const theme = useTheme();
  const { quickLoginRequired, session, quickSignIn, signOut } = useAuth();

  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const visible = quickLoginRequired && !!session;

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (visible) {
      setName(session?.name ?? '');
      setPassword('');
      setError(null);
      setSubmitting(false);
    }
  }, [visible, session?.name]);

  async function submit() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      await quickSignIn(name, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ThemedView style={styles.card}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {getInitials(session?.username ?? '')}
            </ThemedText>
          </View>

          <ThemedText type="subtitle" style={styles.title}>
            Session expired
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.subtitle}>
            Signed in as {session?.username ?? ''}. Please sign in again to continue.
          </ThemedText>

          <ThemedView type="backgroundElement" style={styles.field}>
            <Ionicons name="person-outline" size={20} color={theme.textSecondary} />
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Name"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.input, { color: theme.text }]}
            />
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.field}>
            <Ionicons name="lock-closed-outline" size={20} color={theme.textSecondary} />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              placeholderTextColor={theme.textSecondary}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
              onSubmitEditing={submit}
              style={[styles.input, { color: theme.text }]}
            />
            <Pressable onPress={() => setShowPassword((s) => !s)} hitSlop={Spacing.two}>
              <Ionicons
                name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={theme.textSecondary}
              />
            </Pressable>
          </ThemedView>

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={submit}
            disabled={submitting}
            style={({ pressed }) => [
              styles.button,
              (pressed || submitting) && styles.pressed,
            ]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.buttonText}>Sign in</ThemedText>
            )}
          </Pressable>

          <Pressable onPress={() => signOut()} hitSlop={Spacing.two} style={styles.signOut}>
            <ThemedText type="small" themeColor="textSecondary">
              Sign out instead
            </ThemedText>
          </Pressable>
        </ThemedView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  card: {
    width: '100%',
    maxWidth: 380,
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
    alignItems: 'stretch',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
    textAlign: 'center',
  },
  subtitle: {
    textAlign: 'center',
  },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 52,
    borderRadius: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  error: {
    color: '#e5484d',
    textAlign: 'center',
  },
  button: {
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.85,
  },
});
