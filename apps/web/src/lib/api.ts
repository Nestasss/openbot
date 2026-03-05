const API_URL = (import.meta as any).env?.VITE_API_URL || 'https://api.notificbot.ru';

export type ApiOk<T> = { ok: true } & T;
export type ApiErr = { ok: false; error: string; details?: any };

export function getApiUrl() {
  return API_URL;
}

export function getToken() {
  return localStorage.getItem('raka_token');
}

export function setToken(token: string) {
  localStorage.setItem('raka_token', token);
}

export function clearToken() {
  localStorage.removeItem('raka_token');
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(init.headers as any),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { ok: false, error: 'BAD_JSON', raw: text };
  }

  return json as T;
}
