import { api } from '@/api/client';
import { tokenStore } from '@/auth/tokenStore';

export type LoginPayload = {
  name: string;
  password: string;
};

export type AuthUser = {
  id: number;
  name: string;
  full_name: string;
  email: string;
  position_id?: string;
  positions?: { id: number; name: string };
};

export type ApiBranch = {
  id: number;
  branch_name: string;
  address: string;
  logo: string;
};

export type LoginResponse = {
  message: string;
  token: string;
  user: AuthUser;
  branches: ApiBranch[];
  permissions: string[];
};

/** POST /login (relative to /api/v1/staff) — authenticates and persists the token. */
export async function login(payload: LoginPayload): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>('/login', payload);
  await tokenStore.set(data.token);
  return data;
}

/** Clears the stored token. */
export async function logout(): Promise<void> {
  await tokenStore.clear();
}
