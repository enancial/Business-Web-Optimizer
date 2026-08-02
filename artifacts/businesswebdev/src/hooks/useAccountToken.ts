import { useState, useEffect } from 'react';

export const SCAN_TOKEN_KEY = 'bwo_scan_token';

export interface TokenInfo {
  raw: string;
  customerId: string;
  product: 'optimizer' | 'optimizer-pro';
  tier: string;
  exp: number; // Unix timestamp seconds
  isExpired: boolean;
  isValid: boolean;
}

function parseJwt(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function useAccountToken() {
  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  const [loaded, setLoaded] = useState(false);

  function refresh() {
    const raw = localStorage.getItem(SCAN_TOKEN_KEY);
    if (!raw) {
      setTokenInfo(null);
      setLoaded(true);
      return;
    }
    const payload = parseJwt(raw);
    if (!payload || typeof payload.exp !== 'number') {
      setTokenInfo(null);
      setLoaded(true);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    setTokenInfo({
      raw,
      customerId: String(payload.customerId ?? ''),
      product: (payload.product as 'optimizer' | 'optimizer-pro') ?? 'optimizer',
      tier: String(payload.tier ?? ''),
      exp: payload.exp,
      isExpired: payload.exp < now,
      isValid: payload.tier === 'paid' && payload.exp >= now && Boolean(payload.customerId),
    });
    setLoaded(true);
  }

  useEffect(() => {
    refresh();
    // Re-check on storage events (e.g. from other tabs)
    const handler = () => refresh();
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  function saveToken(raw: string) {
    localStorage.setItem(SCAN_TOKEN_KEY, raw);
    refresh();
  }

  function clearToken() {
    localStorage.removeItem(SCAN_TOKEN_KEY);
    setTokenInfo(null);
  }

  return { tokenInfo, loaded, saveToken, clearToken, refresh };
}
