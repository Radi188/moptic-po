import { useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";

import {
  API_BASE_URL,
  getBaseUrl,
  isApiConfigured,
  setBaseUrlOverride,
} from "@/api/config";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import { useTranslation } from "@/contexts/i18n";
import { useTheme } from "@/hooks/use-theme";

const BRAND = "#232843";
const DANGER = "#e5484d";

export default function LoginScreen() {
  const theme = useTheme();
  const { signIn } = useAuth();
  const { t, language } = useTranslation();
  const km = language === "km";

  const { width } = useWindowDimensions();
  const isTablet = width >= 768;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [baseUrl, setBaseUrl] = useState(getBaseUrl());
  const [apiModal, setApiModal] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");

  async function handleSignIn() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      // On success the auth guard in the root layout swaps to the tabs.
      await signIn(username, password);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("login.errorGeneric"));
    } finally {
      setSubmitting(false);
    }
  }

  function openApiModal() {
    setDraftUrl(getBaseUrl());
    setApiModal(true);
  }

  async function saveApiUrl(url: string) {
    const resolved = await setBaseUrlOverride(url);
    setBaseUrl(resolved);
    setApiModal(false);
    setError(null);
  }

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <SafeAreaView style={styles.safeArea}>
          <ThemedView
            style={[styles.content, isTablet && styles.contentTablet]}
          >
            <ThemedView style={styles.header}>
              <Image
                source={require("@/assets/images/logo-staff.png")}
                style={[styles.logo, isTablet && styles.logoTablet]}
                resizeMode="contain"
                accessibilityLabel="M Optic-PO"
              />
              <ThemedText
                type="title"
                style={[
                  styles.heading,
                  isTablet && styles.headingTablet,
                  km && (isTablet ? styles.headingTabletKm : styles.headingKm),
                ]}
              >
                {t("login.welcome")}
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.subheading}>
                {t("login.subtitle")}
              </ThemedText>
            </ThemedView>

            <ThemedView style={styles.form}>
              <Field
                icon="person-outline"
                placeholder={t("login.username")}
                value={username}
                onChangeText={setUsername}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                theme={theme}
              />

              <Field
                icon="lock-closed-outline"
                placeholder={t("login.password")}
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
                    accessibilityLabel={
                      showPassword
                        ? t("login.hidePassword")
                        : t("login.showPassword")
                    }
                  >
                    <Ionicons
                      name={showPassword ? "eye-off-outline" : "eye-outline"}
                      size={20}
                      color={theme.textSecondary}
                    />
                  </Pressable>
                }
              />

              {error && (
                <View style={styles.errorBanner}>
                  <Ionicons name="alert-circle" size={18} color={DANGER} />
                  <ThemedText type="small" style={styles.errorText}>
                    {error}
                  </ThemedText>
                </View>
              )}

              <Pressable
                onPress={() => setError(t("login.errorForgot"))}
                style={styles.forgot}
              >
                <ThemedText type="link" style={{ color: theme.tint }}>
                  {t("login.forgotPassword")}
                </ThemedText>
              </Pressable>

              <Pressable
                onPress={handleSignIn}
                disabled={submitting}
                style={({ pressed }) => [
                  styles.button,
                  { backgroundColor: BRAND },
                  (pressed || submitting) && styles.buttonPressed,
                ]}
              >
                {submitting ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <ThemedText style={styles.buttonText}>
                    {t("login.signIn")}
                  </ThemedText>
                )}
              </Pressable>
            </ThemedView>
          </ThemedView>

          <ThemedView style={styles.footer}>
            <Pressable
              onPress={openApiModal}
              hitSlop={Spacing.two}
              accessibilityLabel={t("login.changeApiServer")}
              style={({ pressed }) => [
                styles.apiRow,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name="server-outline"
                size={12}
                color={theme.textSecondary}
              />
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
                style={styles.apiUrl}
              >
                {isApiConfigured() ? baseUrl : t("login.mockData")}
              </ThemedText>
              <Ionicons
                name="create-outline"
                size={12}
                color={theme.textSecondary}
              />
            </Pressable>
          </ThemedView>
        </SafeAreaView>
      </KeyboardAvoidingView>

      <ApiUrlModal
        visible={apiModal}
        value={draftUrl}
        onChangeText={setDraftUrl}
        onCancel={() => setApiModal(false)}
        onSave={() => saveApiUrl(draftUrl)}
        onReset={() => saveApiUrl("")}
        theme={theme}
      />
    </ThemedView>
  );
}

function ApiUrlModal({
  visible,
  value,
  onChangeText,
  onCancel,
  onSave,
  onReset,
  theme,
}: {
  visible: boolean;
  value: string;
  onChangeText: (text: string) => void;
  onCancel: () => void;
  onSave: () => void;
  onReset: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable style={styles.modalBackdrop} onPress={onCancel}>
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={styles.modalCardWrap}
        >
          <ThemedView style={styles.modalCard}>
            <ThemedText type="subtitle" style={styles.modalTitle}>
              {t("login.apiServer")}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t("login.apiServerHint")}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.modalInputWrap}>
              <TextInput
                value={value}
                onChangeText={onChangeText}
                placeholder="https://example.com/api/v1/staff"
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                style={[styles.modalInput, { color: theme.text }]}
              />
            </ThemedView>
            {API_BASE_URL.length > 0 && (
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
              >
                {t("login.apiDefault")}: {API_BASE_URL}
              </ThemedText>
            )}
            <View style={styles.modalActions}>
              <Pressable
                onPress={onReset}
                hitSlop={Spacing.two}
                style={({ pressed }) => pressed && styles.pressed}
              >
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {t("common.reset")}
                </ThemedText>
              </Pressable>
              <View style={styles.modalActionsRight}>
                <Pressable
                  onPress={onCancel}
                  hitSlop={Spacing.two}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {t("common.cancel")}
                  </ThemedText>
                </Pressable>
                <Pressable
                  onPress={onSave}
                  hitSlop={Spacing.two}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <ThemedText type="smallBold" style={{ color: theme.tint }}>
                    {t("common.save")}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </ThemedView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

type FieldProps = React.ComponentProps<typeof TextInput> & {
  icon: React.ComponentProps<typeof Ionicons>["name"];
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
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    alignSelf: "center",
    width: "100%",
    maxWidth: MaxContentWidth,
  },
  content: {
    flex: 1,
    justifyContent: "center",
    gap: Spacing.five,
    width: "100%",
    alignSelf: "center",
  },
  contentTablet: {
    // Keep the form a comfortable reading width instead of stretching across
    // the full tablet screen.
    maxWidth: 460,
    gap: Spacing.six,
  },
  header: {
    alignItems: "center",
    gap: Spacing.two,
  },
  logo: {
    width: 88,
    height: 88,
    borderRadius: Spacing.four,
    marginBottom: Spacing.two,
  },
  logoTablet: {
    width: 120,
    height: 120,
    borderRadius: Spacing.five,
  },
  heading: {
    fontSize: 32,
    lineHeight: 38,
  },
  headingTablet: {
    fontSize: 40,
    lineHeight: 48,
  },
  // Khmer needs extra line height so the tall heading glyphs don't clip.
  headingKm: {
    lineHeight: 50,
  },
  headingTabletKm: {
    lineHeight: 62,
  },
  subheading: {
    textAlign: "center",
  },
  form: {
    gap: Spacing.three,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 52,
    borderRadius: Spacing.three,
  },
  input: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  selectValue: {
    flex: 1,
    fontSize: 16,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    backgroundColor: `${DANGER}1A`,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  errorText: {
    flex: 1,
    color: DANGER,
  },
  forgot: {
    alignSelf: "flex-end",
  },
  button: {
    height: 52,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    marginTop: Spacing.one,
  },
  buttonPressed: {
    opacity: 0.85,
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  pressed: {
    opacity: 0.7,
  },
  footer: {
    alignItems: "center",
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  apiRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    maxWidth: "100%",
    paddingHorizontal: Spacing.three,
  },
  apiUrl: {
    fontSize: 11,
    opacity: 0.7,
    flexShrink: 1,
  },
  modalBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalCardWrap: {
    width: "100%",
    maxWidth: 420,
  },
  modalCard: {
    borderRadius: Spacing.four,
    padding: Spacing.four,
    gap: Spacing.three,
  },
  modalTitle: {
    fontSize: 18,
  },
  modalInputWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Spacing.three,
    height: 48,
    borderRadius: Spacing.three,
  },
  modalInput: {
    flex: 1,
    fontSize: 15,
    height: "100%",
  },
  modalActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.one,
  },
  modalActionsRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.four,
  },
});
