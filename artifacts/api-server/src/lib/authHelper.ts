/**
 * Shared JWT auth helpers for account-protected routes.
 */

import jwt from 'jsonwebtoken';
import type { Request, Response } from 'express';

export interface TokenPayload {
  tier: string;
  customerId: string;
  product: 'optimizer' | 'optimizer-pro';
}

/**
 * Verifies the `Authorization: Bearer <token>` header and returns the payload.
 * Returns null and sends a 401 if the token is missing, invalid, or expired.
 */
export function requireAuth(
  req: Request,
  res: Response,
): TokenPayload | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    res.status(500).json({ error: 'Server misconfiguration.' });
    return null;
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required.', authRequired: true });
    return null;
  }

  try {
    const payload = jwt.verify(auth.slice(7), secret) as TokenPayload;
    if (payload.tier !== 'paid' || !payload.customerId) {
      res.status(403).json({ error: 'Subscription required.' });
      return null;
    }
    return payload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Session expired. Please sign in again.', tokenExpired: true, authRequired: true });
      return null;
    }
    res.status(401).json({ error: 'Invalid token.', authRequired: true });
    return null;
  }
}

/**
 * Issues a 30-day signed JWT for a paid subscriber.
 */
export function issueToken(payload: TokenPayload): string {
  const secret = process.env.SESSION_SECRET!;
  return jwt.sign(payload, secret, { expiresIn: '30d' });
}
