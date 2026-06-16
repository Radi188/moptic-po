import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';

import { loadBaseUrlOverride } from '@/api/config';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { QuickLoginModal } from '@/components/quick-login-modal';
import { AuthProvider, useAuth } from '@/contexts/auth';
import { AppThemeProvider, useThemePreference } from '@/contexts/theme';

// Keep the native splash up until we know whether the user is signed in,
// so we never flash the login screen at an already-authenticated user.
SplashScreen.preventAutoHideAsync();

function RootNavigator() {
  const { session, isLoading } = useAuth();
  // react-native-vector-icons ships the font files; load them so glyphs render
  // in Expo Go without native linking.
  const [fontsLoaded] = useFonts({
    Ionicons: require('react-native-vector-icons/Fonts/Ionicons.ttf'),
  });

  // Apply any persisted API base URL override before the first request.
  const [configLoaded, setConfigLoaded] = useState(false);
  useEffect(() => {
    loadBaseUrlOverride().finally(() => setConfigLoaded(true));
  }, []);

  const ready = !isLoading && fontsLoaded && configLoaded;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  // Wait for the persisted session and icon fonts before mounting any route.
  if (!ready) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="purchase-order/[id]" />
        <Stack.Screen name="inventory-item/[id]" />
        <Stack.Screen name="transfer/[id]" />
        <Stack.Screen name="stock-report" />
        <Stack.Screen name="stock-on-hand" />
        <Stack.Screen name="stock-count/index" />
        <Stack.Screen name="stock-count/new" />
        <Stack.Screen name="stock-count/[id]" />
        <Stack.Screen name="stock-count/loss" />
        <Stack.Screen name="stock-adjustment/index" />
        <Stack.Screen name="stock-adjustment/[id]" />
        <Stack.Screen name="stock-refill/index" />
        <Stack.Screen name="stock-refill/[branchId]" />
      </Stack.Protected>

      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

function ThemedApp() {
  const { scheme } = useThemePreference();
  return (
    <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
      <AnimatedSplashOverlay />
      <RootNavigator />
      <QuickLoginModal />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppThemeProvider>
      <AuthProvider>
        <ThemedApp />
      </AuthProvider>
    </AppThemeProvider>
  );
}
