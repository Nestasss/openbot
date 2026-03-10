const API_URL = (import.meta as any).env?.VITE_API_URL || 'https://api.notificbot.ru';

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; details?: any };

export function getApiUrl() {
  return API_URL;
}

export function getToken() {
  return localStorage.getItem('raka_token');
}

export function getRefreshToken() {
  return localStorage.getItem('raka_refresh');
}

export function setToken(token: string) {
  localStorage.setItem('raka_token', token);
}

export function setRefreshToken(token: string) {
  localStorage.setItem('raka_refresh', token);
}

export function clearToken() {
  localStorage.removeItem('raka_token');
  localStorage.removeItem('raka_refresh');
}

async function parseJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { ok: false, error: 'BAD_JSON', raw: text };
  }
}

let refreshing: Promise<{ ok: true; accessToken: string; refreshToken: string } | null> | null = null;

async function tryRefresh(): Promise<{ ok: true; accessToken: string; refreshToken: string } | null> {
  const rt = getRefreshToken();
  if (!rt) return null;

  // de-dupe concurrent refresh attempts
  if (refreshing) return refreshing;

  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const json = await parseJson(res);
      if (json?.ok && json.accessToken && json.refreshToken) {
        setToken(json.accessToken);
        setRefreshToken(json.refreshToken);
        return json;
      }
      // invalid refresh -> clear session
      if (!json?.ok) {
        clearToken();
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshing = null;
    }
  })();

  return refreshing;
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const doFetch = async () =>
    fetch(`${API_URL}${path}`, {
      ...init,
      headers,
    });

  let res = await doFetch();

  // If access token expired, try refresh once and retry.
  if (res.status === 401) {
    const ok = await tryRefresh();
    if (ok?.ok) {
      headers.Authorization = `Bearer ${getToken() || ''}`;
      res = await doFetch();
    }
  }

  const json = await parseJson(res);
  return json as T;
}
