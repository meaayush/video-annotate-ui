const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

if (!BASE_URL) {
  throw new Error('VITE_API_BASE_URL is not set. Check your .env file.');
}

/**
 * Thin wrapper around fetch with the API base URL baked in.
 * Swap this out for axios/ky if you need interceptors later.
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${res.statusText} – ${body}`);
  }

  return res.json() as Promise<T>;
}
