import * as SecureStore from 'expo-secure-store';
import { createContext, use, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

import { login, logout, type ApiBranch } from '@/api/auth';
import { setUnauthorizedHandler } from '@/api/client';
import { isApiConfigured } from '@/api/config';
import { BRANCHES, type Branch } from '@/constants/branches';

const SESSION_KEY = 'moptic.session';

export type Session = {
  username: string;
  /** The login name used for re-authentication (quick login). */
  name: string;
  token: string;
  branch: Branch;
  branches: Branch[];
  userId?: number;
  permissions?: string[];
};

type AuthContextValue = {
  session: Session | null;
  /** True until the persisted session has been read from storage on launch. */
  isLoading: boolean;
  /** Set when a request 401s — prompt a quick re-login without losing the screen. */
  quickLoginRequired: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  quickSignIn: (name: string, password: string) => Promise<void>;
  switchBranch: (branch: Branch) => Promise<void>;
  signOut: () => Promise<void>;
};

function toBranch(branch: ApiBranch): Branch {
  return { id: String(branch.id), name: branch.branch_name, location: branch.address };
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * SecureStore is unavailable on web, so fall back to localStorage there.
 * Keeps the same async surface so callers don't need to branch.
 */
const storage = {
  async getItem(key: string) {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(key) ?? null;
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.setItem(key, value);
    return SecureStore.setItemAsync(key, value);
  },
  async removeItem(key: string) {
    if (Platform.OS === 'web') return void globalThis.localStorage?.removeItem(key);
    return SecureStore.deleteItemAsync(key);
  },
};

/**
 * Mock authentication. Swap the body of `signIn` for a real API call when a
 * backend is available — the rest of the app only depends on `session`.
 */
async function authenticate(username: string, password: string): Promise<Session> {
  // Simulate network latency.
  await new Promise((resolve) => setTimeout(resolve, 700));

  if (!username.trim() || !password.trim()) {
    throw new Error('Please enter your username and password.');
  }
  if (password.length < 4) {
    throw new Error('Password must be at least 4 characters.');
  }

  return {
    username: username.trim(),
    name: username.trim(),
    token: `mock-${Date.now()}`,
    branch: BRANCHES[0],
    branches: BRANCHES,
  };
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [quickLoginRequired, setQuickLoginRequired] = useState(false);

  useEffect(() => {
    let active = true;
    storage
      .getItem(SESSION_KEY)
      .then((raw) => {
        if (active && raw) setSession(JSON.parse(raw) as Session);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // When a request gets a 401 the client clears the token; prompt a quick
  // re-login (keeping the current screen) instead of a full sign-out.
  useEffect(() => {
    setUnauthorizedHandler(() => setQuickLoginRequired(true));
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      quickLoginRequired,
      async signIn(username, password) {
        let next: Session;
        if (isApiConfigured()) {
          // POST /login { name, password }
          const res = await login({ name: username.trim(), password });
          const branches = res.branches.map(toBranch);
          if (branches.length === 0) {
            throw new Error('No branch is assigned to this account.');
          }
          next = {
            username: res.user.full_name || res.user.name,
            name: username.trim(),
            token: res.token,
            branch: branches[0], // default to the first branch
            branches,
            userId: res.user.id,
            permissions: res.permissions,
          };
        } else {
          next = await authenticate(username, password);
        }
        await storage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
        setQuickLoginRequired(false);
      },
      async quickSignIn(name, password) {
        // Re-authenticate after a 401, keeping the current branch if possible.
        const res = await login({ name: name.trim(), password });
        const branches = res.branches.map(toBranch);
        if (branches.length === 0) {
          throw new Error('No branch is assigned to this account.');
        }
        const branch = branches.find((b) => b.id === session?.branch.id) ?? branches[0];
        const next: Session = {
          username: res.user.full_name || res.user.name,
          name: name.trim(),
          token: res.token,
          branch,
          branches,
          userId: res.user.id,
          permissions: res.permissions,
        };
        await storage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
        setQuickLoginRequired(false);
      },
      async switchBranch(branch) {
        if (!session) return;
        const next = { ...session, branch };
        await storage.setItem(SESSION_KEY, JSON.stringify(next));
        setSession(next);
      },
      async signOut() {
        await logout();
        await storage.removeItem(SESSION_KEY);
        setSession(null);
        setQuickLoginRequired(false);
      },
    }),
    [session, isLoading, quickLoginRequired],
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const context = use(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
