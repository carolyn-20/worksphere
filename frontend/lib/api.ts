const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1';
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public requestId?: string, public current?: any, public details?: { path: string; message: string }[]) { super(message); }
}
// Trade-off: tokens in sessionStorage (simple, XSS-exposed). Production hardening: httpOnly cookies via Next route handlers.
const store = { get: (k: string) => (typeof window === 'undefined' ? null : sessionStorage.getItem(k)), set: (k: string, v: string) => sessionStorage.setItem(k, v), clear: () => sessionStorage.clear() };
export const setTokens = (a: string, r: string) => { store.set('access', a); store.set('refresh', r); };
export const hasSession = () => !!store.get('access');
export const logoutLocal = () => store.clear();
export function roleFromToken(): string | null {
  const t = store.get('access'); if (!t) return null;
  try { return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role; } catch { return null; }
}
async function raw(path: string, init: RequestInit) {
  return fetch(API + path, { ...init, headers: { 'Content-Type': 'application/json', ...(store.get('access') ? { Authorization: `Bearer ${store.get('access')}` } : {}), ...init.headers } });
}
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try { res = await raw(path, init); } catch { throw new ApiError(0, 'network', 'Cannot reach the server. Try again.'); }
  if (res.status === 401 && store.get('refresh') && !path.startsWith('/auth/')) {
    const r = await raw('/auth/refresh', { method: 'POST', body: JSON.stringify({ refresh_token: store.get('refresh') }) });
    if (r.ok) { const t = await r.json(); setTokens(t.access_token, t.refresh_token); res = await raw(path, init); }
    else { logoutLocal(); if (typeof window !== 'undefined') window.location.href = '/login'; }
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) { const e = body.error ?? {}; throw new ApiError(res.status, e.code ?? 'error', e.message ?? 'Request failed', e.request_id, e.current, e.details); }
  return body as T;
}
