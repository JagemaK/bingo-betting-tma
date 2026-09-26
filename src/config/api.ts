/**
 * Centralized API and Backend URL configuration.
 *
 * In Local Development:
 *   VITE_BACKEND_URL is http://localhost:3001 (or unset, defaulting to http://localhost:3001 in dev).
 *
 * In Cloudflare / Telegram Tunnel Testing:
 *   VITE_BACKEND_URL is https://belongs-reserve-descriptions-est.trycloudflare.com
 *   The phone connects directly to the public backend URL instead of localhost.
 */

function resolveBackendUrl(): string {
  // 1. Direct Vite env variable replacement (statically replaced by Vite at build/runtime)
  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  // 2. Query param override ONLY permitted in local development on loopback interfaces
  // (Prevents token/initData exfiltration attacks via crafted Mini App URLs)
  if (import.meta.env.DEV && typeof window !== 'undefined' && window.location?.search) {
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    if (isLocalhost) {
      const params = new URLSearchParams(window.location.search);
      const queryBackend = params.get('backend');
      if (queryBackend) {
        return queryBackend.trim().replace(/\/+$/, '');
      }
    }
  }

  // 3. If accessing via remote domain or tunnel (e.g. trycloudflare.com), use window.location.origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
      return window.location.origin;
    }
  }

  // 4. In dev mode without explicit VITE_BACKEND_URL on localhost, default to local backend on port 3001
  if (import.meta.env.DEV) {
    return 'http://localhost:3001';
  }

  // 5. In browser production / fallback, use window.location.origin
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'http://localhost:3001';
}

export const BACKEND_URL: string = resolveBackendUrl();

/**
 * Returns a fully qualified API endpoint URL for a given relative path.
 * Example: apiUrl('/api/auth/register-initiate') -> 'https://belongs-reserve-descriptions-est.trycloudflare.com/api/auth/register-initiate'
 */
export function apiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!BACKEND_URL) {
    return normalizedPath;
  }
  return `${BACKEND_URL}${normalizedPath}`;
}

export default {
  BACKEND_URL,
  apiUrl
};
