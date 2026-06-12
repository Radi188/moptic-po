import Ionicons from 'react-native-vector-icons/Ionicons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSignIn() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // On success the auth guard in the root layout swaps to the tabs.
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SafeAreaView style={styles.safeArea}>
          <ThemedView style={styles.content}>
            <ThemedView style={styles.header}>
              <ThemedView style={styles.logo}>
                <Ionicons name="eye-outline" size={40} color="#ffffff" />
              </ThemedView>
              <ThemedText type="title" style={styles.heading}>
                Welcome back
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subheading}>
                Sign in to continue to moptic
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.form}>
              <Field
                icon="person-outline"
                placeholder="Username"
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                theme={theme}
              />

              <Field
                icon="lock-closed-outline"
                placeholder="Password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="done"
                onSubmitEditing={handleSignIn}
                theme={theme}
                trailing={
                  <Pressable
                    onPress={() => setShowPassword((s) => !s)}
                    hitSlop={Spacing.two}
                    accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
                    <Ionicons
                      name={showPassword ? 'eye-off-outline' : 'eye-outline'}
                      size={20}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                }
              />

              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <Pressable
                onPress={() => setError('Password recovery is not available yet.')}
                style={styles.forgot}>
                <ThemedText type="link" style={{ color: BRAND }}>
                  Forgot password?
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleSignIn}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: BRAND },
                  (pressed || submitting) && styles.buttonPressed,
                ]}>
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <ThemedText style={styles.buttonText}>Sign in</ThemedText>
                )}
              </Pressable>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.footer}>
            <ThemedText type="small" themeColor="textSecondary">
              Don&apos;t have an account?{' '}
            </ThemedText>
            <ThemedText type="smallBold" style={{ color: BRAND }}>
              Sign up
            </ThemedText>
          </ThemedView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  trailing?: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
};

function Field({ icon, trailing, theme, style, ...inputProps }: FieldProps) {
  return (
    <ThemedView type="backgroundElement" style={styles.field}>
      <Ionicons name={icon} size={20} color={theme.textSecondary} />
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text }, style]}
        {...inputProps}
      />
      {trailing}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    alignSelf: 'center',
    width: '100%',
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.five,
  },
  header: {
    alignItems: 'center',
    gap: Spacing.two,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: Spacing.four,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  heading: {
    fontSize: 32,
    lineHeight: 38,
  },
  subheading: {
    textAlign: 'center',
  },
  form: {
    gap: Spacing.three,
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
  selectValue: {
    flex: 1,
    fontSize: 16,
  },
  error: {
    color: '#e5484d',
  },
  forgot: {
    alignSelf: 'flex-end',
  },
  button: {
    height: 52,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.one,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Spacing.three,
  },
});
