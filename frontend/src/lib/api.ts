/**
 * Small fetch wrapper for the API.
 * - The access token lives only in memory.
 * - The refresh token is an httpOnly cookie, sent with credentials: 'include'.
 * - On a 401, it refreshes the session once and retries the request.
 */
export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3000/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let onSessionExpired: (() => void) | null = null;

export const getAccessToken = () => accessToken;
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export const setSessionExpiredHandler = (handler: () => void) => {
  onSessionExpired = handler;
};

async function requestRefresh(): Promise<string | null> {
  try {
    const response = await fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' });
    if (!response.ok) return null;
    return ((await response.json()) as { accessToken: string }).accessToken;
  } catch {
    return null;
  }
}

/**
 * Exchanges the refresh cookie for a new access token. Concurrent calls in
 * this tab share one request, and tabs take turns through a Web Lock: the
 * refresh token rotates on every use, so two tabs refreshing at the same
 * time with the same cookie would sign one of them out.
 */
export function refreshAccessToken(): Promise<string | null> {
  refreshInFlight ??= (
    typeof navigator !== 'undefined' && 'locks' in navigator
      ? navigator.locks.request('auth-refresh', requestRefresh)
      : requestRefresh()
  )
    .then((token) => {
      accessToken = token;
      return token;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  /** Skip the automatic refresh-and-retry (used by login). */
  skipAuthRetry?: boolean;
}

/** Sends a request with the access token; on a 401 it refreshes the session once and retries. */
async function send(path: string, options: RequestOptions, accept?: string): Promise<Response> {
  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const attempt = () =>
    fetch(url, {
      method: options.method ?? 'GET',
      credentials: 'include',
      headers: {
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(accept ? { Accept: accept } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

  let response: Response;
  try {
    response = await attempt();
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  if (response.status === 401 && !options.skipAuthRetry) {
    if (await refreshAccessToken()) {
      response = await attempt();
    } else {
      onSessionExpired?.();
    }
  }

  if (!response.ok) throw await toApiError(response);
  return response;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await send(path, options);
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export interface DownloadedFile {
  blob: Blob;
  fileName: string;
  /** Value of the X-Report-Code header, when present. */
  code: string | null;
}

/** Fetches a file (e.g. a report) with the user's session. */
export async function apiDownload(path: string, query: RequestOptions['query'], fallbackName: string): Promise<DownloadedFile> {
  const response = await send(path, { query });
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const fileName = /filename="?([^";]+)"?/.exec(disposition)?.[1] ?? fallbackName;
  return { blob: await response.blob(), fileName, code: response.headers.get('X-Report-Code') };
}

/** Hands a downloaded file to the browser's save flow. */
export function saveFile({ blob, fileName }: DownloadedFile) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  // Give the browser time to start the download before releasing the file.
  setTimeout(() => URL.revokeObjectURL(href), 60_000);
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const body = (await response.json()) as { message?: string | string[]; code?: string };
    const message = Array.isArray(body.message) ? body.message.join('. ') : body.message;
    return new ApiError(response.status, message ?? defaultMessage(response.status), body.code);
  } catch {
    return new ApiError(response.status, defaultMessage(response.status));
  }
}

function defaultMessage(status: number): string {
  if (status === 403) return 'No tienes permiso para esta acción.';
  if (status === 404) return 'No se encontró lo que buscas.';
  if (status === 429) return 'Demasiados intentos. Espera un momento.';
  if (status >= 500) return 'Ocurrió un error en el servidor. Intenta de nuevo.';
  return 'No se pudo completar la acción.';
}
