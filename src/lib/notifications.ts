/**
 * expo-notifications setup for remote (Expo) push.
 *
 * This module owns the foreground presentation behaviour, the Android channel,
 * and the permission + Expo push token flow. The token is registered with the
 * backend from `usePushNotifications` (see hooks/use-push-notifications.ts).
 *
 * Everything here is best-effort: simulators have no push token, permission can
 * be denied, and the project id can be missing in a misconfigured build — each
 * of those resolves to `null` rather than throwing.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// How a notification is presented while the app is foregrounded. SDK 56 splits
// the old `shouldShowAlert` into `shouldShowBanner` (heads-up banner) and
// `shouldShowList` (kept in the notification centre).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Must match `defaultChannel` in the expo-notifications app.json plugin. */
const ANDROID_CHANNEL_ID = 'default';

/** Android requires a channel before any notification can be shown. */
export async function ensureAndroidChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
    name: 'Default',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#A8867B',
  });
}

/** Resolve the EAS project id from app config — required by getExpoPushTokenAsync. */
function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId
  );
}

/**
 * Request permission (if not already granted) and return the Expo push token,
 * or `null` when it can't be obtained (simulator, denied permission, or a
 * missing project id). Never throws.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  // Push tokens are only issued to physical devices.
  if (!Device.isDevice) return null;

  await ensureAndroidChannel();

  const { status: existing } = await Notifications.getPermissionsAsync();
  let status = existing;
  if (status !== 'granted') {
    ({ status } = await Notifications.requestPermissionsAsync());
  }
  if (status !== 'granted') return null;

  const projectId = getProjectId();
  if (!projectId) return null;

  try {
    const { data } = await Notifications.getExpoPushTokenAsync({ projectId });
    return data;
  } catch {
    return null;
  }
}

export { Notifications };
