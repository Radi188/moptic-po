import { useEffect, useRef } from 'react';

import { registerPushToken } from '@/api/push';
import { useAuth } from '@/contexts/auth';
import { Notifications, registerForPushNotificationsAsync } from '@/lib/notifications';

/**
 * Drives the push lifecycle once mounted inside the auth tree:
 *
 *  - When a session exists, request permission, fetch the Expo push token, and
 *    register it with the backend (deduped so we don't re-POST the same token).
 *  - Wires foreground + tap listeners as hook points for in-app handling.
 *
 * Best-effort throughout: a denied permission or a failed registration is
 * swallowed so it never blocks or breaks the signed-in experience.
 */
export function usePushNotifications() {
  const { session } = useAuth();
  const registeredToken = useRef<string | null>(null);

  useEffect(() => {
    if (!session) {
      // Forget the token on sign-out so the next user re-registers.
      registeredToken.current = null;
      return;
    }
    let active = true;
    registerForPushNotificationsAsync()
      .then((token) => {
        if (!active || !token || token === registeredToken.current) return;
        registeredToken.current = token;
        return registerPushToken(token, session.branch.id);
      })
      .catch(() => {
        // Best-effort: registration failures shouldn't surface to the user.
      });
    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    const received = Notifications.addNotificationReceivedListener(() => {
      // Hook point: a notification arrived while the app was foregrounded.
    });
    const responded = Notifications.addNotificationResponseReceivedListener(() => {
      // Hook point: the user tapped a notification — navigate from here if needed.
    });
    return () => {
      received.remove();
      responded.remove();
    };
  }, []);
}
