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

export class ApiError extends Error {
  code?: string;
  status: number;
  telemetry?: Record<string, unknown>;
  data?: Record<string, unknown>;

  constructor(message: string, status: number, code?: string, telemetry?: Record<string, unknown>, data?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.telemetry = telemetry;
    this.data = data;
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
      const message = errorData?.message || (typeof detail === 'object' ? detail.message : detail) || (response.status === 401 ? 'Sesi login tidak valid atau telah berakhir.' : response.status === 403 ? 'Anda tidak memiliki izin untuk aksi ini.' : `HTTP Error ${response.status}`);
      const telemetry = errorData?.telemetry || (typeof detail === 'object' ? detail?.telemetry : undefined);
      const data = errorData?.data || (typeof detail === 'object' ? detail?.data : undefined);
      throw new ApiError(message, response.status, errorData?.code || detail?.code, telemetry, data);
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
      const message = errorData?.message || (typeof detail === 'object' ? detail.message : detail) || (response.status === 401 ? 'Sesi login tidak valid atau telah berakhir.' : response.status === 403 ? 'Anda tidak memiliki izin untuk aksi ini.' : `HTTP Error ${response.status}`);
      const telemetry = errorData?.telemetry || (typeof detail === 'object' ? detail?.telemetry : undefined);
      const data = errorData?.data || (typeof detail === 'object' ? detail?.data : undefined);
      throw new ApiError(message, response.status, errorData?.code || detail?.code, telemetry, data);
    }
    return response;
  } catch (err: unknown) {
    if (err instanceof TypeError && err.message.includes('fetch')) throw new BackendDisconnectedError();
    throw err;
  }
}
