// Thin fetch wrapper: adds the JWT, parses JSON, and turns failures into ApiError
// (with per-field messages from the server's validation layer).
import type { FieldErrors } from './types';

const TOKEN_KEY = 'sunpower_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  fields: FieldErrors;
  constructor(status: number, message: string, fields?: FieldErrors) {
    super(message);
    this.status = status;
    this.fields = fields || {};
  }
}

let onUnauthorized: () => void = () => {};
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn; };

interface ApiOptions {
  method?: string;
  body?: unknown;
  form?: FormData;
}

const TIMEOUT_MS = 30000;

/** Plain-language fallbacks for when the server gives no message of its own. */
const FRIENDLY: Record<number, string> = {
  400: 'Some details are not valid. Please check them and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: 'You do not have permission to do this.',
  404: 'We could not find what you asked for.',
  409: 'This clashes with something that already exists.',
  413: 'That is too large to send. Try something smaller.',
  422: 'We could not complete that. Please check the details and try again.',
  429: 'Too many attempts. Please wait a minute and try again.',
  502: 'The server is not reachable right now. Please try again shortly.',
  503: 'The server is busy or restarting. Please try again shortly.',
  504: 'The server took too long to answer. Please try again.',
};
const friendly = (status: number) => FRIENDLY[status] || (status >= 500 ? 'Something went wrong on our side. Please try again in a moment.' : 'The request could not be completed.');

/** Responses are JSON shaped by the server; call sites narrow them with the generic. */
export async function api<T = any>(path: string, { method = 'GET', body, form }: ApiOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method, headers, signal: ctl.signal, body: form || (body ? JSON.stringify(body) : undefined) });
  } catch (e: any) {
    throw new ApiError(0, e?.name === 'AbortError'
      ? 'The server took too long to answer. Please try again.'
      : (typeof navigator !== 'undefined' && navigator.onLine === false
        ? 'You appear to be offline. Check your internet connection and try again.'
        : 'Cannot reach the server. Check your connection and try again.'));
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 204) return null as T;
  const isJson = (res.headers.get('content-type') || '').includes('json');
  let data: any = null;
  try { data = isJson ? await res.json() : await res.text(); } catch { data = null; }
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    const serverMsg = data && typeof data === 'object' && typeof data.error === 'string' ? data.error : '';
    throw new ApiError(res.status, serverMsg || friendly(res.status), data && typeof data === 'object' ? data.fields : undefined);
  }
  return data as T;
}

export const get = <T = any>(p: string) => api<T>(p);
export const post = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'POST', body: body ?? {} });
export const put = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'PUT', body });
export const patch = <T = any>(p: string, body?: unknown) => api<T>(p, { method: 'PATCH', body });
export const del = <T = any>(p: string) => api<T>(p, { method: 'DELETE' });

/** Download an authenticated file (CSV export). */
export async function download(path: string, filename: string) {
  const res = await fetch(`/api${path}`, { headers: { Authorization: `Bearer ${tokenStore.get()}` } });
  if (!res.ok) throw new ApiError(res.status, 'Download failed');
  const url = URL.createObjectURL(await res.blob());
  const a = Object.assign(document.createElement('a'), { href: url, download: filename });
  a.click();
  URL.revokeObjectURL(url);
}

export const photoUrl = (u: string) => `${u}?token=${encodeURIComponent(tokenStore.get() || '')}`;
