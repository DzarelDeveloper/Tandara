/**
 * Tandara API Client Base
 * Prepared for future FastAPI backend integration on http://localhost:8000
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

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
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `HTTP Error ${response.status}`);
    }

    return await response.json();
  } catch (err: unknown) {
    // If fetch failed completely (network failure / connection refused), indicate backend disconnected
    if (err instanceof TypeError && err.message.includes('fetch')) {
      throw new BackendDisconnectedError();
    }
    throw err;
  }
}
