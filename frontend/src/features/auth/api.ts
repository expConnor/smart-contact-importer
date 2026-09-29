import { ApiError, request } from '@/shared/api/client';

export type User = { id: string; email: string };

export type Credentials = { email: string; password: string };

// 401 is an answer here, not a failure: nobody is logged in.
export async function getMe(): Promise<User | null> {
  try {
    return await request<User>('GET', '/me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function login(credentials: Credentials): Promise<User> {
  return request<User>('POST', '/auth/login', credentials);
}

export function logout(): Promise<void> {
  return request<void>('POST', '/auth/logout');
}
