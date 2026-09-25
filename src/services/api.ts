/**
 * Tandara API Client Base
 * Prepared for future FastAPI backend integration on http://localhost:8000
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const ACCESS_TOKEN_KEY = 'tandara_access_token';

export class BackendDisconnectedError extends Error {
  constructor(message = 'Backend belum terhubung. Silakan periksa server lokal.') {
    super(message);
    this.name = 'BackendDisconnectedError';
  }
}

/**
 * Common fetch helper that throws BackendDisconnectedError when the FastAPI server is not responding.
 */
export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData?.detail;
      throw new Error(typeof detail === 'object' ? (detail.message || `HTTP Error ${response.status}`) : (detail || `HTTP Error ${response.status}`));
    }

    const payload = await response.json();
    return (payload?.data ?? payload) as T;
  } catch (err: unknown) {
    // If fetch failed completely (network failure / connection refused), indicate backend disconnected
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new BackendDisconnectedError();
    }
    throw err;
  }
}

export async function apiRequestBlob(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    const response = await fetch(url, { ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...options.headers } });
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const detail = errorData?.detail;
      throw new Error(typeof detail === 'object' ? (detail.message || `HTTP Error ${response.status}`) : (detail || `HTTP Error ${response.status}`));
    }
    return response;
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.includes('fetch')) throw new BackendDisconnectedError();
    throw err;
  }
}
