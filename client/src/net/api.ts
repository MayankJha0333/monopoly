import type { LeaderRow, PublicUser } from '@shared/progress';

export class ApiError extends Error {
  constructor(message: string, readonly field?: string, readonly status = 0) { super(message); }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; field?: string };
  if (!res.ok) throw new ApiError(data.error ?? 'Something went wrong. Try again.', data.field, res.status);
  return data as T;
}

type UserReply = { user: PublicUser | null };

export const api = {
  me: () => call<UserReply>('/me'),
  guest: (p: { name?: string; token?: string; color?: string }) => call<UserReply>('/auth/guest', 'POST', p),
  signup: (p: { username: string; email: string; password: string }) => call<UserReply>('/auth/signup', 'POST', p),
  login: (p: { login: string; password: string }) => call<UserReply>('/auth/login', 'POST', p),
  logout: () => call<{ ok: boolean }>('/auth/logout', 'POST', {}),
  updateMe: (p: { name?: string; token?: string; color?: string }) => call<UserReply>('/me', 'PATCH', p),
  leaderboard: () => call<{ rows: LeaderRow[] }>('/leaderboard'),
};
