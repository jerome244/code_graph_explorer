// Minimal JWT helper for DRF SimpleJWT on the client

export function getTokens() {
  if (typeof window === 'undefined') return { access: null as string | null, refresh: null as string | null };
  // Support both possible keys
  const access = localStorage.getItem('accessToken');
  const refresh = localStorage.getItem('refreshToken') || localStorage.getItem('refresh');
  return { access, refresh };
}

export function setAccessToken(access: string) {
  if (typeof window !== 'undefined') localStorage.setItem('accessToken', access);
}

export function clearTokens() {
  if (typeof window !== 'undefined') {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('refresh');
  }
}

// POST /api/auth/refresh with the refresh token and store new access
export async function refreshAccessToken(apiBase: string) {
  const { refresh } = getTokens();
  if (!refresh) return null;

  const res = await fetch(`${apiBase}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh }),
  });

  if (!res.ok) {
    clearTokens();
    return null;
  }

  const data = await res.json();
  if (data?.access) {
    setAccessToken(data.access);
    return data.access as string;
  }
  return null;
}

/**
 * apiFetch: attaches Authorization header if present, and on 401 with
 * token_not_valid it will try to refresh and retry once automatically.
 */
export async function apiFetch(input: string, init: RequestInit = {}, retry = true) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const { access } = getTokens();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string> | undefined),
    ...(access ? { Authorization: `Bearer ${access}` } : {}),
  };

  let res = await fetch(input, { ...init, headers });

  if (res.status === 401) {
    // try to detect SimpleJWT's error payload
    let code: string | undefined;
    try {
      const clone = res.clone();
      const body = await clone.json();
      code = body?.code;
    } catch {
      // non-JSON; ignore
    }

    if (code === 'token_not_valid' && retry) {
      const newAccess = await refreshAccessToken(API_BASE);
      if (newAccess) {
        const headers2 = {
          ...headers,
          Authorization: `Bearer ${newAccess}`,
        };
        res = await fetch(input, { ...init, headers: headers2 });
      } else {
        // refresh failed; log out locally
        clearTokens();
      }
    }
  }

  return res;
}
